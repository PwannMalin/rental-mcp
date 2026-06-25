import "dotenv/config";
import express from "express";
import { BotFrameworkAdapter } from "botbuilder";

import { createRegistry } from "./logic/toolBootstrap.js";
import { CopilotOrchestrator } from "./agent/copilotOrchestrator.js";
import { createAzureOpenAI } from "./llm/azureOpenAI.js";
import { MemoryStore } from "./memory/memoryStore.js";
import { registerWorkflows } from "./logic/workflows.js";
import { ChainEngine } from "./logic/chainEngine.js";

console.log("🔥 ENTRY FILE LOADED");

// ======================
// ENV CONFIG
// ======================
const REPOSITORY_ID = process.env.REPOSITORY_ID || process.env.REPOSITORYID;
const RENTAL_FOLDER_ID = Number(
  process.env.RENTAL_FOLDER_ID || process.env.RENTALFOLDERID || 67
);
const PORT = process.env.PORT || 8080;

if (!REPOSITORY_ID) console.warn("⚠️ REPOSITORY_ID is not set.");
if (!RENTAL_FOLDER_ID) console.warn("⚠️ RENTAL_FOLDER_ID is not set.");

// ======================
// BOOTSTRAP APP (SAFE ORDER)
// ======================
async function bootstrap() {
  try {
    // ----------------------
    // Core services
    // ----------------------
    const memory = new MemoryStore();
    const llm = createAzureOpenAI();

    // ----------------------
    // Context (single source of truth)
    // ----------------------
    const context = {
      db: {},
      azure: {},
      githubApi: {},
      ids: {
        repository: REPOSITORY_ID,
        rentalFolder: RENTAL_FOLDER_ID
      }
    };

    // ----------------------
    // Tool Registry (FIXES YOUR CRASH)
    // ----------------------
    const registry = createRegistry(context);

    if (!registry || Object.keys(registry).length === 0) {
      throw new Error("Tool registry failed to initialize");
    }

    // ----------------------
    // Workflow engine
    // ----------------------
    const chainEngine = new ChainEngine(registry);
    registerWorkflows(chainEngine);

    // ----------------------
    // AI Orchestrator
    // ----------------------
    const copilot = new CopilotOrchestrator({
      registry,
      llm,
      memory
    });

    // ----------------------
    // Express server
    // ----------------------
    const app = express();

    app.use(express.json());

    // Health check (CRITICAL for Azure)
    app.get("/", (req, res) => {
      res.status(200).send("Rental MCP is running 🚀");
    });

    // Example API endpoint
    app.post("/api/chat", async (req, res) => {
      try {
        const result = await copilot.handle(req.body);
        res.json(result);
      } catch (err) {
        console.error("❌ Chat error:", err);
        res.status(500).json({ error: "Internal error" });
      }
    });

    // ----------------------
    // START SERVER (CRITICAL)
    // ----------------------
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("💥 Fatal startup error:", err);
    process.exit(1);
  }
}

// Boot it
bootstrap();