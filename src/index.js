import "dotenv/config";
import restify from "restify";
import express from "express";
import { BotFrameworkAdapter } from "botbuilder";

import { createRegistry } from "./logic/toolBootstrap.js";
import { CopilotOrchestrator } from "./agent/copilotOrchestrator.js";
import { createAzureOpenAI } from "./llm/azureOpenAI.js";
import { MemoryStore } from "./memory/memoryStore.js";
import { createTeamsUI } from "./ui/createTeamsUI.js";

import { listRentalRequests } from "./laserfiche/rentals.js";
import { getEntry } from "./laserfiche/entries.js";
import { exportDocumentPdf } from "./laserfiche/export.js";
import { createFolder } from "./laserfiche/folders.js";

import { ChainEngine } from "./logic/chainEngine.js";
import { registerWorkflows } from "./logic/workflows.js";

// ======================
// Core Setup
// ======================
const memory = new MemoryStore();
const llm = createAzureOpenAI();

const REPOSITORY_ID = process.env.REPOSITORY_ID || process.env.REPOSITORYID;
const RENTAL_FOLDER_ID = Number(process.env.RENTAL_FOLDER_ID || process.env.RENTALFOLDERID || 67);
const PORT = process.env.PORT || 8080;

if (!REPOSITORY_ID) console.warn("⚠️ REPOSITORY_ID is not set.");
if (!RENTAL_FOLDER_ID) console.warn("⚠️ RENTAL_FOLDER_ID is not set.");

// ======================
// Context & Registry
// ======================
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
            return { flowStarted: true, flowName: "Mock Rental Quote Workflow" };
        }
    },
    githubApi: {
        searchRepositories: async (query) => ({ total_count: 0, items: [] })
    }
};

const registry = createRegistry(context);
const chainEngine = new ChainEngine(registry);
registerWorkflows(chainEngine);

const copilot = new CopilotOrchestrator({ registry, llm, memory });

// ======================
// Helper Functions
// ======================
function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function cleanFolderName(value) {
    return String(value || "")
        .replace(/[<>:"/\\|?*]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
}

function createToolResponse(data) {
    return { success: true, data };
}

function createToolError(error) {
    console.error("Tool failed:", error);
    return {
        success: false,
        error: error?.response?.data || error?.message || "Unknown error"
    };
}

// ======================
// Laserfiche Tools
// ======================
const laserficheTools = {
    list_rental_requests: {
        name: "list_rental_requests",
        description: "List rental request folders from the Laserfiche Rental Workflow folder.",
        inputSchema: {},
        execute: async () => {
            const rentals = await listRentalRequests(REPOSITORY_ID);
            return createToolResponse({ count: rentals.length, rentals });
        }
    },

    search_rental_requests: {
        name: "search_rental_requests",
        description: "Search existing rental request folders by customer name, request name, or text.",
        inputSchema: { searchText: "string" },
        execute: async (input) => {
            const searchText = normalizeText(input.searchText);
            const rentals = await listRentalRequests(REPOSITORY_ID);

            const matches = rentals.filter(item =>
                normalizeText(item.name).includes(searchText)
            );

            return createToolResponse({ searchText: input.searchText, count: matches.length, matches });
        }
    },

    get_rental_request: {
        name: "get_rental_request",
        description: "Get details for a Laserfiche rental request entry by entry ID.",
        inputSchema: { entryId: "number" },
        execute: async (input) => {
            const entryId = Number(input.entryId);
            if (!entryId) throw new Error("entryId is required.");

            const request = await getEntry(REPOSITORY_ID, entryId);
            return createToolResponse(request);
        }
    },

    export_rental_request_pdf: {
        name: "export_rental_request_pdf",
        description: "Export a Laserfiche rental request document as a PDF buffer summary.",
        inputSchema: { entryId: "number" },
        execute: async (input) => {
            const entryId = Number(input.entryId);
            if (!entryId) throw new Error("entryId is required.");

            const pdf = await exportDocumentPdf(REPOSITORY_ID, entryId);
            return createToolResponse({
                entryId,
                message: "PDF exported successfully.",
                sizeBytes: pdf?.length || 0
            });
        }
    },

    create_rental_request: {
        name: "create_rental_request",
        description: "Create a new rental request folder inside the Laserfiche Rental Workflow folder.",
        inputSchema: { customerName: "string", requestNumber: "string optional" },
        execute: async (input) => {
            const customerName = cleanFolderName(input.customerName);
            if (!customerName) throw new Error("customerName is required.");

            const requestNumber = cleanFolderName(input.requestNumber);
            const folderName = requestNumber ? `${requestNumber} - ${customerName}` : customerName;

            const folder = await createFolder(REPOSITORY_ID, RENTAL_FOLDER_ID, folderName, true);

            return createToolResponse({
                message: "Rental request folder created successfully.",
                id: folder.id,
                name: folder.name,
                parentId: folder.parentId,
                fullPath: folder.fullPath,
                entryType: folder.entryType
            });
        }
    }
};

// ======================
// Express Server
// ======================
const app = express();
app.use(express.json({ limit: "25mb" }));

// Health
app.get("/", (req, res) => {
    res.json({
        status: "healthy",
        service: "rental-mcp",
        repositoryConfigured: Boolean(REPOSITORY_ID),
        rentalFolderId: RENTAL_FOLDER_ID,
        timestamp: new Date().toISOString()
    });
});

// List Tools
app.get("/tools", (req, res) => {
    const legacyTools = typeof registry.list === "function" ? registry.list() : [];
    const lfTools = Object.values(laserficheTools).map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
    }));

    res.json({ success: true, tools: [...lfTools, ...legacyTools] });
});

// Execute Tool
app.post("/tool", async (req, res) => {
    try {
        const { tool, input } = req.body || {};
        if (!tool) return res.status(400).json({ success: false, error: "tool is required." });

        if (laserficheTools[tool]) {
            const result = await laserficheTools[tool].execute(input || {});
            return res.json(result);
        }

        if (registry?.execute) {
            const result = await registry.execute(tool, input || {}, context);
            return res.json(result);
        }

        return res.status(404).json({ success: false, error: `Unknown tool: ${tool}` });
    } catch (error) {
        res.status(500).json(createToolError(error));
    }
});

// Query Workflow
app.post("/query", async (req, res) => {
    try {
        const { query } = req.body || {};
        if (!query) return res.status(400).json({ success: false, error: "query is required." });

        const result = await chainEngine.run("rentalQuoteWorkflow", { query }, context);
        res.json(result);
    } catch (error) {
        res.status(500).json(createToolError(error));
    }
});

// Demo Endpoint
app.post("/demo", async (req, res) => {
    try {
        const { customerName } = req.body || {};
        if (!customerName) return res.status(400).json({ success: false, error: "customerName is required." });

        const history = await laserficheTools.search_rental_requests.execute({ searchText: customerName });
        const created = await laserficheTools.create_rental_request.execute({ customerName });

        res.json({
            success: true,
            message: "Rental demo completed.",
            previousRequests: history.data,
            newRequest: created.data
        });
    } catch (error) {
        res.status(500).json(createToolError(error));
    }
});

app.get("/mcp", (req, res) => {
    res.json({ status: "ok", protocol: "mcp", transport: "streamable-http" });
});

// ======================
// Restify Teams Bot
// ======================
const botServer = restify.createServer();
botServer.listen(process.env.BOT_PORT || 3978, () => {
    console.log(`🤖 Teams bot listening on port ${process.env.BOT_PORT || 3978}`);
});

const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

botServer.post("/api/messages", async (req, res) => {
    await adapter.processActivity(req, res, async (context) => {
        if (context.activity.type !== "message") return;

        console.log("🔥 MESSAGE:", context.activity.text);

        const ui = createTeamsUI(context);
        const result = await copilot.runStreaming(
            context.activity.text,
            {
                userId: context.activity.from.id,
                tenantId: context.activity.conversation.tenantId
            },
            ui
        );

        await ui.sendFinal(result.answer || "Done.");
    });
});

// ======================
// Start Express Server
// ======================
app.listen(PORT, () => {
    console.log(`🚀 Rental MCP Express server listening on port ${PORT}`);
    console.log("Available Laserfiche tools:", Object.keys(laserficheTools));
});