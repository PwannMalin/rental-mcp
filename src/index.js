console.log("INDEX STARTED");
import "dotenv/config";
import express from "express";

import { createRegistry } from "./logic/toolBootstrap.js";
import { ChainEngine } from "./logic/chainEngine.js";
import { registerWorkflows } from "./logic/workflows.js";
import { formatCopilotResponse } from "./logic/formatCopilotResponse.js";

const app = express();

app.use(express.json({ limit: "25mb" }));

/**
 * Runtime context
 *
 * The new Power Automate tools use process.env directly.
 * These fallback context handlers are mainly here so older tools
 * like db.search, github.searchRepo, and powerAutomate.runFlow
 * do not crash the server during testing.
 */
const context = {
    db: {
        query: async (sql, params) => {
            console.log("Mock db.query called", { sql, params });

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
            console.log("Mock azure.runFlow called", payload);

            return {
                flowStarted: true,
                flowName: "Mock Rental Quote Workflow",
                receivedPayload: payload
            };
        }
    },

    githubApi: {
        searchRepositories: async query => {
            console.log("Mock githubApi.searchRepositories called", query);

            return {
                total_count: 0,
                items: []
            };
        }
    }
};

/**
 * Create registry and chain engine once at startup.
 */
const registry = createRegistry(context);

const chainEngine = new ChainEngine(registry);
registerWorkflows(chainEngine);

/**
 * Health endpoint for Azure Container Apps.
 */
app.get("/", (req, res) => {
    res.json({
        status: "healthy",
        service: "rental-mcp",
        timestamp: new Date().toISOString()
    });
});

/**
 * List available tools.
 */
app.get("/tools", (req, res) => {
    res.json({
        success: true,
        tools: registry.list()
    });
});

/**
 * List available workflows.
 */
app.get("/workflows", (req, res) => {
    res.json({
        success: true,
        workflows: chainEngine.listWorkflows()
    });
});

const port = process.env.PORT || 8080;
app.post("/tool", async (req, res) => {
    try {

        const { tool, input } = req.body || {};

        const result =
            await registry.execute(
                tool,
                input || {},
                context
            );

        res.json(result);

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.post("/query", async (req, res) => {

    try {

        const { query } = req.body || {};

        const result =
            await chainEngine.run(
                "rentalQuoteWorkflow",
                {
                    query
                },
                context
            );

        res.json(result);

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
app.listen(port, () => {
    console.log(`Rental MCP server listening on port ${port}`);
});