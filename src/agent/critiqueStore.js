import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getCritiquesContainer } from "../db/cosmos.js";

const LOG_DIR = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIR, "critiques.jsonl");

function makeRow(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    ts: new Date().toISOString(),
    chatId: entry.chatId || null,
    source: entry.source || "unknown",
    userInput: entry.userInput || "",
    draftAnswer: entry.draftAnswer || "",
    action: entry.action || "ignore",
    fingerprint: entry.fingerprint || null,
    status: entry.status || "open",
    critique: entry.critique || {},
  };
}

export async function logCritique(entry) {
  const row = makeRow(entry);

  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(LOG_FILE, JSON.stringify(row) + "\n", "utf8");
  } catch (err) {
    console.error("critiqueStore local failed:", err.message);
  }

  try {
    const container = getCritiquesContainer();
    await container.items.create(row);
  } catch (err) {
    console.error("critiqueStore Cosmos failed:", err.message);
    throw err;
  }

  return row;
}

export async function readOpenCritiques() {
  const container = getCritiquesContainer();
  const query = {
    query:
      "SELECT * FROM c WHERE c.status = @status ORDER BY c.ts DESC",
    parameters: [{ name: "@status", value: "open" }],
  };

  const { resources } = await container.items.query(query).fetchAll();
  return resources;
}

export async function readAllCritiques() {
  const container = getCritiquesContainer();
  const { resources } = await container.items
    .query("SELECT * FROM c")
    .fetchAll();
  return resources;
}

export async function markCritique(id, patch) {
  const container = getCritiquesContainer();
  const { resource } = await container.item(id, id).read();
  const updated = { ...resource, ...patch, updatedAt: new Date().toISOString() };
  await container.item(id, id).replace(updated);
  return updated;
}