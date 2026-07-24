import { searchTool } from "./tools/searchTool.js";

export class Orchestrator {
    constructor(registry) {
        this.registry = registry;
    }

    async executeSearch(input) {
        // Use the search tool
        const search = searchTool();

        // Call the search tool handler
        const result = await search.handler(input);

        // Return the result
        return result;
    }

    // Additional orchestrator methods could be added here
}

// Note: This file is minimal and mainly delegates to searchTool. The schema-aware filtering is implemented in searchTool.
