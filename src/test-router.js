import { createRegistry } from "./logic/toolBootstrap.js";
import { ChainEngine } from "./logic/chainEngine.js";
import { registerWorkflows } from "./logic/workflows.js";

const context = {
    db: {
        query: async (sql, params) => {
            return [
                {
                    id: 1,
                    name: "ABC Construction",
                    rentalType: "Forklift",
                    duration: "30 days"
                }
            ];
        }
    },
    azure: {
        runFlow: async payload => {
            return {
                flowStarted: true,
                flowName: "Rental Quote Workflow",
                receivedPayload: payload
            };
        }
    },
    githubApi: {
        searchRepositories: async query => {
            return {
                total_count: 0,
                items: []
            };
        }
    }
};

const query =
    "Create a rental quote for ABC Construction for a 30 day forklift rental";

const registry = createRegistry(context);
const chainEngine = new ChainEngine(registry);
registerWorkflows(chainEngine);

const normalizedQuery = query.toLowerCase();

let result;

if (
    normalizedQuery.includes("create quote") ||
    normalizedQuery.includes("generate quote") ||
    normalizedQuery.includes("rental quote") ||
    normalizedQuery.includes("submit quote") ||
    normalizedQuery.includes("quote workflow") ||
    normalizedQuery.includes("create a quote")
) {
    result = await chainEngine.run("rentalQuoteWorkflow", { query }, context);
} else {
    result = await registry.route(query, context);
}

console.log(JSON.stringify(result, null, 2));