import "dotenv/config";
import express from "express";
import { BotFrameworkAdapter } from "botbuilder";

import { createRegistry } from "./logic/toolBootstrap.js";
import { CopilotOrchestrator } from "./agent/copilotOrchestrator.js";
import { createAzureOpenAI } from "./llm/azureOpenAI.js";
import { MemoryStore } from "./memory/memoryStore.js";
import { createTeamsUI } from "./ui/createTeamsUI.js";   // ← Make sure this path is correct

console.log("🔥 ENTRY FILE LOADED");

// ======================
// ENV
// ======================
const REPOSITORY_ID = process.env.REPOSITORY_ID || process.env.REPOSITORYID;
const RENTAL_FOLDER_ID = Number(process.env.RENTAL_FOLDER_ID || process.env.RENTALFOLDERID || 67);
const PORT = process.env.PORT || 8080;

// ======================
// BOOTSTRAP
// ======================
async function bootstrap() {
    try {
        console.log("🚀 Starting bootstrap...");

        const memory = new MemoryStore();
        const llm = createAzureOpenAI();

        const context = {
            db: {},
            azure: {},
            githubApi: {},
            ids: { repository: REPOSITORY_ID, rentalFolder: RENTAL_FOLDER_ID },
            REPOSITORY_ID,
            RENTAL_FOLDER_ID
        };

        const registry = createRegistry(context);
        const toolSource = registry?.tools instanceof Map 
            ? Object.fromEntries(registry.tools.entries()) 
            : (registry?.tools || registry || {});

        console.log("🧠 Total tools registered:", Object.keys(toolSource).length);

        const copilot = new CopilotOrchestrator({ registry, llm, memory });

        const app = express();

        app.use(express.json({
            limit: "25mb",
            verify: (req, res, buf) => { req.rawBody = buf.toString(); }
        }));

        // Health & Debug
        app.get("/", (req, res) => res.json({ status: "healthy", toolCount: Object.keys(toolSource).length }));

        app.get("/debug", (req, res) => {
            res.json({
                success: true,
                AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT,
                MicrosoftAppId: process.env.MicrosoftAppId ? "SET" : "MISSING",
                MicrosoftAppPassword: process.env.MicrosoftAppPassword ? "SET" : "MISSING",
                passwordLength: process.env.MicrosoftAppPassword ? process.env.MicrosoftAppPassword.length : 0
            });
        });

        // MCP endpoint
        app.post("/mcp", async (req, res) => { /* your existing mcp code */ });

        // ======================
        // TEAMS BOT
        // ======================
        const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});


    app.post("/api/messages", async (req, res) => {
    console.log("📥 Request received at /api/messages");

    try {
        await adapter.processActivity(req, res, async (turnContext) => {
            if (turnContext.activity.type !== "message") {
                console.log("Not a message activity");
                return;
            }

            const text = (turnContext.activity.text || "").trim();
            console.log("🔥 MESSAGE:", text);

            // Always use fallback to avoid serviceUrl issue
            console.log("Using fallback response");
            res.json({ 
                status: "ok", 
                message: "✅ Bot received your message: " + text 
            });
        });
    } catch (err) {
        console.error("💥 Critical error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

        app.listen(PORT, () => {
            console.log(`🚀 MCP Server running on port ${PORT}`);
        });

    } catch (err) {
        console.error("💥 Fatal startup error:", err);
        process.exit(1);
    }
}

bootstrap();