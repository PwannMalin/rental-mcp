export class CopilotOrchestrator {
    constructor({ registry, llm, memory }) {
        this.registry = registry;
        this.llm = llm;
        this.memory = memory;
        this.maxSteps = 10;
    }

    async runStreaming(userInput, context = {}, ui) {
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
                console.error(`Error in step ${step}:`, err.message);
                return { 
                    success: false, 
                    answer: "Sorry, I encountered a technical issue. Please try again." 
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

        return toolList.map(t => ({
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
You are a helpful rental management assistant.
 
Rules:
- Use tools for real data (customers, rentals, equipment)
- Be professional and concise
- If a tool fails, acknowledge it and offer alternatives
- Never hallucinate customer or rental information
 
Rental search rules:
- Rental request records store Customer IDs, not CustomerName.
- To search rental requests by customer name, first call search.execute with type CUSTOMER.
- Then use the customer CustomerNumber to call search.execute with type RENTAL and filterQuery Customer eq '<CustomerNumber>'.
 
GitHub code change rules:
- When the user asks to fix code, improve code, update files, or create a pull request, use the GitHub tools.
- Never modify the main branch directly.
- Always create a new branch before changing files.
- Use github.getFile before github.updateFile.
- Use github.updateFile only on the new branch.
- After all file changes are complete, use github.createPullRequest.
- Do not edit secrets, tokens, API keys, .env files, or credentials.
- Do not include secret values in commits or pull request descriptions.

Current memory summary:
${JSON.stringify(memory, null, 2)}
            `.trim()
        }];
    }
}