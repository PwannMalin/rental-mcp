import restify from "restify";
import { BotFrameworkAdapter } from "botbuilder";
import { CopilotOrchestrator } from "../agent/copilotOrchestrator.js";
import { registry } from "../logic/toolBootstrap.js";
import { createAzureOpenAI } from "../llm/azureOpenAI.js";
import { MemoryStore } from "../memory/memoryStore.js";
import { registerMessageHandler } from "./message.js";

// --------------------
// Server
// --------------------
console.log("🔥 SERVER FILE STARTED");
server.get("/", (req, res) => {
    res.send(200, { ok: true });
});
const server = restify.createServer();
server.listen(process.env.PORT || 3978, () => {
    console.log("Teams bot running...");
});

// --------------------
// Adapter
// --------------------
const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

// --------------------
// Core services
// --------------------
const llm = createAzureOpenAI();
const memory = new MemoryStore();

const copilot = new CopilotOrchestrator({
    registry,
    llm,
    memory
});

// --------------------
// Register handler (CLEAN)
// --------------------
const messageHandler = registerMessageHandler({
    adapter,
    copilot
});

server.post("/api/messages", messageHandler);