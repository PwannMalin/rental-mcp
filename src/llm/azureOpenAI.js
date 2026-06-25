import OpenAI from "openai";

export function createAzureOpenAI() {
    const {
        AZURE_OPENAI_ENDPOINT,
        AZURE_OPENAI_API_KEY,
        AZURE_OPENAI_DEPLOYMENT,
        AZURE_OPENAI_API_VERSION = "2025-01-01-preview"
    } = process.env;

    if (!AZURE_OPENAI_ENDPOINT) {
        throw new Error("AZURE_OPENAI_ENDPOINT is missing");
    }
    if (!AZURE_OPENAI_API_KEY) {
        throw new Error("AZURE_OPENAI_API_KEY is missing");
    }
    if (!AZURE_OPENAI_DEPLOYMENT) {
        throw new Error("AZURE_OPENAI_DEPLOYMENT is missing - this is your deployment name (e.g. gpt-4o-mini)");
    }

    console.log(`✅ Azure OpenAI initialized with deployment: ${AZURE_OPENAI_DEPLOYMENT}`);

    return new OpenAI({
        apiKey: AZURE_OPENAI_API_KEY,
        baseURL: `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}`,
        defaultQuery: {
            "api-version": AZURE_OPENAI_API_VERSION
        },
        defaultHeaders: {
            "api-key": AZURE_OPENAI_API_KEY
        }
    });
}