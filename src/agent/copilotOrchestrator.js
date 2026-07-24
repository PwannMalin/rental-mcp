export class CopilotOrchestrator {
    constructor({ registry, llm, memory }) {
        this.registry = registry;
        this.llm = llm;
        this.memory = memory;
        this.maxSteps = 10;

        // Session state
        this.activeRequest = null;
        this.pendingRequestSelection = null;
        this.pendingCustomerSelection = null;
    }

    getSessionKey(context) {
        return `${context.userId || 'nouser'}_${context.tenantId || 'notenant'}`;
    }

    getRowsFromToolResult(result) {
        return (
            result?.data?.rows ||
            result?.data?.preview ||
            result?.rows ||
            result?.preview ||
            result?.data?.data?.value ||
            result?.data?.value ||
            result?.value ||
            []
        );
    }

    getCleanValue(value = "") {
        return String(value || "").trim();
    }

    getRequestId(row = {}) {
        return (
            row.RequestID ||
            row.RequestId ||
            row.requestID ||
            row.requestId ||
            null
        );
    }

    rememberActiveRequest(result, args, context) {
        const rows = this.getRowsFromToolResult(result);

        if (!rows.length) {
            this.activeRequest = null;
            this.pendingRequestSelection = null;
            return;
        }

        if (rows.length === 1) {
            const row = rows[0];
            this.activeRequest = {
                RequestID: this.getRequestId(row),
                Customer: this.getCleanValue(row.Customer || row.CustomerNumber),
                CustomerNumber: this.getCleanValue(row.CustomerNumber || row.Customer),
                Branch: this.getCleanValue(row.Branch),
                RequestStatus: this.getCleanValue(row.Status || row.RequestStatus),
                ContactName: this.getCleanValue(row.ContactName || row.Contact)
            };
            this.pendingRequestSelection = null;
            console.log("ACTIVE REQUEST SET:", JSON.stringify(this.activeRequest, null, 2));
        } else {
            this.pendingRequestSelection = {
                options: rows.map(row => ({
                    RequestID: this.getRequestId(row),
                    Customer: this.getCleanValue(row.Customer || row.CustomerNumber),
                    CustomerNumber: this.getCleanValue(row.CustomerNumber || row.Customer),
                    Branch: this.getCleanValue(row.Branch),
                    RequestStatus: this.getCleanValue(row.Status || row.RequestStatus),
                    ContactName: this.getCleanValue(row.ContactName || row.Contact)
                }))
            };
            this.activeRequest = null;
        }
    }

    async tryResolvePendingCustomerSelection(userInput, context, ui) {
        if (!this.pendingCustomerSelection) {
            return null;
        }

        const value = this.getCleanValue(userInput);

        const match = this.pendingCustomerSelection.options.find(
            (c, index) =>
                c.CustomerNumber === value ||
                c.Branch?.toLowerCase() === value.toLowerCase() ||
                parseInt(value) === index + 1
        );

        if (!match) {
            return null;
        }

        this.pendingCustomerSelection = null;

        const result = await this.registry.execute(
            "search.execute",
            {
                type: "RENTAL",
                filterQuery: `Customer eq '${match.CustomerNumber}'`,
                topCount: 10
            },
            context
        );

        if (result?.success) {
            this.rememberActiveRequest(
                result,
                {
                    type: "RENTAL",
                    filterQuery: `Customer eq '${match.CustomerNumber}'`,
                    topCount: 10
                },
                context
            );
        }

        return result;
    }

    async tryResolvePendingRequestAction(userInput, context, ui) {
        if (!this.activeRequest) {
            return null;
        }

        const userText = this.getCleanValue(userInput).toLowerCase();

        const requestLineKeywords = [
            "request lines",
            "rental request lines",
            "lines",
            "show me the lines",
            "show lines",
            "can i get the rental request lines",
            "request details",
            "details",
            "yes more details",
            "what equipment",
            "equipment"
        ];

        if (requestLineKeywords.some(keyword => userText.includes(keyword))) {
            const filterQuery = `RequestID eq ${this.activeRequest.RequestID}`;

            await ui.update(`Fetching request lines for RequestID ${this.activeRequest.RequestID}...`);

            const result = await this.registry.execute(
                "search.execute",
                {
                    type: "REQUEST_LINES",
                    filterQuery,
                    topCount: 10
                },
                context
            );

            const rows = this.getRowsFromToolResult(result);

            return {
                success: true,
                answer: rows.length
                    ? `Found ${rows.length} request line(s) for RequestID ${this.activeRequest.RequestID}:\n\n` +
                      rows
                          .map((row, index) => {
                              const description =
                                  row.Line_Description ||
                                  row.Description ||
                                  row.EquipModel ||
                                  row.Model ||
                                  row.ItemDescription ||
                                  "No description";

                              const quantity =
                                  row.Quantity ||
                                  row.Qty ||
                                  row.RequestedQuantity ||
                                  "";

                              return `${index + 1}. ${description}${
                                  quantity ? ` — Qty: ${quantity}` : ""
                              }`;
                          })
                          .join("\n")
                    : `I found RequestID ${this.activeRequest.RequestID}, but I did not find any request lines for it.`
            };
        }

        return null;
    }

    async runStreaming(userInput, context = {}, ui) {
        // 1. Resolve pending customer selection
        const selectionResult = await this.tryResolvePendingCustomerSelection(
            userInput,
            context,
            ui
        );
        if (selectionResult) {
            return selectionResult;
        }

        // 2. Resolve pending request actions (e.g. "show lines")
        const requestActionResult = await this.tryResolvePendingRequestAction(
            userInput,
            context,
            ui
        );
        if (requestActionResult) {
            return requestActionResult;
        }

        const { userId, tenantId } = context;

        let messages = this.buildSystemPrompt(userId, tenantId);
        messages.push({ role: "user", content: userInput });

        let lastToolResult = null;

        for (let step = 0; step < this.maxSteps; step++) {
            await ui.typing();

            try {
                const response = await this.llm.chat.completions.create({
                    model: process.env.AZURE_OPENAI_DEPLOYMENT,
                    messages,
                    tools: this.buildTools(),
                    tool_choice: "auto",
                    temperature: 0.3
                });

                const msg = response.choices[0].message;

                console.log("========== LLM RESPONSE ==========");
                console.log("content:", msg.content);
                console.log("tool calls:", JSON.stringify(msg.tool_calls, null, 2));
                console.log("==================================");

                // Final answer
                if (msg.content && !msg.tool_calls?.length) {
                    await ui.update("Finalizing response...");
                    let answer = msg.content;

                    if (
                        answer.toLowerCase().includes("unable to search") ||
                        answer.toLowerCase().includes("no customer")
                    ) {
                        answer = "I couldn't find matching customer data at the moment. " + answer;
                    }

                    return { success: true, answer };
                }

                // Tool calls
                if (msg.tool_calls?.length) {
                    messages.push(msg);

                    for (const call of msg.tool_calls) {
                        const toolName = call.function.name;
                        await ui.update(`Using: ${toolName}`);

                        let args = {};
                        try {
                            args = JSON.parse(call.function.arguments || "{}");
                        } catch (e) {}

                        let result;

                        try {
                            console.log("Calling tool:", toolName);
                            console.log("Arguments:", args);

                            result = await this.registry.execute(toolName, args, context);

                            const looksLikeRentalResult =
                                result?.data?.searchType === "RENTAL" ||
                                result?.searchType === "RENTAL";

                            if (looksLikeRentalResult && result.success) {
                                this.rememberActiveRequest(result, args, context);
                            }

                            // Handle customer selection response from tool
                            if (result?.requiresSelection && result?.options?.length) {
                                this.pendingCustomerSelection = {
                                    options: result.options.map(c => ({
                                        CustomerNumber: c.customerNumber || c.CustomerNumber,
                                        Branch: c.branch || c.Branch,
                                        customerName: c.customerName || c.CustomerName
                                    }))
                                };

                                return {
                                    success: true,
                                    answer:
                                        "Multiple customer locations found.\n\n" +
                                        result.options
                                            .map(
                                                (c, i) =>
                                                    `${i + 1}. ${c.customerName || c.CustomerName} (${c.branch || c.Branch})`
                                            )
                                            .join("\n"),
                                    awaitingCustomerSelection: true,
                                    options: result.options
                                };
                            }

                            console.log("TOOL RESULT:", JSON.stringify(result, null, 2));
                        } catch (toolErr) {
                            console.error(`Tool ${toolName} failed:`, toolErr.message);
                            result = {
                                success: false,
                                error: toolErr.message,
                                message: `The ${toolName} tool encountered an issue.`
                            };
                        }

                        lastToolResult = result;

                        messages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: JSON.stringify(result)
                        });

                        await ui.update(`Completed: ${toolName}`);
                    }
                }
            } catch (err) {
                console.error(`Error in step ${step}:`, err);
                return {
                    success: false,
                    answer: `ERROR: ${err.message}`
                };
            }
        }

        return {
            success: false,
            answer: "I couldn't complete the request after several attempts."
        };
    }

    buildTools() {
        const tools = this.registry?.tools || {};
        const toolList =
            tools instanceof Map ? Array.from(tools.values()) : Object.values(tools);

        const builtTools = toolList.map(t => ({
            type: "function",
            function: {
                name: t.name,
                description: t.description || "No description provided",
                parameters:
                    t.parameters ||
                    t.inputSchema ||
                    t.schema || {
                        type: "object",
                        properties: {}
                    }
            }
        }));

        console.log(
            "TOOLS EXPOSED TO GPT:",
            builtTools.map(t => t.function.name)
        );

        return builtTools;
    }

    buildSystemPrompt(userId, tenantId) {
        const memory = this.memory?.get?.(userId, tenantId) || {
            customers: [],
            rentals: [],
            lastActions: []
        };

        return [
            {
                role: "system",
                content: `
You are the Internal Rental MCP Assistant for Malin.

Your job is to help coordinators search customers, rentals, request headers, and request lines.

### Critical Business Rules

1. Never search RENTAL by CustomerName.
2. When a user provides a customer name:
   - First search CUSTOMER
   - Extract CustomerNumber
   - Then search RENTAL using: Customer eq '<CustomerNumber>'
3. If multiple customer locations are returned, present them and wait for the user to choose.
4. Once a customer is selected, continue the rental search automatically.

### GitHub Tool Rules
- Do NOT use GitHub tools during normal rental conversations.
- Only use GitHub tools when the user explicitly asks to modify code, create a branch, or open a PR.

### Response Style
- Be concise and professional.
- Never invent data.
- Prefer using tools over guessing.
`
            }
        ];
    }
}