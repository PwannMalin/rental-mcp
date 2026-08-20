import { spawn } from "child_process";
import path from "path";

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