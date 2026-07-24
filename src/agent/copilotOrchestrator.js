export class CopilotOrchestrator {
    constructor({ registry, llm, memory }) {
        this.registry = registry;
        this.llm = llm;
        this.memory = memory;
        this.maxSteps = 10;

        // Add request context memory
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
            // Multiple requests returned, store as pending selection
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
            c =>
                c.CustomerNumber === value ||
                c.Branch?.toLowerCase() === value.toLowerCase() ||
                (parseInt(value) === this.pendingCustomerSelection.options.indexOf(c) + 1)
        );

        if (!match) {
            return null;
        }

        this.pendingCustomerSelection = null;

        return await this.registry.execute(
            "search.execute",
            {
                type: "RENTAL",
                filterQuery: `Customer eq '${match.CustomerNumber}'`,
                topCount: 10
            },
            context
        );
    }

    async tryResolvePendingRequestAction(userInput, context, ui) {
        if (!this.activeRequest) {
            return null;
        }

        const userText = this.getCleanValue(userInput).toLowerCase();

        // Check if user is asking for request lines or details
        const requestLineKeywords = [
            'request lines',
            'rental request lines',
            'lines',
            'show me the lines',
            'show lines',
            'can i get the rental request lines',
            'request details',
            'details',
            'yes more details',
            'what equipment',
            'equipment'
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
            return {
                success: true,
                answer: `Request lines for RequestID ${this.activeRequest.RequestID}:\n\n${JSON.stringify(result.data || result, null, 2)}`
            };
        }

        return null;
    }

    async runStreaming(userInput, context = {}, ui) {
        // Check pending customer selection first
        const selectionResult = await this.tryResolvePendingCustomerSelection(userInput, context, ui);
        if (selectionResult) {
            return selectionResult;
        }

        // Check pending request action
        const requestActionResult = await this.tryResolvePendingRequestAction(userInput, context, ui);
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
                    temperature: 0.3,
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

                    // Soften tool failure messages
                    if (answer.toLowerCase().includes("unable to search") || 
                        answer.toLowerCase().includes("no customer")) {
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
                            console.log("TOOL NAME:", toolName);
                            result = await this.registry.execute(toolName, args, context);
                            console.log(
    "ACTIVE REQUEST AFTER TOOL:",
    JSON.stringify(this.activeRequest, null, 2)
);

                            // Remember active request if tool call is search.execute and type is RENTAL
                           const looksLikeRentalResult =
    result?.data?.searchType === "RENTAL" ||
    result?.searchType === "RENTAL";

if (looksLikeRentalResult && result.success) {
    this.rememberActiveRequest(
        result,
        args,
        context
    );
}

                            if (
                                result?.requiresSelection &&
                                result?.options?.length
                            ) {
                                return {
                                    success: true,
                                    answer:
                                        "Multiple customer locations found.\n\n" +
                                        result.options
                                            .map(
                                                (c, i) =>
                                                    `${i + 1}. ${c.customerName} (${c.branch})`
                                            )
                                            .join("\n"),
                                    awaitingCustomerSelection: true,
                                    options: result.options
                                };
                            }

                            console.log(
                                "TOOL RESULT:",
                                JSON.stringify(result, null, 2)
                            );
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
                console.error(
                    `Error in step ${step}:`,
                    err
                );

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
        const toolList = tools instanceof Map
            ? Array.from(tools.values())
            : Object.values(tools);

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

        return [{
            role: "system",
            content: `

GitHub tool usage rule:

During normal rental management conversations, do not use GitHub tools.

If the user is searching customers, rentals, equipment, requests, request lines, or responding to a customer selection, use rental/search tools only.

Only use GitHub tools when the user explicitly asks to modify code, create a branch, update files, open a pull request, or improve the MCP implementation.

Examples:
User says "Addison" after a customer list:
- Treat as customer location selection.
- Do not diagnose.
- Do not create a branch.
- Do not open a PR.

User says "fix the Addison selection bug in code":
- Use GitHub tools.

            When searching for requests for a customer name:

1. Search CUSTOMER.
2. If more than one CustomerNumber is returned:
   - Search RENTAL for each CustomerNumber.
   - Count the results.
   - Present a summary.
3. Only ask the user which customer they mean if there are multiple accounts with active requests.
Issue Classification:
Workflow routing validated

Root Cause:
Customer selection is now working.

Evidence:
The MCP successfully executed:

{
  "type": "RENTAL",
  "filterQuery": "Customer eq '669007'"
}

The rental workflow returned:
"value": []

Next task:

Determine whether RequestHeader uses:
- Customer
- CustomerNumber
- InvoicingCustomer
- another field

Search RequestHeader without a filter and inspect the first row schema.

Identify the field containing customer numbers.

Then build rental filters using the actual field name.

Stop working on schema-aware filtering.

New issue classification:
Workflow routing issue

Current bug:

User:
find a request for Clampitt Paper Inc

MCP:
returns:
1. ADDISON - 669007
2. HOUSTON - 669002
3. HOUSTON - 669001

User:
Addison

Expected:
Select customer 669007 and continue rental search.

Actual:
Starts a new conversation.

Root cause:
CopilotOrchestrator does not persist pending customer selections across turns.

Required fix:

Modify:
src/agent/copilotOrchestrator.js

Implement pending selection memory:

this.pendingCustomerSelection

When multiple customer locations are returned:
store them.

Before calling the LLM on the next user message:
check if there is a pending customer selection.

If the user replies:
- Addison
- Houston
- 1
- 2
- 669007

resolve that to the matching customer.

Then automatically execute:

{
  "type": "RENTAL",
  "filterQuery": "Customer eq '669007'"
}

Do not work on discoveredFields.
Do not work on schema memory.
Fix customer branch selection workflow.
Update branch:
fix/schema-aware-odata-filters
Update PR #2.

            Use GitHub tools.

The MCP system prompt is NOT located in:

src/orchestrator/orchestratorPrompt.js

The MCP system prompt is embedded inside:

src/agent/copilotOrchestrator.js

Specifically the:

buildSystemPrompt()

method.

Use branch:
fix/schema-aware-odata-filters

Retrieve:
src/agent/copilotOrchestrator.js

Then:

1. Add schema memory:
   this.discoveredSchemas = {}

2. Store discoveredFields from search.execute results:

   CUSTOMER
   RENTAL
   REQUEST_LINES
   EQUIPMENT

3. Inject discovered schema into buildSystemPrompt().

4. Update filtering instructions to:
   - Prefer discovered fields.
   - Never assume CustomerName exists.
   - Never use CustomerName in RENTAL unless discovered.
   - Use Branch for location selection.
   - Use CustomerNumber when available.

5. Commit changes to:
   fix/schema-aware-odata-filters

6. Update existing PR #2.

GitHub Repository Context:

The GitHub repository for this MCP is:
owner: PwannMalin
repo: rental-mcp

Use these exact values for all GitHub tools unless the user explicitly says otherwise.

Never infer owner or repo from the project name.

If github.getFile returns 404:
1. Verify owner and repo are correct.
2. Retry with owner PwannMalin and repo rental-mcp.
3. Retry on main.
4. Try likely alternate paths.
5. Only then report that the file could not be found.

            # Internal Rental MCP Improvement Agent

You are the **Internal Rental MCP Improvement Agent**.

Your responsibility is to inspect, diagnose, and safely improve this Rental MCP application. Always prioritize evidence over assumptions. If logs, code, or tool output are available, use them before forming a conclusion.

Your goals are to:

* Diagnose problems accurately.
* Produce the smallest safe fix.
* Preserve existing functionality.
* Prevent regressions.
* Improve the quality of the MCP over time.

---

# Diagnostic Process

Whenever a user reports a bug, incorrect behavior, unexpected result, or asks why something failed, trace the complete execution path before proposing a fix.

Follow this sequence:

User Request









































































































































































































































































































































































































































































































































































































































































































































































































































}
