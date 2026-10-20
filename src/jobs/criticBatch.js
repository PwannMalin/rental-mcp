import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createAzureOpenAI } from "../llm/azureOpenAI.js";
import { runCritic } from "../agent/runCritic.js";

import { getChatsContainer } from "../db/cosmos.js";
import { logCritique, readAllCritiques } from "../agent/critiqueStore.js";

const CRITIQUE_LOG = path.resolve("logs/critiques.jsonl");
const DEFAULT_LIMIT = 20;

async function readChatsFromCosmos(limit = 50) {
  const container = getChatsContainer();

  const query = {
    query: "SELECT * FROM c ORDER BY c.ts DESC OFFSET 0 LIMIT @limit",
    parameters: [{ name: "@limit", value: limit * 3 }],
  };

  const { resources } = await container.items.query(query).fetchAll();
  return resources;
}

async function readJsonl(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

function shouldCritique(chat) {
  if (!chat?.userInput?.trim()) return false;
  if (!chat.success) return false;
  if (!chat.answer?.trim()) return false;
  return true;
}

function classifyAction(critique) {
  if (!critique || critique.error) return "ignore";
  if (critique.approve === true) return "ignore";
  if (critique.needsCodeChange !== true) return "ignore";

  const text = [
    critique.summary,
    ...(critique.issues || []),
    ...(critique.requiredFixes || []),
    ...(critique.targetAreas || []),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /power automate|powerautomate|\bpa\b|dataverse|laserfiche|flow url|connector|sharepoint/.test(
      text
    )
  ) {
    return "external";
  }

  if (critique.fixType === "prompt") return "prompt";
  if (critique.fixType === "logic") return "logic";

  return "logic";
}

function fingerprint(critique, action) {
  const basis = [
    action,
    critique?.summary || "",
    (critique?.targetAreas || []).join(","),
    (critique?.requiredFixes || []).slice(0, 2).join(","),
  ].join("|");

  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

/**
 * Group chats by userKey+tenantKey and return the last 2–3 turns before the current one.
 */
function getPriorTurns(allChats, current) {
  if (!current.userKey) return [];

  const sameUser = allChats
    .filter(
      (c) =>
        c.userKey === current.userKey &&
        c.tenantKey === current.tenantKey &&
        c.id !== current.id &&
        new Date(c.ts) < new Date(current.ts),
    )
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 3)
    .reverse(); // oldest first

  return sameUser.map((c) => ({
    userInput: c.userInput,
    answer: c.answer,
    ts: c.ts,
  }));
}

function buildSessionHints(chat) {
  return {
    source: chat.source,
    isSuggestion: !!chat.isSuggestion,
    showPagination: !!chat.showPagination,
    awaitingCustomerSelection: !!chat.awaitingCustomerSelection,
    hasPendingCustomerSelection: !!chat.hasPendingCustomerSelection,
    customerSearchStateExists: !!chat.customerSearchStateExists,
    lastSearchType: chat.lastSearchType || null,
    optionsCount: chat.optionsCount ?? null,
  };
}

async function main() {
  const limit = Number(process.env.CRITIC_BATCH_LIMIT || DEFAULT_LIMIT);
  const llm = createAzureOpenAI();

  const chats = await readChatsFromCosmos(limit);

  const prior = await readAllCritiques();
  const already = new Set(prior.map((p) => p.chatId).filter(Boolean));

  const candidates = chats
    .filter(shouldCritique)
    .filter((c) => !already.has(c.id))
    .slice(0, limit); // take the newest ones

  console.log(
    `Critic batch: ${candidates.length} new chat(s) ` +
      `(skipped ${already.size} already critiqued)`,
  );

  let ok = 0;
  let fail = 0;

  for (const chat of candidates) {
    try {
      console.log(`→ ${chat.id}: "${(chat.userInput || "").slice(0, 60)}"`);

      const priorTurns = getPriorTurns(chats, chat);
      const sessionHints = buildSessionHints(chat);

      const critique = await runCritic({
        llm,
        userInput: chat.userInput,
        draftAnswer: chat.answer,
        toolSummary: null,
        sessionHints,
        priorTurns,
      });

      const action = classifyAction(critique);
      const fp = fingerprint(critique, action);

      await logCritique({
        chatId: chat.id,
        source: chat.source,
        userInput: chat.userInput,
        draftAnswer: chat.answer,
        action,
        fingerprint: fp,
        status: "open",
        critique,
      });

      console.log(
        `  approve=${critique.approve} severity=${critique.severity} ` +
          `action=${action} fp=${fp} priorTurns=${priorTurns.length}`,
      );
      ok++;
    } catch (err) {
      fail++;
      console.error(`  failed: ${err.message}`);
      await logCritique({
        chatId: chat.id,
        source: chat.source,
        userInput: chat.userInput,
        draftAnswer: chat.answer,
        action: "ignore",
        status: "error",
        critique: {
          error: true,
          summary: "Critic batch failed",
          issues: [err.message],
        },
      });
    }
  }

  console.log(`Done. ok=${ok} fail=${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
