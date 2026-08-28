import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getChatsContainer } from "../db/cosmos.js";

const LOG_DIR = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIR, "chats.jsonl");

function hashUser(userId) {
  if (!userId) return null;
  return crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 16);
}

/**
 * Append one chat turn. Never throws to the caller.
 */
export async function logChatTurn(entry) {
  const row = {
    id: entry.id || crypto.randomUUID(),
    ts: new Date().toISOString(),
    source: entry.source || "unknown",
    userKey: hashUser(entry.userId),
    tenantKey: hashUser(entry.tenantId),
    userInput: entry.userInput || "",
    answer: entry.answer || "",
    success: entry.success !== false,
    showPagination: !!entry.showPagination,
    awaitingCustomerSelection: !!entry.awaitingCustomerSelection,
    error: entry.error || null,
  };

  // Local file (keep for now)
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(LOG_FILE, JSON.stringify(row) + "\n", "utf8");
  } catch (err) {
    console.error("chatLog local failed:", err.message);
  }

  // Cosmos DB
  try {
    const container = getChatsContainer();
    await container.items.create(row);
  } catch (err) {
    console.error("chatLog Cosmos failed:", err.message);
  }
}