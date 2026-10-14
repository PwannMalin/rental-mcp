import { spawn } from "child_process";
import path from "path";

/**
 * Critic and Architect are offline only.
 *
 * They must never be called from the live request path
 * (CopilotOrchestrator.runStreaming, /chat, or Teams).
 *
 * Trigger them only via:
 * - /critic or /pipeline chat commands (spawn detached)
 * - /admin/critic endpoint (explicit)
 * - scheduled/nightly jobs
 *
 * The live bot only logs turns. Analysis and patching happen later.
 */

/** Start critic batch only (no PR). */
export function spawnCriticBatch() {
  const job = path.resolve("src/jobs/criticBatch.js");
  const child = spawn(process.execPath, [job], {
    cwd: path.resolve("."),
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return true;
}

/** Full nightly pipeline (critic + notify + architect). Use sparingly. */
export function spawnCriticPipeline() {
  const script = path.resolve("scripts/run-critic-pipeline.ps1");
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    {
      cwd: path.resolve("."),
      env: process.env,
      detached: true,
      stdio: "ignore",
    }
  );
  child.unref();
  return true;
}
