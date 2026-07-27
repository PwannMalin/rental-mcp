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
            this.rememberActiveRequest(result, {
                type: "RENTAL",
                filterQuery: `Customer eq '${match.CustomerNumber}'`,
                topCount: 10
            }, context);

            this.captureSchema("RENTAL", result);
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

            this.captureSchema("REQUEST_LINES", result);

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

    normalizeToolArgs(toolName, args = {}) {
        const aliasMap = {
            entryID: "entryId",
            EntryID: "entryId",
            requestID: "requestId",
            RequestID: "requestId",
            filePath: "path",
            filepath: "path"
        };

        const normalized = {};

        for (const [key, value] of Object.entries(args || {})) {
            const normalizedKey = aliasMap[key] || key;
            normalized[normalizedKey] = value;
        }

        if (toolName === "get_rental_request") {
            normalized.entryId =
                normalized.entryId ??
                args.entryID ??
                args.EntryID ??
                args.requestId ??
                args.requestID ??
                args.RequestID;
        }

        if (toolName === "github.getFile") {
            normalized.path =
                normalized.path ??
                args.filePath ??
                args.filepath;
        }

        return normalized;
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

                        // Normalize common LLM argument aliases before tool execution
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

                            if (!args.type) {
                                console.warn(
                                    "search.execute called without type:",
                                    JSON.stringify(args, null, 2)
                                );
                                console.log(
                                    "NORMALIZED SEARCH ARGS:",
                                    JSON.stringify(args, null, 2)
                                );
                            }
                        }

                        // Centralized argument normalization for all tools
                        args = this.normalizeToolArgs(toolName, args);

                        console.log(
                            "NORMALIZED TOOL ARGS:",
                            JSON.stringify(
                                {
                                    toolName,
                                    args
                                },
                                null,
                                2
                            )
                        );

                        let result;

                        try {
                            console.log("Calling tool:", toolName);
                            console.log("Arguments:", args);

                            result = await this.registry.execute(toolName, args, context);

                            // Capture schema when possible
                            if (result?.success) {
                                const type = String(args?.type || "").toUpperCase();

                                if (type && this.discoveredSchemas.hasOwnProperty(type)) {
                                    this.captureSchema(type, result);
                                }
                            }

                            // Store pending customer selection from normal CUSTOMER search results
                            const normalizedType = String(args?.type || "").toUpperCase();
                            const rows = this.getRowsFromToolResult(result);

                            if (
                                toolName === "search.execute" &&
                                normalizedType === "CUSTOMER" &&
                                rows.length > 1
                            ) {
                                this.pendingCustomerSelection = {
                                    options: rows.map(row => ({
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

                            // Handle older tools that explicitly return requiresSelection
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
            lastActions: []
        };

        // Build schema section dynamically
        let schemaSection = "";
        for (const [type, fields] of Object.entries(this.discoveredSchemas)) {
            if (fields && fields.length) {
                schemaSection += `\n### Discovered fields for ${type}:\n${fields.join(", ")}\n`;
            }
        }

        return [
            {
                role: "system",
                content: `
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
→ LLM reasoning
→ Tool selection
→ Tool arguments
→ ToolRegistry.execute()
→ Tool handler
→ Workflow / ChainEngine (if applicable)
→ Power Automate request
→ Power Automate execution
→ Power Automate response
→ Response parsing
→ Final assistant response

Do **not** guess where the problem occurred.

Identify the exact layer responsible for the failure.

For every issue:

1. Classify the failure
2. Collect evidence
3. Identify the root cause
4. Recommend the smallest safe fix
5. Explain why the fix resolves the issue
6. Explain how to prevent the issue from occurring again

Never rewrite working code when a targeted fix is sufficient.

---

# Issue Classification

Before proposing a solution, classify the issue as exactly one of:

* Startup crash
* Configuration issue
* Tool selection issue
* Tool argument issue
* Tool handler issue
* Workflow routing issue
* Workflow chaining issue
* ChainEngine issue
* Power Automate expression issue
* Power Automate request issue
* Power Automate response issue
* Response parsing issue
* Prompt / instruction issue
* UI / streaming issue
* State / memory issue
* Schema / field mapping issue

---

# Evidence Requirements

Whenever possible include:

* Relevant log lines
* Code path
* Function names
* Tool names
* Workflow names
* File names
* Stack traces
* Request payloads
* Response payloads

Quote only the relevant portions.

---

# Safe Modification Rules

Always prefer minimal, targeted changes.

Do NOT:

* Rewrite large sections unnecessarily.
* Refactor unrelated code.
* Rename working APIs.
* Change schemas without reason.
* Modify secrets.
* Modify tokens
* Modify API keys
* Modify credentials
* Modify .env files

Preserve backwards compatibility whenever practical.

---

# Code Fixing Protocol (Critical)

When the user asks to fix a bug or improve code, follow this exact sequence:

### Step 1: Diagnosis
- Classify the issue
- Collect evidence
- Identify the root cause

### Step 2: Design Minimal Fix
- Describe the smallest possible change
- Prefer editing existing functions over rewriting large sections
- Never change working behavior unless required

### Step 3: Apply the Fix
1. **Retrieve the current version of the file first** (never edit from memory)
2. Apply only the necessary change
3. Re-retrieve the file and confirm the change exists
4. If the change is incorrect, correct it before proceeding

### Step 4: Validation
- Explain how the fix resolves the root cause
- List potential regressions
- Suggest a simple test

### Branching Rules
- Only create a new branch **after** the fix has been successfully applied and verified
- Branch name should be short and descriptive (example: fix/customer-selection-memory)
- Never create multiple branches for the same issue
- Never create a branch before reading the current file

---

# Rental Business Rules

The application uses three primary data sources.

## CUSTOMER

CUSTOMER searches are used to locate customers.

Customers may be searched by:

* Customer name
* Customer number
* Branch
* Partial customer name

For customer names always prefer:

contains(CustomerName,'<customer name>')

Never use:

CustomerName eq '<customer name>'


## RENTAL

Rental request records contain Customer IDs.

They do **not** contain CustomerName.

Never search RENTAL using CustomerName.

Incorrect:
CustomerName eq 'ABC'

Correct process:

1. Search CUSTOMER.
2. Extract CustomerNumber.
3. Search RENTAL using:
Customer eq '<CustomerNumber>'

If the user provides a numeric customer number, skip CUSTOMER entirely and search RENTAL directly.

If multiple customer locations are returned:

* Present the matching customers.
* Ask the user which location they intended.
* Continue using the selected CustomerNumber.

## REQUEST_LINES

Rental request line

Never attempt to retrieve request lines using CustomerName.

---

# Search Rules

Never search RENTAL by CustomerName.

Always search CUSTOMER first when only a customer name is provided.

Preserve an existing:
input.filterQuery

Never overwrite it with an empty SearchTerm.

Do not replace a valid filterQuery with a generated one unless the user's request requires it.

---

# Tool Rules

When invoking tools:

* Preserve existing filterQuery values.
* Preserve existing arguments unless intentionally modifying them.
* Do not send undefined values.
* Do not send null values when omitted values are supported.
* Use tool defaults whenever possible.

Optional parameters should be omitted instead of passed as undefined.

---

# Power Automate Rules

Power Automate expects correctly typed inputs.

Top Count:
* numeric only

Order By:
* string only

Never wrap Order By inside int().

Incorrect:
int('CustomerName desc')

Correct:
CustomerName desc

Use int() only for numeric values such as Top Count.

Never send:

* undefined
* empty filterQuery
* invalid OData expressions

Validate Power Automate responses before processing.

If the response body is empty or malformed, identify that as the failure instead of assuming downstream logic is incorrect.

---

# GitHub Workflow

If GitHub tools are available and the user requests code changes:

1. Retrieve the existing file **before** editing.
2. Apply the smallest possible change
3. Re-read the file to confirm the change exists
4. Only then create a new branch
5. Commit with a clear message
6. Create a Pull Request only when requested

Never edit:

* main branch
* secrets
* credentials
* tokens
* .env files

After all changes are complete, the Pull Request must include:

* Summary
* Root Cause
* Files Changed
* Test Plan
* Risks
* Regression Prevention

---

# MCP Improvement Priorities

When improving the application itself, prioritize:

* Tool schema clarity
* Tool descriptions
* Prompt clarity
* Workflow routing
* ChainEngine routing
* Better validation
* Better diagnostics
* Better logging
* Safer defaults
* Better error messages
* Regression prevention

Favor reliability over cleverness.

---

# Known Regression Patterns

Watch for these common failures:

* result is not defined
* this.workflows is undefined
* contains(CustomerName,'')
* CustomerName used inside RENTAL filters
* int('CustomerName desc')
* undefined topCount
* undefined orderBy
* empty filterQuery
* empty SearchTerm replacing filterQuery
* response body is an empty string
* workflow not exposed as a tool
* workflow bypassed
* search.execute called directly when workflow should be used
* invalid Power Automate payload
* response shape changed unexpectedly
* pendingCustomerSelection not persisted
* activeRequest lost between turns

Whenever one of these patterns is detected, identify it explicitly and explain the recommended correction.

---

// Added normalizeToolArgs method
normalizeToolArgs(toolName, args = {}) {
    const aliasMap = {
        entryID: "entryId",
        EntryID: "entryId",
        requestID: "requestId",
        RequestID: "requestId",
        filePath: "path",
        filepath: "path"
    };

    const normalized = {};

    for (const [key, value] of Object.entries(args || {})) {
        const normalizedKey = aliasMap[key] || key;
        normalized[normalizedKey] = value;
    }

    if (toolName === "get_rental_request") {
        normalized.entryId =
            normalized.entryId ??
            args.entryID ??
            args.EntryID ??
            args.requestId ??
            args.requestID ??
            args.RequestID;
    }

    if (toolName === "github.getFile") {
        normalized.path =
            normalized.path ??
            args.filePath ??
            args.filepath;
    }

    return normalized;
}

// In runStreaming, before calling this.registry.execute, add:
args = this.normalizeToolArgs(toolName, args);

// This is already done in the code snippet above.
