import OpenAI from "openai";

export function createAzureOpenAI() {
    const {
        AZURE_OPENAI_ENDPOINT,
        AZURE_OPENAI_API_KEY,
        AZURE_OPENAI_DEPLOYMENT,
        AZURE_OPENAI_API_VERSION
    } = process.env;

    if (!AZURE_OPENAI_ENDPOINT) {
        throw new Error("AZURE_OPENAI_ENDPOINT missing");
    }

    if (!AZURE_OPENAI_API_KEY) {
        throw new Error("AZURE_OPENAI_API_KEY missing");
    }

    return new OpenAI({
        apiKey: AZURE_OPENAI_API_KEY,
        baseURL:
            `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}`,
        defaultQuery: {
            "api-version": AZURE_OPENAI_API_VERSION
        },
        defaultHeaders: {
            "api-key": AZURE_OPENAI_API_KEY
        }
    });
}