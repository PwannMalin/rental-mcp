import "dotenv/config";
import { readAllCritiques } from "../agent/critiqueStore.js";

/**
 * Simple regression measurement.
 *
 * After a critique fingerprint has a PR opened (or is marked fixed),
 * this job checks whether the same fingerprint reappears in newer critiques.
 *
 * Output is a console summary you can review or pipe into a report.
 */

function groupByFingerprint(rows) {
  const map = new Map();
  for (const row of rows) {
    const fp = row.fingerprint;
    if (!fp) continue;
    if (!map.has(fp)) map.set(fp, []);
    map.get(fp).push(row);
  }
  return map;
}

function hasFixMarker(rows) {
  return rows.some(
    (r) =>
      r.status === "pr_opened" ||
      r.status === "pr-opened" ||
      r.status === "fixed" ||
      r.status === "merged",
  );
}

function isRegression(rows) {
  // Sort by time
  const sorted = [...rows].sort((a, b) => new Date(a.ts) - new Date(b.ts));

  let fixSeen = false;
  let regressionCount = 0;

  for (const row of sorted) {
    const isFix =
      row.status === "pr_opened" ||
      row.status === "pr-opened" ||
      row.status === "fixed" ||
      row.status === "merged";

    if (isFix) {
      fixSeen = true;
      continue;
    }

    // A new open critique with the same fingerprint after a fix is a regression signal
    if (fixSeen && row.status === "open" && row.critique?.needsCodeChange) {
      regressionCount += 1;
    }
  }

  return regressionCount;
}

async function main() {
  const rows = await readAllCritiques();
  if (!rows.length) {
    console.log("No critiques found.");
    return;
  }

  const byFp = groupByFingerprint(rows);
  const results = [];

  for (const [fp, fpRows] of byFp) {
    if (!hasFixMarker(fpRows)) continue;

    const regressions = isRegression(fpRows);
    const latest = [...fpRows].sort((a, b) => new Date(b.ts) - new Date(a.ts))[0];

    results.push({
      fingerprint: fp,
      total: fpRows.length,
      regressions,
      latestStatus: latest?.status,
      latestSummary: latest?.critique?.summary || "",
      latestAt: latest?.ts,
    });
  }

  if (!results.length) {
    console.log("No fingerprints with a fix marker found yet.");
    return;
  }

  console.log(`Regression check for ${results.length} fixed fingerprint(s):\n`);

  let clean = 0;
  let regressed = 0;

  for (const r of results) {
    const status = r.regressions > 0 ? "REGRESSED" : "clean";
    if (r.regressions > 0) regressed += 1;
    else clean += 1;

    console.log(
      `${status.padEnd(10)} fp=${r.fingerprint}  regressions=${r.regressions}  latest=${r.latestStatus}  "${(r.latestSummary || "").slice(0, 80)}"`,
    );
  }

  console.log(`\nSummary: ${clean} clean, ${regressed} regressed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
