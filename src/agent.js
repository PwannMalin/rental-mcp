import { ToolRegistry } from "./toolRegistry.js";

/**
 * Agent Loop
 * LLM decides tools, registry executes them
 */
export class Agent {
    constructor({ registry, llm }) {
        this.registry = registry;
        this.llm = llm; // Azure OpenAI or OpenAI client
        this.maxSteps = 8;
    }

    async run(userInput, context = {}) {
        let messages = [
            {
                role: "system",
                content: `
You are an enterprise automation agent inside Microsoft ecosystem.

You can use tools to:
- search customers
- create rental requests
- query Laserfiche
- send emails
- trigger Power Automate flows
- fetch GitHub data

Rules:
- Use tools when needed
- Break complex tasks into steps
- Always prefer tools over guessing
- When finished, return FINAL_ANSWER
`
            },
            {
                role: "user",
                content: userInput
            }
        ];

        let lastToolResult = null;

        for (let step = 0; step < this.maxSteps; step++) {

            // 1. Ask LLM what to do next
            const completion = await this.llm.chat.completions.create({
                model: "gpt-4.1-mini",
                messages,
                tools: this.buildToolSchema(),
                tool_choice: "auto"
            });

            const message = completion.choices[0].message;

            // 2. If final answer
            if (message.content && !message.tool_calls) {
                return {
                    success: true,
                    final: message.content,
                    steps: step + 1,
                    lastToolResult
                };
            }

            // 3. Handle tool calls
            if (message.tool_calls) {
                for (const toolCall of message.tool_calls) {

                    const name = toolCall.function.name;
                    const args = JSON.parse(toolCall.function.arguments || "{}");

                    const result = await this.registry.execute(
                        name,
                        args,
                        context
                    );

                    lastToolResult = result;

                    // Feed result back to LLM
                    messages.push(message);
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(result)
                    });
                }
            }
        }

        return {
            success: false,
            error: "Max agent steps exceeded",
            lastToolResult
        };
    }

    buildToolSchema() {
        return Array.from(this.registry.tools.values()).map(tool => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.schema || {
                    type: "object",
                    properties: {},
                    additionalProperties: true
                }
            }
        }));
    }
}