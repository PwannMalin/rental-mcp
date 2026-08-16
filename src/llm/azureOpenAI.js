import OpenAI from "openai";

export function createAzureOpenAI() {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  // Force the version that worked in REST — do not use 2024-06-01-preview
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";

  if (!endpoint) throw new Error("AZURE_OPENAI_ENDPOINT is missing");
  if (!apiKey) throw new Error("AZURE_OPENAI_API_KEY is missing");
  if (!deployment) throw new Error("AZURE_OPENAI_DEPLOYMENT is missing");

  const baseURL = `${endpoint}/openai/deployments/${deployment}`;

  console.log("Azure OpenAI client:", { endpoint, deployment, apiVersion, baseURL });

  return new OpenAI({
    apiKey,
    baseURL,
    defaultQuery: { "api-version": apiVersion },
    defaultHeaders: { "api-key": apiKey },
  });
}