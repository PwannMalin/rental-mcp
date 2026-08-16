/**
 * Minimal multi-agent LLM caller.
 * Critic / Architect: pass toolChoice "none" (default).
 * Responder can pass tools + tool_choice "auto" later if you want.
 */
export async function runAgent({
  llm,
  system,
  user,
  tools = null,
  toolChoice = "none",
  temperature = 0.2,
  maxTokens = 2000,
}) {
  if (!llm?.chat?.completions?.create) {
    throw new Error("runAgent: llm client is missing chat.completions.create");
  }

  const messages = [
    { role: "system", content: system },
    {
      role: "user",
      content: typeof user === "string" ? user : JSON.stringify(user),
    },
  ];

  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!deployment) {
    throw new Error("AZURE_OPENAI_DEPLOYMENT is not set");
  }

  const payload = {
    model: deployment,
    messages,
    max_completion_tokens: maxTokens,
  };

  if (typeof temperature === "number") {
    payload.temperature = temperature;
  }

  if (tools?.length && toolChoice !== "none") {
    payload.tools = tools;
    payload.tool_choice = toolChoice;
  }

  try {
    const response = await llm.chat.completions.create(payload);
    const message = response.choices?.[0]?.message;
    if (!message) {
      throw new Error("runAgent: empty LLM response");
    }
    return {
      content: message.content || "",
      tool_calls: message.tool_calls || null,
      raw: message,
    };
  } catch (err) {
    console.error("runAgent Azure error:", {
      message: err.message,
      status: err.status,
      code: err.code,
      error: err.error,
      deployment,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    });
    throw err;
  }
} // ← closes runAgent

/**
 * Extract JSON from model output (handles ```json fences).
 */
export function parseJsonFromAgent(content) {
  if (!content || typeof content !== "string") {
    throw new Error("parseJsonFromAgent: empty content");
  }

  let text = content.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  return JSON.parse(text);
}