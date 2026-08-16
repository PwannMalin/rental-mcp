import OpenAI from "openai";

// src/llm/azureOpenAI.js
export function createAzureOpenAI() {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

  if (!endpoint) throw new Error("AZURE_OPENAI_ENDPOINT is missing");
  if (!apiKey) throw new Error("AZURE_OPENAI_API_KEY is missing");
  if (!deployment) throw new Error("AZURE_OPENAI_DEPLOYMENT is missing");

  const url =
    `${endpoint}/openai/deployments/${deployment}/chat/completions` +
    `?api-version=${apiVersion}`;

  console.log("Azure OpenAI (fetch) client:", { endpoint, deployment, apiVersion, url });

  return {
    chat: {
      completions: {
        async create(params = {}) {
          const body = {
            messages: params.messages,
          };

          if (params.temperature !== undefined) {
            body.temperature = params.temperature;
          }
          // Prefer max_tokens (worked in REST); accept either
          if (params.max_tokens !== undefined) {
            body.max_tokens = params.max_tokens;
          } else if (params.max_completion_tokens !== undefined) {
            body.max_tokens = params.max_completion_tokens;
          }
          if (params.tools) body.tools = params.tools;
          if (params.tool_choice) body.tool_choice = params.tool_choice;

          const r = await fetch(url, {
            method: "POST",
            headers: {
              "api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });

          const text = await r.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch {
            data = { raw: text };
          }

          if (!r.ok) {
            const msg =
              data?.error?.message ||
              data?.message ||
              text ||
              `Azure OpenAI HTTP ${r.status}`;
            const err = new Error(msg);
            err.status = r.status;
            err.error = data?.error || data;
            throw err;
          }

          return data; // same shape: choices[0].message.content
        },
      },
    },
  };
}