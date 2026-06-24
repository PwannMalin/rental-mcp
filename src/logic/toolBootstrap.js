import { ToolRegistry } from "./toolRegistry.js";

import { githubTool } from "../tools/githubTool.js";
import { powerAutomateTool } from "../tools/powerAutomateTool.js";
import { dbTool } from "../tools/dbTool.js";

import { requestHeaderTool } from "../tools/requestHeaderTool.js";
import { requestLineTool } from "../tools/requestLineTool.js";
import { emailTool } from "../tools/emailTool.js";
import { userLookupTool } from "../tools/userLookupTool.js";
import { searchTool } from "../tools/searchTool.js";

export function createRegistry(context = {}) {
    const registry = new ToolRegistry();

    registry.register(githubTool(context));
    registry.register(powerAutomateTool(context));
    registry.register(dbTool(context));

    registry.register(requestHeaderTool(context));
    registry.register(requestLineTool(context));
    registry.register(emailTool(context));
    registry.register(userLookupTool(context));
    registry.register(searchTool(context));

    return registry;
}