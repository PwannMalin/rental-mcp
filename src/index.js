import "dotenv/config";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { listRentalRequests } from "./laserfiche/rentals.js";
import { getEntry } from "./laserfiche/entries.js";
import { exportDocumentPdf } from "./laserfiche/export.js";
import { createFolder } from "./laserfiche/folders.js";
import { mcpSafe } from "./utils/mcpSafe.js";

import { createRegistry } from "./logic/toolBootstrap.js";
import { ChainEngine } from "./logic/chainEngine.js";
import { registerWorkflows } from "./logic/workflows.js";

// ======================
// MCP Server Setup
// ======================
const REPOSITORY_ID = process.env.REPOSITORYID || process.env.REPOSITORY_ID;
const RENTAL_FOLDER_ID = process.env.RENTALFOLDERID || process.env.RENTAL_FOLDER_ID;

const mcpServer = new Server(
    { name: "rental-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
);

// Register MCP Tools
mcpServer.tool(
    "listrentalrequests",
    "List all rental requests",
    {},
    async () => {
        const rentals = await listRentalRequests(REPOSITORY_ID);
        return {
            content: [
                { type: "text", text: JSON.stringify(rentals, null, 2) }
            ]
        };
    }
);

mcpServer.tool(
    "getrentalrequest",
    "Retrieve a rental request by entry ID",
    { entryId: z.number() },
    async ({ entryId }) => {
        const request = await getEntry(REPOSITORY_ID, entryId);
        return {
            content: [
                { type: "text", text: JSON.stringify(request, null, 2) }
            ]
        };
    }
);

mcpServer.tool(
    "exportrentalrequestpdf",
    "Export rental request as PDF",
    { entryId: z.number() },
    async ({ entryId }) => {
        const pdf = await exportDocumentPdf(REPOSITORY_ID, entryId);
        return {
            content: [
                {
                    type: "text",
                    text: `PDF exported successfully. Size: ${pdf.length} bytes`
                }
            ]
        };
    }
);

mcpServer.tool(
    "createrentalrequest",
    "Create a Rental Workflow folder",
    { customerName: z.string() },
    async ({ customerName }) =>
        mcpSafe(async () => {
            const folder = await createFolder(
                REPOSITORY_ID,
                RENTAL_FOLDER_ID,
                customerName,
                true
            );

            return {
                content: [
                    {
                        type: "text",
                        text: `✅ Folder created\n\n` +
                              `Name: ${folder.name}\n` +
                              `ID: ${folder.id}\n` +
                              `Path: ${folder.fullPath}`
                    }
                ]
            };
        })
);

// Start MCP Server (stdio transport)
async function startMcpServer() {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.log("✅ MCP Server (stdio) started");
}

// ======================
// Express Server Setup
// ======================
const app = express();
app.use(express.json({ limit: "25mb" }));

const context = {
    db: {
        query: async (sql, params) => {
            console.log("Mock db.query called", { sql, params });
            return [];
        }
    },
    azure: {
        runFlow: async (payload) => {
            console.log("Mock azure.runFlow called", payload);
            return { flowStarted: true };
        }
    },
    githubApi: {
        searchRepositories: async (query) => ({ totalcount: 0, items: [] })
    }
};

// Initialize registry and chain engine
const registry = createRegistry(context);
const chainEngine = new ChainEngine(registry);
registerWorkflows(chainEngine);

// Routes
app.get("/", (req, res) => {
    res.json({
        status: "healthy",
        service: "rental-mcp",
        timestamp: new Date().toISOString()
    });
});

app.get("/tools", (req, res) => {
    res.json({ success: true, tools: registry.list() });
});

app.get("/workflows", (req, res) => {
    res.json({ success: true, workflows: chainEngine.listWorkflows() });
});

app.post("/tool", async (req, res) => {
    try {
        const { tool, input } = req.body || {};
        const result = await registry.execute(tool, input || {}, context);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post("/query", async (req, res) => {
    try {
        const { query } = req.body || {};
        const result = await chainEngine.run("rentalQuoteWorkflow", { query }, context);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const port = process.env.PORT || 8080;

// Start both servers
app.listen(port, async () => {
    console.log(`🚀 Rental MCP Express server listening on port ${port}`);
    await startMcpServer();
});