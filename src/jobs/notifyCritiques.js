import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { createRegistry } from "../logic/toolBootstrap.js";
import { logCritique } from "../agent/critiqueStore.js";

const CRITIQUE_LOG = path.resolve("logs/critiques.jsonl");

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

function shouldNotify(row) {
    // TEST ONLY

  if (!row?.critique || row.critique.error) return false;
  if (row.status === "emailed" || row.status === "dismissed") return false;

  if (row.action === "external") return true;

  const includeHighLogic =
    String(process.env.NOTIFY_INCLUDE_HIGH_LOGIC || "").toLowerCase() ===
    "true";

  if (
    includeHighLogic &&
    row.action === "logic" &&
    row.critique?.severity === "high" &&
    row.critique?.needsCodeChange === true
  ) {
    return true;
  }

  return false;
}

function buildEmailBody(row) {
  const c = row.critique || {};
  return [
    `Rental MCP — developer follow-up`,
    ``,
    `Action: ${row.action}`,
    `Status: ${row.status}`,
    `Fingerprint: ${row.fingerprint || "n/a"}`,
    `ChatId: ${row.chatId || "n/a"}`,
    `When: ${row.at || ""}`,
    ``,
    `User said:`,
    row.userInput || "",
    ``,
    `Bot answered:`,
    row.draftAnswer || "",
    ``,
    `Critic summary:`,
    c.summary || "",
    ``,
    `Severity: ${c.severity || "n/a"}`,
    `Fix type: ${c.fixType || "n/a"}`,
    `Needs code change: ${c.needsCodeChange}`,
    ``,
    `Issues:`,
    ...(c.issues || []).map((i) => `- ${i}`),
    ``,
    `Required fixes:`,
    ...(c.requiredFixes || []).map((i) => `- ${i}`),
    ``,
    `Target areas:`,
    ...(c.targetAreas || []).map((i) => `- ${i}`),
    ``,
    `Acceptance criteria:`,
    ...(c.acceptanceCriteria || []).map((i) => `- ${i}`),
    ``,
    `If this is Power Automate / Laserfiche / Dataverse: update the flow or connection, then dismiss or reply in your tracker.`,
    `If this is app logic: a later Architect job may open a draft PR for the same fingerprint.`,
  ].join("\n");
}

async function main() {
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!to) {
    throw new Error("NOTIFY_EMAIL_TO is not set");
  }

  const rows = await readJsonl(CRITIQUE_LOG);
  const pending = rows.filter(shouldNotify);

  // Dedupe by fingerprint within this run (same bug, many chats)
  const seenFp = new Set();
  const unique = [];
  for (const row of pending) {
    const fp = row.fingerprint || row.id;
    if (seenFp.has(fp)) continue;
    seenFp.add(fp);
    unique.push(row);
  }

  console.log(
    `Notify: ${unique.length} critique(s) to email ` +
      `(from ${pending.length} pending rows)`
  );

  if (unique.length === 0) {
    console.log("Nothing to send.");
    return;
  }

  const { registry } = createRegistry({
    REPOSITORY_ID: process.env.REPOSITORY_ID,
    RENTAL_FOLDER_ID: Number(process.env.RENTAL_FOLDER_ID || 67),
  });

  let sent = 0;
  let fail = 0;

  for (const row of unique) {
    const subject =
      `[Rental MCP] ${row.action} — ${row.critique?.summary || "critique"}`.slice(
        0,
        120
      );
    const body = buildEmailBody(row);

    try {
      // Adjust args to match your email.send tool schema if different
      await registry.execute("email.send", {
        to,
        subject,
        body,
        text: body,
        from: process.env.NOTIFY_EMAIL_FROM || undefined,
      });

      // Append a marker row so we don't email this fingerprint again
      await logCritique({
        chatId: row.chatId,
        source: row.source,
        userInput: row.userInput,
        draftAnswer: row.draftAnswer,
        action: row.action,
        fingerprint: row.fingerprint,
        status: "emailed",
        notifyTo: to,
        critique: {
          approve: row.critique?.approve,
          severity: row.critique?.severity,
          summary: `Emailed developer: ${row.critique?.summary || ""}`,
          parentId: row.id,
        },
      });

      console.log(`  emailed fp=${row.fingerprint} action=${row.action}`);
      sent++;
    } catch (err) {
      fail++;
      console.error(`  email failed: ${err.message}`);
    }
  }

  console.log(`Done. sent=${sent} fail=${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});