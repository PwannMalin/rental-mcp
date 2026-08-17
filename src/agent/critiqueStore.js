import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const LOG_DIR = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIR, "critiques.jsonl");

export async function logCritique(entry) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  const row = {
    id: entry.id || crypto.randomUUID(),
    at: new Date().toISOString(),
    ...entry,
  };
  await fs.appendFile(LOG_FILE, JSON.stringify(row) + "\n", "utf8");
  return row;
}