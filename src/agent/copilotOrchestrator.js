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
- Use tools for ALL customer, equipment, rental, and Laserfiche requests.
- Never answer customer, equipment, rental, model, or request questions without calling a tool first.
- When a user searches for a company or customer name, call search_customers.
- When a user searches for equipment, forklifts, Raymond, Crown, Toyota, Hyster, Yale, reach trucks, pallet jacks, or models, call search_equipment.
- When a user searches for rental requests, call search_current_rentals.
- When a user asks for customer delivery information, call search_customer_delivery_info.
- Use multiple search tools when uncertain.

Current memory summary:
${JSON.stringify(memory, null, 2)}
            `.trim()
        }];
    }
}