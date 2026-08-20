import "dotenv/config";
import express from "express";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} from "botbuilder";

import { createRegistry } from "./logic/toolBootstrap.js";
import { CopilotOrchestrator } from "./agent/copilotOrchestrator.js";
import { createAzureOpenAI } from "./llm/azureOpenAI.js";
import { MemoryStore } from "./memory/memoryStore.js";
import { createTeamsUI } from "./ui/createTeamsUI.js";
import { PublicClientApplication } from "@azure/msal-browser";

import { runCritic } from "./agent/runCritic.js";
import { logCritique } from "./agent/critiqueStore.js";
import { logChatTurn } from "./agent/chatLog.js";
import { spawnCriticBatch, spawnCriticPipeline } from "./jobs/runCriticBatchSpawn.js";

console.log("🔥 ENTRY FILE LOADED");
console.log("PA_SEARCH_USER_URL loaded?", !!process.env.PA_SEARCH_USER_URL);
// ======================
// ENV
// ======================
const REPOSITORY_ID = process.env.REPOSITORY_ID || process.env.REPOSITORYID;
const RENTAL_FOLDER_ID = Number(
  process.env.RENTAL_FOLDER_ID || process.env.RENTALFOLDERID || 67,
);
const PORT = process.env.PORT || 8080;

// ======================
// DEBUG AUTH
// ======================
function requireDebug(req, res, next) {
  const expectedKey = process.env.DEBUG_KEY;

  if (!expectedKey) {
    return res.status(500).json({
      success: false,
      error: "DEBUG_KEY not configured",
    });
  }

  const providedKey = req.headers["x-debug-key"];

  if (providedKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  next();
}
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
      RENTAL_FOLDER_ID,
    };

    const { registry, chainEngine } = createRegistry(context);

    console.log("Chain Engine:", !!chainEngine);

    if (chainEngine) {
      console.log("Available Workflows:", chainEngine.listWorkflows());
    }
    const toolSource =
      registry?.tools instanceof Map
        ? Object.fromEntries(registry.tools.entries())
        : registry?.tools || registry || {};

    console.log("🧠 Total tools registered:", Object.keys(toolSource).length);

    const copilot = new CopilotOrchestrator({ registry, llm, memory });

    const app = express();

    app.use(express.static("public"));
    app.use(
      express.json({
        limit: "25mb",
        verify: (req, res, buf) => {
          req.rawBody = buf.toString();
        },
      }),
    );

    // Health & Debug
    app.get("/health", (req, res) =>
      res.json({
        status: "healthy",
        toolCount: Object.keys(toolSource).length,
      }),
    );
    app.get("/debug", (req, res) => {
      res.json({
        success: true,
        AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT,
        MicrosoftAppId: process.env.MicrosoftAppId ? "SET" : "MISSING",
      });
    });

    app.get("/tools", (req, res) => {
      const tools = Object.values(toolSource).map((tool) => ({
        name: tool.name,
        description: tool.description,
        tags: tool.tags || [],
      }));

      res.json({
        success: true,
        count: tools.length,
        tools,
      });
    });

    app.get("/test/github/list-branches", async (req, res) => {
      try {
        const tool = toolSource["github.listBranches"];

        if (!tool) {
          return res.status(404).json({
            success: false,
            error: "github.listBranches tool not found",
            availableTools: Object.keys(toolSource),
          });
        }

        const result = await tool.handler({
          owner: req.query.owner || "PwannMalin",
          repo: req.query.repo || "rental-mcp",
        });

        res.json({
          success: true,
          tool: "github.listBranches",
          result,
        });
      } catch (err) {
        console.error("Branch ERROR", err);

        res.status(500).json({
          success: false,
          error: err.message,
          stack: err.stack,
        });
      }
    });

    app.get("/test/customer-search", async (req, res) => {
      const result = await registry.execute("search.execute", {
        type: "CUSTOMER",
        SearchTerm: req.query.customer || "Amazon",
      });

      res.json(result);
    });

    app.get("/api/user-photo", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).json({ error: "email required" });
        }

        // Your full Power Automate URL (with sig)
        const baseUrl = process.env.PA_SEARCH_USER_URL;
        // Use SearchTerm instead of email
        const url = `${baseUrl}&SearchTerm=${encodeURIComponent(email)}`;

        console.log("Calling:", url);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const text = await response.text();
          console.error("Power Automate error:", response.status, text);
          return res.status(response.status).json({
            error: "Power Automate request failed",
            status: response.status,
            body: text,
          });
        }

        const data = await response.json();
        res.json(data);
      } catch (err) {
        console.error("Proxy error:", err);
        res.status(500).json({
          error: "Failed to fetch user",
          message: err.message,
        });
      }
    });

    app.get("/test/search/all-equipment", async (req, res) => {
      const tool = toolSource["search_equipment"];

      const result = await tool.handler({
        filterQuery: "",
      });

      res.json(result);
    });

    app.get("/test/rental-requests", async (req, res) => {
      const result = await toolSource["rental_requests"].handler({
        customerNumber: "9037070",
        top: 5,
      });

      console.log(JSON.stringify(result, null, 2));

      res.json(result);
    });

    app.get("/test/search/models", async (req, res) => {
      const tool = toolSource["search_models"];

      const result = await tool.handler({
        searchText: "",
      });

      res.json(result);
    });

    app.get("/test/rental-lookups", async (req, res) => {
      const tool = toolSource["rental_lookups"];
      console.log("LOOKUPS TOOL CALLED");
      const result = await tool.handler({});

      res.json(result);
    });

    // Temporary simple version (replace with real auth later)
    app.get("/me", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).json({ error: "email required" });
      }

      const result = await registry.execute("user.lookup", {
        SearchTerm: email,
      });

      const user = result?.data?.result?.data?.data?.[0];

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      res.json({
        id: user.Id,
        email: user.Mail,
        name: user.DisplayName,
        photoUrl: user.image?.["$content"]
          ? `data:${user.image["$content-type"]};base64,${user.image["$content"]}`
          : null,
      });
    });

    app.get("/admin/llm-ping", async (req, res) => {
  try {
    const r = await llm.chat.completions.create({
      messages: [{ role: "user", content: "Reply with OK" }],
      max_tokens: 10,
    });
    res.json({
      success: true,
      content: r.choices?.[0]?.message?.content,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

    app.post("/admin/critic",  async (req, res) => {
  try {
    const { userInput, draftAnswer, toolSummary, sessionHints } = req.body || {};

    if (!userInput || !draftAnswer) {
      return res.status(400).json({
        success: false,
        error: "userInput and draftAnswer are required",
      });
    }

    const critique = await runCritic({
      llm, // same createAzureOpenAI() instance you use for the orchestrator
      userInput,
      draftAnswer,
      toolSummary: toolSummary || null,
      sessionHints: sessionHints || null,
    });

    await logCritique({
  userInput,
  draftAnswer,
  toolSummary: toolSummary || null,
  sessionHints: sessionHints || null,
  critique,
});

res.json({ success: true, critique });

    res.json({ success: true, critique });
  } catch (err) {
    console.error("CRITIC ERROR", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

    app.get("/test/request-lines", async (req, res) => {
      const tool = toolSource["search.execute"];

      const result = await tool.handler({
        type: "REQUEST_LINES",
        filterQuery: `RequestID eq ${req.query.requestId || 3035}`,
      });

      res.json(result);
    });

    app.get("/test/requests-by-customer", async (req, res) => {
      const tool = toolSource["search.execute"];

      const result = await tool.handler({
        type: "RENTAL",
        filterQuery: `Customer eq '${req.query.customer}'`,
      });

      res.json(result);
    });

   app.post("/chat", async (req, res) => {
  const message = (req.body.message || "").trim();

  // Admin: critic only
  if (/^\/critic\b/i.test(message) || /^run critic$/i.test(message)) {
    spawnCriticBatch();
    return res.json({
      success: true,
      answer: "Critic batch started. Check logs/critiques.jsonl in a minute.",
    });
  }

  // Optional: full pipeline (draft PRs possible)
  if (/^\/pipeline\b/i.test(message) || /^run pipeline$/i.test(message)) {
    spawnCriticPipeline();
    return res.json({
      success: true,
      answer: "Full critic pipeline started (critic → notify → architect). Check GitHub for draft PRs.",
    });
  }

  try {
    const result = await copilot.runStreaming(
      message,
      {
        userId: req.body.userId,
        tenantId: req.body.tenantId,
      },
      {
        typing: async () => {},
        update: async () => {},
        sendFinal: async () => {},
      }
    );

    await logChatTurn({
      source: "web",
      userId: req.body.userId,
      tenantId: req.body.tenantId,
      userInput: message,
      answer: result.answer,
      success: true,
      showPagination: !!result.showPagination,
      awaitingCustomerSelection: !!result.awaitingCustomerSelection,
    });

    res.json({
      success: true,
      answer: result.answer,
      showPagination: !!result.showPagination,
      awaitingCustomerSelection: !!result.awaitingCustomerSelection,
    });
  } catch (err) {
    console.error("CHAT ERROR", err);

    await logChatTurn({
      source: "web",
      userId: req.body?.userId,
      tenantId: req.body?.tenantId,
      userInput: message,
      answer: "",
      success: false,
      error: err.message,
    });

    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack,
    });
  }
});

    // MCP endpoint (keep your existing one)

    // ======================
    // TEAMS BOT
    // ======================
    const botFrameworkAuthentication =
      new ConfigurationBotFrameworkAuthentication(process.env);
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

      const userId = turnContext.activity.from?.id;
      const tenantId = turnContext.activity.conversation?.tenantId;

      const ui = createTeamsUI(turnContext);
      console.log("▶️ Calling copilot.runStreaming");

      try {
        const result = await copilot.runStreaming(
          text,
          { userId, tenantId },
          ui
        );

        console.log("✅ Copilot returned:", result);

        await logChatTurn({
          source: "teams",
          userId,
          tenantId,
          userInput: text,
          answer: result.answer,
          success: true,
          showPagination: !!result.showPagination,
          awaitingCustomerSelection: !!result.awaitingCustomerSelection,
        });

        await ui.sendFinal(result.answer || "I received your message.");
      } catch (err) {
        console.error("❌ Copilot error:", err.message);

        await logChatTurn({
          source: "teams",
          userId,
          tenantId,
          userInput: text,
          answer: "",
          success: false,
          error: err.message,
        });

        await turnContext.sendActivity(
          "Sorry, I had trouble with that request."
        );
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
