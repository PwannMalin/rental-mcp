export class CopilotOrchestrator {
    constructor({ registry, llm, memory }) {
        this.registry = registry;
        this.llm = llm;
        this.memory = memory;
        this.maxSteps = 8;
    }

    async runStreaming(userInput, context = {}, ui) {
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
                    temperature: 0.3,
                });

                const msg = response.choices[0].message;

                // Final answer
                if (msg.content && !msg.tool_calls?.length) {
                    await ui.update("Finalizing...");
                    return { success: true, answer: msg.content };
                }

                // Tool calls
                if (msg.tool_calls?.length) {
                    messages.push(msg);

                    for (const call of msg.tool_calls) {
                        await ui.update(`Using tool: ${call.function.name}`);

                        const args = JSON.parse(call.function.arguments || "{}");
                        const result = await this.registry.execute(call.function.name, args, context);

                        messages.push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: JSON.stringify(result)
                        });
                    }
                }
            } catch (err) {
                console.error("Error in step", step, ":", err.message);
                return { success: false, answer: "Sorry, I had a technical issue." };
            }
        }

        return { success: false, answer: "I couldn't finish the request." };
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
                description: t.description || "No description",
                parameters: t.inputSchema || t.schema || { type: "object", properties: {} }
            }
        }));
    }

    buildSystemPrompt(userId, tenantId) {
        const memory = this.memory?.get?.(userId, tenantId) || { customers: [], rentals: [], lastActions: [] };

        return [{
            role: "system",
            content: `You are a helpful rental assistant. Use tools when needed. Be concise.`
        }];
    }
}