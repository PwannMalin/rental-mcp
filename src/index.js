import "dotenv/config";
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
const memory = new MemoryStore(); // TODO: Replace with persistent store (Redis/Cosmos) in production
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
    db: { /* mock */ },
    azure: { /* mock */ },
    githubApi: { /* mock */ }
};

const registry = createRegistry(context);
const chainEngine = new ChainEngine(registry);
registerWorkflows(chainEngine);

const copilot = new CopilotOrchestrator({ registry, llm, memory });

// ======================
// Helper Functions (unchanged)
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
// Laserfiche Tools (unchanged)
// ======================
const laserficheTools = { /* ... same as before ... */ };

// ======================
// Express Server + Bot Adapter
// ======================
const app = express();

// Important: Preserve raw body for Bot Framework Adapter
app.use(express.json({
    limit: "25mb",
    verify: (req, res, buf) => {
        req.rawBody = buf.toString("utf8");
    }
}));

app.use(express.urlencoded({ extended: true, limit: "25mb" }));

const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

// Health Check
app.get("/", (req, res) => {
    res.json({
        status: "healthy",
        service: "rental-mcp",
        repositoryConfigured: Boolean(REPOSITORY_ID),
        rentalFolderId: RENTAL_FOLDER_ID,
        timestamp: new Date().toISOString()
    });
});

// Tools & Workflow endpoints (same as before)
app.get("/tools", (req, res) => { /* ... */ });
app.post("/tool", async (req, res) => { /* ... */ });
app.post("/query", async (req, res) => { /* ... */ });
app.post("/demo", async (req, res) => { /* ... */ });
app.get("/mcp", (req, res) => { /* ... */ });

// ======================
// Teams Bot Endpoint (Correct Bot Framework setup)
// ======================
app.post("/api/messages", async (req, res) => {
    try {
        await adapter.processActivity(req, res, async (turnContext) => {
            if (turnContext.activity.type !== "message") return;

            console.log("🔥 MESSAGE:", turnContext.activity.text);

            const ui = createTeamsUI(turnContext);

            const result = await copilot.runStreaming(
                turnContext.activity.text,
                {
                    userId: turnContext.activity.from.id,
                    tenantId: turnContext.activity.conversation.tenantId
                },
                ui
            );

            await ui.sendFinal(result.answer || "Done.");
        });
    } catch (error) {
        console.error("Bot error:", error);
        res.status(500).send("Error processing message");
    }
});

// ======================
// Start Server
// ======================
app.listen(PORT, () => {
    console.log(`🚀 Rental MCP server running on port ${PORT}`);
    console.log("Available Laserfiche tools:", Object.keys(laserficheTools));
    console.log("✅ Bot endpoint ready at /api/messages");
});
