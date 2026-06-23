import express from "express";

import { createRegistry } from "./logic/toolBootstrap.js";
import { ChainEngine } from "./logic/chainEngine.js";
import { registerWorkflows } from "./logic/workflows.js";
import { formatCopilotResponse } from "./logic/formatCopilotResponse.js";

const app = express();

app.use(express.json());

/*
  TEMP MOCK CONTEXT
  Replace later with real db / Power Automate / GitHub services
*/
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

app.get("/", (req, res) => {
    res.json({
        status: "healthy",
        service: "rental-mcp"
    });
});

app.post("/query", async (req, res) => {
    try {
        const { query } = req.body;

        const registry = createRegistry(context);

        const chainEngine = new ChainEngine(registry);

        registerWorkflows(chainEngine);

        const normalizedQuery =
            String(query || "").toLowerCase();

        let result;

        if (
            normalizedQuery.includes("create quote") ||
            normalizedQuery.includes("generate quote") ||
            normalizedQuery.includes("rental quote") ||
            normalizedQuery.includes("submit quote") ||
            normalizedQuery.includes("quote workflow") ||
            normalizedQuery.includes("create a quote")
        ) {
            result = await chainEngine.run(
                "rentalQuoteWorkflow",
                { query },
                context
            );
        } else {
            result = await registry.route(query, context);
        }

        const copilotResponse =
            formatCopilotResponse(result);

        res.json(copilotResponse);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

const port = process.env.PORT || 8080;

app.listen(port, () => {
    console.log(`Listening on ${port}`);
});