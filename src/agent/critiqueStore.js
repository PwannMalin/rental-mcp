import fs from "fs/promises";
import path from "path";

const LOG_DIR = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIR, "critiques.jsonl");

export async function logCritique(entry) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  const line = JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n";
  await fs.appendFile(LOG_FILE, line, "utf8");
}