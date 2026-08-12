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

        // Schema memory
        this.discoveredSchemas = {
            CUSTOMER: null,
            RENTAL: null,
            REQUEST_LINES: null,
            EQUIPMENT: null
        };

        this.lastAgentQuestion = null;
        this.lastSearchResults = null;
        this.lastSearchType = null;
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

    showRemainingResults() {
        if (!this.lastSearchResults || this.lastSearchResults.length <= 1) {
            return {
                success: true,
                answer: "I don't have additional results to show."
            };
        }

        const remaining = this.lastSearchResults.slice(1); // skip the first one already shown

        const lines = remaining.map((row, i) => {
            // Format according to the type (EQUIPMENT example)
            return `${i + 2}. ${row.Model || row.EquipModel || "—"} — Serial: ${row.Serial || row.SerialNumber || "—"} — Branch: ${row.Branch || "—"}`;
        }).join("\n");

        // Clear the pending question
        this.lastAgentQuestion = null;

        return {
            success: true,
            answer: `Here are the remaining ${remaining.length} record(s):\n\n${lines}`
        };
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

    /**
     * Capture field names from the first row of a successful search
     */
    captureSchema(type, result) {
        const rows = this.getRowsFromToolResult(result);
        if (!rows.length) return;

        const firstRow = rows[0];
        const fields = Object.keys(firstRow);

        if (fields.length > 0) {
            this.discoveredSchemas[type] = fields;
            console.log(`SCHEMA CAPTURED for ${type}:`, fields);
        }
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
    if (!this.pendingCustomerSelection?.options?.length) {
        return null;
    }

    const value = this.getCleanValue(userInput);

    const match = this.pendingCustomerSelection.options.find((c, index) => {
        const customerNumber = this.getCleanValue(c.CustomerNumber);
        const branch = this.getCleanValue(c.Branch).toLowerCase();

        return (
            customerNumber === value ||
            branch === value.toLowerCase() ||
            parseInt(value) === index + 1
        );
    });

    if (!match) {
        console.log("No match found for pending customer selection:", value);
        return null;
    }

    // Clear only after successful match
    this.pendingCustomerSelection = null;

    console.log("Matched customer:", match);

    const result = await this.registry.execute(
        "search.execute",
        {
            type: "RENTAL",
            filterQuery: `Customer eq '${match.CustomerNumber}'`,
            topCount: 50
        },
        context
    );

    const rows = this.getRowsFromToolResult(result);

    if (!rows.length) {
        return {
            success: true,
            answer: `I found customer ${match.CustomerNumber} (${match.Branch || match.customerName}), but there are currently no open rental requests for this customer.`
        };
    }

    if (result?.success) {
        this.rememberActiveRequest(result, {
            type: "RENTAL",
            filterQuery: `Customer eq '${match.CustomerNumber}'`,
            topCount: 50
        }, context);

        this.captureSchema("RENTAL", result);
    }

    const requestList = rows.map((row, index) => {
        const id = this.getRequestId(row);
        const status = this.getCleanValue(row.RequestStatus || row.Status);
        const contact = this.getCleanValue(row.ContactName || row.Contact);
        return `${index + 1}. RequestID ${id} — Status: ${status}${contact ? ` — Contact: ${contact}` : ""}`;
    }).join("\n");

    return {
        success: true,
        answer: `Found ${rows.length} rental request(s) for customer ${match.CustomerNumber} (${match.Branch || match.customerName}):\n\n${requestList}\n\nYou can say "show request lines" or "details" for more information.`
    };
}

async tryResolvePendingRequestAction(userInput, context, ui) {
    if (!this.activeRequest) {
        return null;
    }

    const userText = this.getCleanValue(userInput).toLowerCase();

    // Broader set of keywords
    const showLinesKeywords = [
        "request lines",
        "rental request lines",
        "show me the lines",
        "show lines",
        "show request lines",
        "can i get the rental request lines",
        "request details",
        "show the full line",
        "full line",
        "more details on the line",
        "expand the line",
        "show everything on the line",
        "full equipment info",
        "full equipment",
        "equipment info",
        "what model",
        "model",
        "details",
        "more details",
        "full details",
        "serial",
        "capacity",
        "oach",
        "qty",
        "quantity"
    ];

    const isLineNumber = /^\d+$/.test(userText);

    const wantsLines =
        showLinesKeywords.some(keyword => userText.includes(keyword)) ||
        isLineNumber;

    if (!wantsLines) {
        return null;
    }

    // Re-use already fetched lines
    if (this.activeRequest.lines && this.activeRequest.lines.length > 0) {
        return this.formatRequestLinesAnswer(this.activeRequest.lines, userText);
    }

    // Otherwise fetch them
    const filterQuery = `RequestID eq ${this.activeRequest.RequestID}`;

    await ui.update(`Fetching request lines for RequestID ${this.activeRequest.RequestID}...`);

    const result = await this.registry.execute(
        "search.execute",
        {
            type: "REQUEST_LINES",
            filterQuery,
            topCount: 50
        },
        context
    );

    this.captureSchema("REQUEST_LINES", result);

    const rows = this.getRowsFromToolResult(result);
    this.activeRequest.lines = rows;

    return this.formatRequestLinesAnswer(rows, userText);
}

formatRequestLinesAnswer(rows, userText = "") {
    if (!rows || rows.length === 0) {
        return {
            success: true,
            answer: `I found RequestID ${this.activeRequest.RequestID}, but there are no request lines for it.`
        };
    }

    const wantsFull =
        userText.includes("full") ||
        userText.includes("more details") ||
        userText.includes("expand") ||
        userText.includes("everything") ||
        userText.includes("serial") ||
        userText.includes("info") ||
        userText.includes("model") ||
        userText.includes("capacity") ||
        userText.includes("oach");

    const lineNumber = parseInt(userText, 10);
    let linesToShow = rows;

    if (!isNaN(lineNumber) && lineNumber >= 1 && lineNumber <= rows.length) {
        linesToShow = [rows[lineNumber - 1]];
    }

    const linesText = linesToShow.map((row, index) => {
        const displayIndex = linesToShow.length === 1 ? (lineNumber || 1) : index + 1;

        const model = row.EquipModel || row.Model || "—";
        const qty = row.RequestedQty || row.Quantity || row.Qty || "—";
        const oach = row.OACH || "—";
        const capacity = row.Capacity || "—";
        const series = row.EquipSeries || "";
        const group = row.EquipGroup || "";
        const comments = row.comments || row.Comments || "";

        if (wantsFull || linesToShow.length === 1) {
            return (
                `${displayIndex}. ${model}\n` +
                `Group: ${group} | Series: ${series}\n` +
                `Qty: ${qty} | OACH: ${oach} | Capacity: ${capacity} lbs` +
                (comments ? `\nNotes: ${comments.trim()}` : "")
            );
        }

        return `${displayIndex}. ${model} — Qty: ${qty} — OACH: ${oach} — Capacity: ${capacity} lbs`;
    }).join("\n\n");

    return {
        success: true,
        answer: `Found ${rows.length} request line(s) for RequestID ${this.activeRequest.RequestID}:\n\n${linesText}`
    };
}

   

    async runStreaming(userInput, context = {}, ui) {
        // Load conversation state from memory
        const sessionKey = this.getSessionKey(context);
        const savedState = this.memory?.get?.(sessionKey) || {};

        this.activeRequest = savedState.activeRequest || this.activeRequest;
        this.pendingRequestSelection = savedState.pendingRequestSelection || this.pendingRequestSelection;
        this.pendingCustomerSelection = savedState.pendingCustomerSelection || this.pendingCustomerSelection;
        this.lastAgentQuestion = savedState.lastAgentQuestion || this.lastAgentQuestion;
        this.lastSearchResults = savedState.lastSearchResults || this.lastSearchResults;
        this.lastSearchType = savedState.lastSearchType || this.lastSearchType;

        // 1. Resolve pending customer selection
        const affirmative = ["yes", "yeah", "yep", "sure", "ok", "okay", "please", "the other ones", "show the rest", "more"];
        const userText = this.getCleanValue(userInput).toLowerCase();

        if (affirmative.includes(userText) && this.lastSearchResults?.length > 1) {
            // User is answering the previous "would you like the others?" question
            return this.showRemainingResults();
        }

        // Clear active request if the user is starting a completely new search
        const clearKeywords = ["new search", "search equipment", "search for", "find equipment", "lookup equipment"];
        if (clearKeywords.some(k => userInput.toLowerCase().includes(k))) {
            this.activeRequest = null;
            this.pendingCustomerSelection = null;
        }

        const selectionResult = await this.tryResolvePendingCustomerSelection(
            userInput,
            context,
            ui
        );
        if (selectionResult) {
            return selectionResult;
        }

        // 2. Resolve pending request actions
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

                    // Save conversation state before returning
                    await this.memory?.set?.(sessionKey, {
                        activeRequest: this.activeRequest,
                        pendingRequestSelection: this.pendingRequestSelection,
                        pendingCustomerSelection: this.pendingCustomerSelection,
                        lastAgentQuestion: this.lastAgentQuestion,
                        lastSearchResults: this.lastSearchResults,
                        lastSearchType: this.lastSearchType
                    });

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
                        } catch (e) {
                            args = {};
                        }

                        // Normalize common LLM argument aliases
                        if (toolName === "search.execute") {
                            args.type = String(
                                args.type ||
                                args.searchType ||
                                args.SearchType ||
                                ""
                            ).trim().toUpperCase();

                            args.SearchTerm =
                                args.SearchTerm ||
                                args.searchTerm ||
                                args.searchText ||
                                args.SearchText ||
                                args.query ||
                                "";
                        }

                        let result;

                        try {
                            console.log("Calling tool:", toolName);
                            console.log("Arguments:", args);

                            result = await this.registry.execute(toolName, args, context);

                            // Capture schema
                            if (result?.success) {
                                const type = String(args?.type || "").toUpperCase();
                                if (type && this.discoveredSchemas.hasOwnProperty(type)) {
                                    this.captureSchema(type, result);
                                }
                            }

                            const normalizedType = String(args?.type || "").toUpperCase();
                            const rows = this.getRowsFromToolResult(result);

                            // Save last search results and type if this is a search.execute
                            if (toolName === "search.execute" && result?.success) {
                                this.lastSearchResults = rows;
                                this.lastSearchType = normalizedType;
                            }

                            // === MULTI CUSTOMER HANDLING WITH REQUEST COUNTS ===
                            if (
                                toolName === "search.execute" &&
                                normalizedType === "CUSTOMER" &&
                                rows.length > 1
                            ) {
                                const customersToCheck = rows.slice(0, 10);

                                this.pendingCustomerSelection = {
                                    options: customersToCheck.map(row => ({
                                        CustomerNumber: this.getCleanValue(row.CustomerNumber || row.customerNumber),
                                        Branch: this.getCleanValue(row.Branch || row.branch),
                                        customerName: this.getCleanValue(
                                            row.CustomerName ||
                                            row.customerName ||
                                            row.Name ||
                                            row.name
                                        )
                                    }))
                                };

                                console.log(
                                    "PENDING CUSTOMER SELECTION SET:",
                                    JSON.stringify(this.pendingCustomerSelection, null, 2)
                                );

                                // Enrich with request counts
                                const enrichedOptions = [];

                                for (const customer of this.pendingCustomerSelection.options) {
                                    try {
                                        const rentalResult = await this.registry.execute(
                                            "search.execute",
                                            {
                                                type: "RENTAL",
                                                filterQuery: `Customer eq '${customer.CustomerNumber}'`,
                                                topCount: 100
                                            },
                                            context
                                        );

                                        const rentalRows = this.getRowsFromToolResult(rentalResult);

                                        enrichedOptions.push({
                                            ...customer,
                                            requestCount: rentalRows.length
                                        });
                                    } catch (err) {
                                        console.error(`Failed to get request count for ${customer.CustomerNumber}:`, err.message);
                                        enrichedOptions.push({
                                            ...customer,
                                            requestCount: "?"
                                        });
                                    }
                                }

                                // Filter to only show customers with requests > 0
                                const customersWithRequests = enrichedOptions.filter(c => c.requestCount > 0);

                                if (customersWithRequests.length === 0) {
                                    return {
                                        success: true,
                                        answer: `No customers matching your search have any active rental requests. All ${enrichedOptions.length} found customers have 0 requests.\n\nWould you like to search for something else or view all customers including those without requests?`,
                                        awaitingCustomerSelection: false,
                                        options: []
                                    };
                                }

                                const answerLines = customersWithRequests.map((c, i) => {
                                    return `${i + 1}. ${c.customerName} — Branch: ${c.Branch} — Customer #: ${c.CustomerNumber} — Requests: ${c.requestCount}`;
                                });

                                return {
                                    success: true,
                                    answer:
                                        `Found ${customersWithRequests.length} customers (out of ${enrichedOptions.length} total) matching your search with active rental requests:\n\n` +
                                        answerLines.join("\n") +
                                        `\n\nPlease reply with the number or Customer # you want to continue with.`,
                                    awaitingCustomerSelection: true,
                                    options: customersWithRequests
                                };
                            }

                            // Remember active rental request
                            const looksLikeRentalResult =
                                result?.data?.searchType === "RENTAL" ||
                                result?.searchType === "RENTAL" ||
                                normalizedType === "RENTAL";

                            if (looksLikeRentalResult && result.success) {
                                this.rememberActiveRequest(result, args, context);
                            }

                            console.log(
                                "ACTIVE REQUEST AFTER TOOL:",
                                JSON.stringify(this.activeRequest, null, 2)
                            );

                            // Handle older tools that return requiresSelection
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
        lastActions: [],
        context: {}
    };

    const lastDomain = memory.context?.lastSearchDomain || "none";
    const lastParams = memory.context?.lastSearchParams || {};

    return [
        {
            role: "system",
            content: `
You are a helpful internal Rental Assistant.

### Critical Tool Rules
- Always include the "type" parameter when calling search.execute.
- Valid types: CUSTOMER, RENTAL, REQUEST_LINES, EQUIPMENT
- Correct: { "type": "CUSTOMER", "filterQuery": "contains(CustomerName,'Clampitt')" }
- Incorrect: { "filterQuery": "contains(CustomerName,'Clampitt')" }

### Business Rules
- Customer name only → search CUSTOMER first
- Customer number → search RENTAL using CustomerNumber
- Equipment serial / series / model → search EQUIPMENT or REQUEST_LINES
- Never search RENTAL using CustomerName

### Conversation Context (very important)
- Current last search domain: ${lastDomain}
- Last search parameters: ${JSON.stringify(lastParams)}
- Keep the same domain unless the user clearly changes topic.
- Example: if previous turn was about equipment and user says "oh chargers", stay in EQUIPMENT domain.
- Do not switch domains on short ambiguous replies.

### Memory
Recent customers: ${JSON.stringify(memory.customers.slice(0, 4))}
Recent rentals: ${JSON.stringify(memory.rentals.slice(0, 4))}
Recent actions: ${JSON.stringify(memory.lastActions.slice(0, 4))}

### Response Rules
- Be concise and specific.
- When no results are found, say what you searched and suggest a next step.
- Avoid repeating the exact same search.
- Ask clarifying questions when the request is ambiguous.
            `.trim()
        }
    ];
}}
