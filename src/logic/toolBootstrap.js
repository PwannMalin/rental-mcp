import { ToolRegistry } from "./toolRegistry.js";

import { githubTool } from "../tools/githubTool.js";
import { powerAutomateTool } from "../tools/powerAutomateTool.js";
import { dbTool } from "../tools/dbTool.js";

export function createRegistry(context = {}) {
    const registry = new ToolRegistry();

    registry.register(githubTool(context));
    registry.register(powerAutomateTool(context));
    registry.register(dbTool(context));

    return registry;
}