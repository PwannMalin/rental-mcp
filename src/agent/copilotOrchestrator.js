export class CopilotOrchestrator {
    constructor({ registry, llm, memory }) {
        this.registry = registry;
        this.llm = llm;
        this.memory = memory;
        this.maxSteps = 10;
    }

    async runStreaming(userInput, context = {}, ui) {

        const { userId, tenantId } = context;

        // ✅ build memory-aware system prompt ONCE
        let messages = this.buildSystemPrompt(userId, tenantId);

        messages.push({
            role: "user",
            content: userInput
        });

        let lastToolResult = null;

        for (let step = 0; step < this.maxSteps; step++) {

            await ui.typing();

            const response = await this.llm.chat.completions.create({
                model: "gpt-4.1-mini",
                messages,
                tools: this.buildTools(),
                tool_choice: "auto"
            });

            const msg = response.choices[0].message;

            // 🟩 FINAL ANSWER
            if (msg.content && !msg.tool_calls) {

                await ui.update("Finalizing response...");

                return {
                    success: true,
                    answer: msg.content,
                    toolTrace: lastToolResult
                };
            }

            // 🟨 TOOL EXECUTION
            if (msg.tool_calls?.length) {

                messages.push(msg);

                for (const call of msg.tool_calls) {

                    await ui.update(`Running: ${call.function.name}`);

                    const args = JSON.parse(call.function.arguments || "{}");

                    // ✅ execute tool FIRST
                    const result = await this.registry.execute(
                        call.function.name,
                        args,
                        context
                    );

                    lastToolResult = result;

                    // ✅ store memory AFTER tool execution
                    if (this.memory?.addAction) {
                        this.memory.addAction(userId, tenantId, {
                            tool: call.function.name,
                            input: args
                        });
                    }

                    // optional semantic memory capture
                    if (call.function.name.includes("customer") && result?.data) {
                        this.memory?.addCustomer?.(userId, tenantId, result.data);
                    }

                    if (call.function.name.includes("rental") && result?.data) {
                        this.memory?.addRental?.(userId, tenantId, result.data);
                    }

                    messages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: JSON.stringify(result)
                    });

                    await ui.update(`Completed: ${call.function.name}`);
                }
            }
        }

        return {
            success: false,
            error: "Max steps reached",
            toolTrace: lastToolResult
        };
    }

    buildTools() {
        return Array.from(this.registry.tools.values()).map(t => ({
            type: "function",
            function: {
                name: t.name,
                description: t.description,
                parameters: t.schema || {
                    type: "object",
                    properties: {},
                    additionalProperties: true
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

        return [
            {
                role: "system",
                content: `
You are a Microsoft Copilot-style enterprise assistant.

You MUST:
- Use tools for real-world data
- Never hallucinate customer or rental data
- Use memory when possible
- Avoid duplicate work
- Chain tools when required

MEMORY:

CUSTOMERS:
${JSON.stringify(memory.customers.slice(0, 5), null, 2)}

RENTALS:
${JSON.stringify(memory.rentals.slice(0, 5), null, 2)}

RECENT ACTIONS:
${JSON.stringify(memory.lastActions.slice(0, 5), null, 2)}
`
            }
        ];
    }
}