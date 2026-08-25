import { runAgent, parseJsonFromAgent } from "./runAgent.js";
import { CRITIC_SYSTEM, buildCriticUserPayload } from "./prompts/critic.js";

export async function runCritic({
  llm,
  userInput,
  draftAnswer,
  toolSummary = null,
  sessionHints = null,
}) {
  const user = buildCriticUserPayload({
    userInput,
    draftAnswer,
    toolSummary,
    sessionHints,
  });

  let raw;
  try {
    const result = await runAgent({
      llm,
      system: CRITIC_SYSTEM,
      user,
      toolChoice: "none",
      temperature: 0.2,
      maxTokens: 1500,
    });
    raw = result.content;
  } catch (err) {
    return {
      approve: false,
      severity: "medium",
      fixType: "none",
      needsCodeChange: false,
      summary: "Critic failed to run",
      evidence: [],
      issues: [err.message],
      requiredFixes: [],
      targetAreas: [],
      acceptanceCriteria: [],
      userFacingNote: null,
      error: true,
    };
  }

  try {
    return parseJsonFromAgent(raw);
  } catch (err) {
    try {
      const repair = await runAgent({
        llm,
        system:
          "You fix invalid JSON. Return only a valid JSON object matching the Critic schema. No markdown.",
        user: `Fix this into valid Critic JSON:\n\n${raw}`,
        temperature: 0,
        maxTokens: 1500,
      });
      return parseJsonFromAgent(repair.content);
    } catch {
      return {
        approve: false,
        severity: "medium",
        fixType: "none",
        needsCodeChange: false,
        summary: "Critic returned invalid JSON",
        evidence: [],
        issues: ["Unparseable critic output", err.message],
        requiredFixes: [],
        targetAreas: [],
        acceptanceCriteria: [],
        userFacingNote: null,
        error: true,
        raw,
      };
    }
  }
}