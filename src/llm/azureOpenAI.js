import OpenAI from "openai";

export function createAzureOpenAI() {
  const {
    AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_DEPLOYMENT,
    AZURE_OPENAI_API_VERSION = "2024-08-01-preview",
  } = process.env;

  if (!AZURE_OPENAI_ENDPOINT) throw new Error("AZURE_OPENAI_ENDPOINT is missing");
  if (!AZURE_OPENAI_API_KEY) throw new Error("AZURE_OPENAI_API_KEY is missing");
  if (!AZURE_OPENAI_DEPLOYMENT) throw new Error("AZURE_OPENAI_DEPLOYMENT is missing");

  const endpoint = AZURE_OPENAI_ENDPOINT.replace(/\/$/, "");

  console.log({
    endpoint,
    deployment: AZURE_OPENAI_DEPLOYMENT,
    version: AZURE_OPENAI_API_VERSION,
  });

  return new OpenAI({
    apiKey: AZURE_OPENAI_API_KEY,
    baseURL: `${endpoint}/openai`,
    defaultQuery: { "api-version": AZURE_OPENAI_API_VERSION },
    defaultHeaders: { "api-key": AZURE_OPENAI_API_KEY },
  });
}