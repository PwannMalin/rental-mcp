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
        if (!result || !result.value) return [];
        return result.value;
    }

    getRequestId(row) {
        return row.RequestID || row.RequestId || row.requestID || row.requestId || null;
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
                Customer: row.Customer || row.CustomerNumber || null,
                CustomerNumber: row.CustomerNumber || row.Customer || null,
                Branch: row.Branch || null,
                RequestStatus: row.Status || row.RequestStatus || null,
                ContactName: row.ContactName || row.Contact || null
            };
            this.pendingRequestSelection = null;
        } else {
            // Multiple requests returned, store as pending selection
            this.pendingRequestSelection = {
                options: rows.map(row => ({
                    RequestID: this.getRequestId(row),
                    Customer: row.Customer || row.CustomerNumber || null,
                    CustomerNumber: row.CustomerNumber || row.Customer || null,
                    Branch: row.Branch || null,
                    RequestStatus: row.Status || row.RequestStatus || null,
                    ContactName: row.ContactName || row.Contact || null
                }))
            };
            this.activeRequest = null;
        }
    }

    async tryResolvePendingCustomerSelection(userInput, context, ui) {
        if (!this.pendingCustomerSelection) {
            return null;
        }

        const value = String(userInput).trim();

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

        const userText = String(userInput).toLowerCase();

        // Check if user is asking for request lines or details
        const requestLineKeywords = [
            'request lines',
            'lines',
            'show me the lines',
            'show lines',
            'details',
            'show details',
            'yes',
            'show',
            'show request lines'
        ];

        if (requestLineKeywords.some(keyword => userText.includes(keyword))) {
            // Execute request lines search directly
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
            return result;
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
                            result = await this.registry.execute(toolName, args, context);

                            // Remember active request if tool call is search.execute and type is RENTAL
                            if (toolName === "search.execute" && args.type === "RENTAL" && result.success) {
                                this.rememberActiveRequest(result, args, context);
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

1. Classify the failure.
2. Collect evidence.
3. Identify the root cause.
4. Recommend the smallest safe fix.
5. Explain why the fix resolves the issue.
6. Explain how to prevent the issue from occurring again.

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
* Modify tokens.
* Modify API keys.
* Modify credentials.
* Modify .env files.

Preserve backwards compatibility whenever practical.

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


because names frequently do not match exactly.



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

Rental request lines are retrieved using:


RequestID


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

1. Create a new branch.
2. Retrieve the existing file before editing.
3. Modify only the required files.
4. Add diagnostic logging only when it provides meaningful troubleshooting value.
5. Keep changes as small as possible.

Never edit:

* main branch
* secrets
* credentials
* tokens
* .env files

After all changes are complete:

Create a Pull Request including:

* Summary
* Root Cause
* Files Changed
* Behavior before
* Behavior after
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
* response body is an empty string
* workflow not exposed as a tool
* workflow bypassed
* invalid Power Automate payload
* response shape changed unexpectedly

Whenever one of these patterns is detected, identify it explicitly and explain the recommended correction.
For search.execute, always use these exact argument names:
- type
- SearchTerm
- filterQuery
- topCount
- orderBy

Do not use:
- searchType
- searchTerm
- searchText

Correct CUSTOMER search example:
{
  "type": "CUSTOMER",
  "filterQuery": "contains(CustomerName,'Clampitt Paper Inc')",
  "topCount": 5
}
---

# Response Format

Always structure diagnostic responses exactly as follows:


Issue Classification:
Workflow routing issue

Root Cause:
CopilotOrchestrator did not remember active request context for follow-up request line queries.

Evidence:
- rememberActiveRequest method stores activeRequest from RENTAL search results.
- tryResolvePendingRequestAction uses activeRequest to fetch request lines.
- runStreaming calls tryResolvePendingRequestAction before normal LLM processing.

Fix:
Ensure rememberActiveRequest is called after RENTAL search.execute calls and activeRequest is used to resolve follow-up request line queries.

Code:
```js
// In src/agent/copilotOrchestrator.js

// Added this.activeRequest and this.pendingRequestSelection in constructor
// Added rememberActiveRequest to store active request from RENTAL search results
// Added tryResolvePendingRequestAction to handle follow-up request line queries
// Updated runStreaming to call tryResolvePendingRequestAction before normal processing

// Relevant excerpt:

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
            Customer: row.Customer || row.CustomerNumber || null,
            CustomerNumber: row.CustomerNumber || row.Customer || null,
            Branch: row.Branch || null,
            RequestStatus: row.Status || row.RequestStatus || null,
            ContactName: row.ContactName || row.Contact || null
        };
        this.pendingRequestSelection = null;
    } else {
        this.pendingRequestSelection = {
            options: rows.map(row => ({
                RequestID: this.getRequestId(row),
                Customer: row.Customer || row.CustomerNumber || null,
                CustomerNumber: row.CustomerNumber || row.Customer || null,
                Branch: row.Branch || null,
                RequestStatus: row.Status || row.RequestStatus || null,
                ContactName: row.ContactName || row.Contact || null
            }))
        };
        this.activeRequest = null;
    }
}

async tryResolvePendingRequestAction(userInput, context, ui) {
    if (!this.activeRequest) {
        return null;
    }

    const userText = String(userInput).toLowerCase();

    const requestLineKeywords = [
        'request lines',
        'lines',
        'show me the lines',
        'show lines',
        'details',
        'show details',
        'yes',
        'show',
        'show request lines'
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
        return result;
    }

    return null;
}

async runStreaming(userInput, context = {}, ui) {
    const selectionResult = await this.tryResolvePendingCustomerSelection(userInput, context, ui);
    if (selectionResult) {
        return selectionResult;
    }

    const requestActionResult = await this.tryResolvePendingRequestAction(userInput, context, ui);
    if (requestActionResult) {
        return requestActionResult;
    }

    // ... rest of runStreaming
}
```

Test:
- Search for a rental request.
- Follow up with "show me the request lines".
- Verify that the request lines for the active request are returned without needing to re-specify the request.

Regression Prevention:
- Add unit tests for activeRequest memory and follow-up request line queries.
- Log when activeRequest is set and used.
- Validate that tryResolvePendingRequestAction is called before normal LLM processing.
- Ensure rememberActiveRequest is called after RENTAL search.execute calls.
