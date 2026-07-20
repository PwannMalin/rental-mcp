import { ToolRegistry } from "./toolRegistry.js";

import { githubTool } from "../tools/githubTool.js";
import { powerAutomateTool } from "../tools/powerAutomateTool.js";
import { dbTool } from "../tools/dbTool.js";

import { requestHeaderTool } from "../tools/requestHeaderTool.js";
import { requestLineTool } from "../tools/requestLineTool.js";
import { emailTool } from "../tools/emailTool.js";
import { userLookupTool } from "../tools/userLookupTool.js";
import { searchTool } from "../tools/searchTool.js";

import { listRentalRequests } from "../laserfiche/rentals.js";
import { getEntry } from "../laserfiche/entries.js";
import { exportDocumentPdf } from "../laserfiche/export.js";
import { createFolder } from "../laserfiche/folders.js";

import { ChainEngine } from "./chainEngine.js";
import { registerWorkflows } from "./workflows.js";



export function createRegistry(context = {}) {
    console.log("🔨 toolBootstrap: createRegistry called");

    const registry = new ToolRegistry();
const chainEngine = new ChainEngine(registry);
    try {
        // === Core Tools ===
       const githubTools = githubTool(context);

githubTools.forEach(tool => registry.register(tool));

console.log(
    `✅ GitHub tools registered: ${githubTools.map(tool => tool.name).join(", ")}`
);
        registry.register(powerAutomateTool(context));
        registry.register(dbTool(context));

        registry.register(requestHeaderTool(context));
        registry.register(requestLineTool(context));
        registry.register(emailTool(context));
        registry.register(userLookupTool(context));
        registry.register(searchTool(context));
        registerWorkflows(chainEngine);
console.log(
    "Registered workflows:",
    chainEngine.listWorkflows()
);

        console.log("✅ Core tools registered successfully");

        // === Search Tools (wrappers) ===
        const search = searchTool(context);

        const searchTools = [
            {
                name: "search_customers",
                description: "Find rental customers by customer name, account name, or search term.",
                tags: ["customer", "search"],
                async handler(input = {}) {
                    return await search.handler({
                        type: "CUSTOMER",
                        SearchTerm: input.searchText || input.searchTerm || input.query || ""
                    });
                }
            },
            {
                name: "search_equipment",
                description: "Find rental equipment by model, manufacturer, or description.",
                tags: ["equipment", "search"],
                async handler(input = {}) {
                    return await search.handler({
                        type: "EQUIPMENT",
                        SearchTerm: input.searchText || input.searchTerm || input.query || "",
                        field: input.field,
                        filterQuery: input.filterQuery
                    });
                }
            },
            {
                name: "search_current_rentals",
                description: "Search active rental requests.",
                tags: ["rental", "search"],
                async handler(input = {}) {
                    return await search.handler({
                        type: "RENTAL",
                        SearchTerm: input.searchText || input.searchTerm || input.query || ""
                    });
                }
            },
            {
                name: "search_models",
                description: "Find rental equipment models.",
                tags: ["model", "search"],
                async handler(input = {}) {
                    return await search.handler({
                        type: "MODEL",
                        SearchTerm: input.searchText || input.searchTerm || input.query || ""
                    });
                }
            },
            {
                name: "search_request_lines",
                description: "Find current rental request lines.",
                tags: ["request", "lines"],
                async handler(input = {}) {
                    return await search.handler({
                        type: "REQUEST_LINES",
                        SearchTerm: input.searchText || input.searchTerm || input.query || ""
                    });
                }
            },
            {
                name: "search_customer_delivery_info",
                description: "Search customer delivery and door information.",
                tags: ["customer", "delivery"],
                async handler(input = {}) {
                    return await search.handler({
                        type: "CUSTOMER_INFO",
                        SearchTerm: input.searchText || input.searchTerm || input.query || "",
                        filterQuerydoor: input.filterQuerydoor || ""
                    });
                }
            }
        ];

        searchTools.forEach(tool => registry.register(tool));

        console.log("✅ Search tools registered");

        // === Laserfiche Tools ===
        registry.register({
            name: "list_rental_requests",
            description: "List rental request folders from Laserfiche",
            tags: ["laserfiche", "rental"],
            async handler(input = {}) {
                if (!context.REPOSITORY_ID) throw new Error("REPOSITORY_ID not configured");
                const rentals = await listRentalRequests(context.REPOSITORY_ID);
                return { count: rentals.length, rentals };
            }
        });

        registry.register({
            name: "get_rental_request",
            description: "Get details of a rental request by entry ID",
            tags: ["laserfiche"],
            async handler(input = {}) {
                const entryId = Number(input.entryId || input.id);
                if (!entryId) throw new Error("entryId is required");
                if (!context.REPOSITORY_ID) throw new Error("REPOSITORY_ID not configured");
                return await getEntry(context.REPOSITORY_ID, entryId);
            }
        });

        registry.register({
            name: "export_rental_request_pdf",
            description: "Export rental request as PDF",
            tags: ["laserfiche"],
            async handler(input = {}) {
                const entryId = Number(input.entryId || input.id);
                if (!entryId) throw new Error("entryId is required");
                if (!context.REPOSITORY_ID) throw new Error("REPOSITORY_ID not configured");
                return await exportDocumentPdf(context.REPOSITORY_ID, entryId);
            }
        });

        registry.register({
            name: "create_rental_request",
            description: "Create a new rental request folder in Laserfiche",
            tags: ["laserfiche", "create"],
            async handler(input = {}) {
                if (!input.customerName) throw new Error("customerName is required");
                if (!context.REPOSITORY_ID) throw new Error("REPOSITORY_ID not configured");

                return await createFolder(
                    context.REPOSITORY_ID,
                    context.RENTAL_FOLDER_ID,
                    input.customerName,
                    true
                );
            }
        });

        console.log("✅ Laserfiche tools registered");

    } catch (err) {
        console.error("❌ Error during tool registration:", err.message);
        console.error(err.stack);
        throw err; // Let bootstrap catch it
    }

    return  {
    registry,
    chainEngine
};
}