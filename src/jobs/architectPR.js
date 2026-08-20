import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { createAzureOpenAI } from "../llm/azureOpenAI.js";
import { createRegistry } from "../logic/toolBootstrap.js";
import { runAgent, parseJsonFromAgent } from "../agent/runAgent.js";
import {
  ARCHITECT_SYSTEM,
  buildArchitectUserPayload,
  PATCH_SYSTEM,
} from "../agent/prompts/architect.js";
import { logCritique } from "../agent/critiqueStore.js";

const CRITIQUE_LOG = path.resolve("logs/critiques.jsonl");
const OWNER = process.env.GITHUB_OWNER || "PwannMalin";
const REPO = process.env.GITHUB_REPO || "rental-mcp";
const BASE = process.env.GITHUB_BASE_BRANCH || "main";

const ALLOW_PREFIXES = ["src/agent/", "src/jobs/", "src/llm/"];

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

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--(\w+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function applyReplacements(content, replacements) {
  let next = content;
  for (const { old: oldStr, new: newStr } of replacements) {
    if (!oldStr && oldStr !== "") {
      throw new Error("replacement missing old");
    }
    const count = next.split(oldStr).length - 1;
    if (count === 0) {
      throw new Error(`old string not found:\n${oldStr.slice(0, 200)}`);
    }
    if (count > 1) {
      throw new Error(`old string not unique (${count} times):\n${oldStr.slice(0, 200)}`);
    }
    next = next.replace(oldStr, newStr);
  }
  return next;
}

function isAllowedPath(p) {
  const norm = String(p || "").replace(/\\/g, "/");
  return ALLOW_PREFIXES.some((pre) => norm.startsWith(pre));
}

function pickCritique(rows, fingerprint) {
  const open = rows.filter(
    (r) =>
      r.status === "open" &&
      (r.action === "logic" || r.action === "prompt") &&
      r.critique?.needsCodeChange === true
  );

  if (fingerprint) {
    return (
      open.find((r) => r.fingerprint === fingerprint) ||
      rows.find((r) => r.fingerprint === fingerprint) ||
      null
    );
  }

  // Prefer high severity
  open.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return (rank[a.critique?.severity] ?? 9) - (rank[b.critique?.severity] ?? 9);
  });
  return open[0] || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await readJsonl(CRITIQUE_LOG);

  // Skip fingerprints that already have a PR marker
  const prOpened = new Set(
    rows.filter((r) => r.status === "pr_opened").map((r) => r.fingerprint)
  );

  let row = pickCritique(
    rows.filter((r) => !prOpened.has(r.fingerprint)),
    args.fingerprint
  );

  if (!row) {
    console.log("No open logic/prompt critique to process.");
    return;
  }

  console.log(
    `Architect: fp=${row.fingerprint} action=${row.action} severity=${row.critique?.severity}`
  );

  const llm = createAzureOpenAI();
  const planRaw = await runAgent({
    llm,
    system: ARCHITECT_SYSTEM,
    user: buildArchitectUserPayload({ critiqueRow: row }),
    temperature: 0.2,
    maxTokens: 2000,
  });

  let plan;
  try {
    plan = parseJsonFromAgent(planRaw.content);
  } catch (err) {
    console.error("Architect plan was not valid JSON:", err.message);
    console.error(planRaw.content?.slice(0, 500));
    process.exit(1);
  }

  if (!plan.canPatchCode) {
    console.log("Architect: canPatchCode=false — logging developer notes only");
    await logCritique({
      ...row,
      id: undefined,
      status: "needs_human",
      architectPlan: plan,
      critique: {
        ...row.critique,
        summary: `Needs human: ${plan.developerNotes || row.critique?.summary}`,
      },
    });
    return;
  }

  const files = (plan.files || []).filter((f) => isAllowedPath(f.path));
  if (!files.length) {
    console.log("No allowlisted files in plan — aborting PR");
    process.exit(1);
  }

  const branchName =
    plan.branchName ||
    `fix/critic-${String(row.fingerprint).slice(0, 10)}`;

  const { registry } = createRegistry({});

  // 1) Create branch from base
  console.log(`Creating branch ${branchName} from ${BASE}...`);
  await registry.execute("github.createBranch", {
    owner: OWNER,
    repo: REPO,
    branch: branchName,
    from: BASE,
    fromBranch: BASE,
    base: BASE,
  });

  const branchResult = await registry.execute("github.createBranch", {
  owner: OWNER,
  repo: REPO,
  branch: branchName,      // now accepted
  branchName: branchName,  // also fine
  baseBranch: BASE,
  from: BASE,
});
console.log("createBranch result:", JSON.stringify(branchResult, null, 2));
if (!branchResult?.success) {
  throw new Error(branchResult?.error || "createBranch failed");
}
const filesToPatch = (plan.files || []).filter((f) => isAllowedPath(f.path));
const patchedPaths = [];
  for (const fileSpec of filesToPatch) {
    const pathName = fileSpec.path; // e.g. src/agent/copilotOrchestrator.js

    console.log(`Fetching ${pathName} from ${BASE}...`);
    const fileResult = await registry.execute("github.getFile", {
      owner: OWNER,
      repo: REPO,
      path: pathName,
      branch: BASE, // start from main content
    });

    // Tool registry may wrap as { success, data }
    const fileData = fileResult?.data || fileResult;
    const original = fileData?.content;
    if (!original || typeof original !== "string") {
      throw new Error(`getFile failed for ${pathName}: ${JSON.stringify(fileResult)}`);
    }

    // If file is huge, only send relevant slices to the model (optional optimization).
    // For v1, send full file if under ~200k chars; else send instruction + key sections.
    const patchUser = {
      path: pathName,
      instruction: fileSpec.instruction,
      criticSummary: row.critique?.summary,
      requiredFixes: row.critique?.requiredFixes,
      // Truncate if needed:
      source: original.length > 180000
        ? original.slice(0, 180000) + "\n\n/* TRUNCATED */"
        : original,
    };

    console.log(`Asking model for patches on ${pathName}...`);
    const patchRaw = await runAgent({
      llm,
      system: PATCH_SYSTEM,
      user: patchUser,
      temperature: 0,
      maxTokens: 4000,
    });

    let patchPlan;
    try {
      patchPlan = parseJsonFromAgent(patchRaw.content);
    } catch (err) {
      throw new Error(`Patch JSON parse failed: ${err.message}\n${patchRaw.content?.slice(0, 400)}`);
    }

    if (!patchPlan.replacements?.length) {
      console.warn(`No replacements for ${pathName}: ${patchPlan.notes || ""}`);
      // Still write the docs plan so the PR isn't empty
      continue;
    }

        console.log(`Applying ${patchPlan.replacements.length} replacement(s)...`);
    let updated;
    try {
      updated = applyReplacements(original, patchPlan.replacements);
    } catch (err) {
      console.warn(`Skip patch for ${pathName}: ${err.message}`);
      continue;
    }

    if (updated === original) {
      console.warn(
        `Patch produced no content change for ${pathName}; continuing with plan-only PR`
      );
      continue;
    }

    const updateResult = await registry.execute("github.updateFile", {
      owner: OWNER,
      repo: REPO,
      branch: branchName,
      path: pathName,
      content: updated,
      message: `fix: ${plan.prTitle || row.critique?.summary || row.fingerprint}`.slice(0, 72),
    });
    // ... check success ...
    patchedPaths.push(pathName);

    console.log("updateFile result:", JSON.stringify(updateResult, null, 2));
    const ok = updateResult?.success !== false && (updateResult?.data?.success !== false);
    if (!ok) {
      throw new Error(updateResult?.error || "updateFile failed");
    }
  }
  // 2) v1: add a plan file on the branch (safe, reviewable)
  //    Later: github.getFile + apply patch + github.updateFile per files[]
  const planPath = `docs/critic-plans/${row.fingerprint}.md`;
  const planMarkdown = [
    `# Critic plan \`${row.fingerprint}\``,
    ``,
    `## Summary`,
    plan.prTitle || row.critique?.summary || "",
    ``,
    `## User input`,
    row.userInput || "",
    ``,
    `## Critic`,
    "```json",
    JSON.stringify(row.critique, null, 2),
    "```",
    ``,
    `## Architect plan`,
    "```json",
    JSON.stringify(plan, null, 2),
    "```",
    ``,
    `## Developer notes`,
    plan.developerNotes || "_none_",
  ].join("\n");

  // Prefer updateFile/create via your tool — names may vary; adjust to your githubTool
  try {
    await registry.execute("github.updateFile", {
      owner: OWNER,
      repo: REPO,
      branch: branchName,
      path: planPath,
      content: planMarkdown,
      message: `docs: critic plan ${row.fingerprint}`,
    });
  } catch (err) {
    console.warn(
      "github.updateFile failed (tool args may differ):",
      err.message
    );
    console.warn("Branch may still exist; create the plan file manually if needed.");
  }

  // 3) Create DRAFT pull request
  const prTitle =
    plan.prTitle || `[Critic] ${row.critique?.summary || row.fingerprint}`;
  const prBody = [
    plan.prBody || "",
    ``,
    `---`,
    `Fingerprint: \`${row.fingerprint}\``,
    `Action: \`${row.action}\``,
    `ChatId: \`${row.chatId || ""}\``,
    ``,
    `### Critic issues`,
    ...(row.critique?.issues || []).map((i) => `- ${i}`),
    ``,
    `### Acceptance criteria`,
    ...(row.critique?.acceptanceCriteria || []).map((i) => `- ${i}`),
    ``,
    ...(patchedPaths.length
  ? [
      `### Code changes`,
      ...patchedPaths.map((p) => `- Patched \`${p}\``),
      `- Review the diff carefully before merge`,
      ``,
    ]
  : [
      `### Code changes`,
      `- No source patch applied (plan/docs only)`,
      ``,
    ]),
    `> Draft PR from Architect job. Review carefully before merge.`,
  ].join("\n");

  let prResult;
  try {
    prResult = await registry.execute("github.createPullRequest", {
      owner: OWNER,
      repo: REPO,
      title: prTitle,
      body: prBody,
      head: branchName,
      base: BASE,
      draft: true,
    });
  } catch (err) {
    console.error("createPullRequest failed:", err.message);
    process.exit(1);
  }

  await logCritique({
    chatId: row.chatId,
    source: row.source,
    userInput: row.userInput,
    draftAnswer: row.draftAnswer,
    action: row.action,
    fingerprint: row.fingerprint,
    status: "pr_opened",
    pr: prResult,
    architectPlan: plan,
    critique: {
      ...row.critique,
      summary: `PR opened: ${prTitle}`,
    },
  });

  console.log("Draft PR created:", JSON.stringify(prResult, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});