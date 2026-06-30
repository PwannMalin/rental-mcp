import "dotenv/config";
import express from "express";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication
} from "botbuilder";

import { createRegistry } from "./logic/toolBootstrap.js";
import { CopilotOrchestrator } from "./agent/copilotOrchestrator.js";
import { createAzureOpenAI } from "./llm/azureOpenAI.js";
import { MemoryStore } from "./memory/memoryStore.js";
import { createTeamsUI } from "./ui/createTeamsUI.js";

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
                MicrosoftAppId: process.env.MicrosoftAppId ? "SET" : "MISSING"
            });
        });

        // MCP endpoint (keep your existing one)

        // ======================
        // TEAMS BOT
        // ======================
        const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(process.env);
        const adapter = new CloudAdapter(botFrameworkAuthentication);

        adapter.onTurnError = async (context, error) => {
            console.error("💥 onTurnError:", error);
            await context.sendActivity("Sorry, something went wrong.");
        };

        app.post("/api/messages", async (req, res) => {
            console.log("📥 Request received at /api/messages");

            try {
                await adapter.process(req, res, async (turnContext) => {
                    if (turnContext.activity.type !== "message") {
                        console.log("Not a message activity");
                        return;
                    }

                    const text = (turnContext.activity.text || "").trim();
                    console.log("🔥 MESSAGE:", text);

                    const ui = createTeamsUI(turnContext);
console.log("▶️ Calling copilot.runStreaming");
                    try {
                        const result = await copilot.runStreaming(
                            text,
                            {
                                userId: turnContext.activity.from?.id,
                                tenantId: turnContext.activity.conversation?.tenantId
                            },
                            ui
                        );
console.log("✅ Copilot returned:", result);
                        await ui.sendFinal(result.answer || "I received your message.");
                    } catch (err) {
                        console.error("❌ Copilot error:", err.message);
                        await turnContext.sendActivity("Sorry, I had trouble with that request.");
                    }
                });
            } catch (err) {
                console.error("💥 Critical handler error:", err.message);
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