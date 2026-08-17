import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const LOG_DIR = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIR, "chats.jsonl");

function hashUser(userId) {
  if (!userId) return null;
  return crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 16);
}

/**
 * Append one chat turn. Never throws to the caller (logging must not break chat).
 */
export async function logChatTurn(entry) {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });

    const row = {
      id: entry.id || crypto.randomUUID(),
      ts: new Date().toISOString(),
      source: entry.source || "unknown", // "web" | "teams"
      userKey: hashUser(entry.userId),
      tenantKey: hashUser(entry.tenantId),
      userInput: entry.userInput || "",
      answer: entry.answer || "",
      success: entry.success !== false,
      showPagination: !!entry.showPagination,
      awaitingCustomerSelection: !!entry.awaitingCustomerSelection,
      error: entry.error || null,
    };

    await fs.appendFile(LOG_FILE, JSON.stringify(row) + "\n", "utf8");
  } catch (err) {
    console.error("chatLog failed:", err.message);
  }
}