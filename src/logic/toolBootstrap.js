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

   const search = searchTool(context);

registry.register({
    name: "search_customers",

    description: "Find rental customers by customer name, account name, company name, or customer search term.",

    tags: ["customer", "search"],

    async handler(input = {}) {
        return await search.handler({
            type: "CUSTOMER",
            searchTerm:
                input.searchText ||
                input.searchTerm ||
                input.query ||
                ""
        });
    }
});

registry.register({
    name: "search_equipment",

    description: "Find rental equipment by model, manufacturer, category, equipment description, or equipment type.",

    tags: ["equipment", "search"],

    async handler(input = {}) {
        return await search.handler({
            type: "EQUIPMENT",
            searchTerm:
                input.searchText ||
                input.searchTerm ||
                input.query ||
                "",
            field: input.field,
            filterQuery: input.filterQuery
        });
    }
});

registry.register({
    name: "search_current_rentals",

    description: "Search active rental requests.",

    tags: ["rental", "search"],

    async handler(input = {}) {
        return await search.handler({
            type: "RENTAL",
            searchTerm:
                input.searchText ||
                input.searchTerm ||
                input.query ||
                "",
            filterQuery: input.filterQuery
        });
    }
});

registry.register({
    name: "search_models",

    description: "Find rental equipment models by model, manufacturer, category, equipment description, or equipment type.",

    tags: ["model", "search"],

    async handler(input = {}) {
        return await search.handler({
            type: "MODEL",
            searchTerm:
                input.searchText ||
                input.searchTerm ||
                input.query ||
                ""
        });
    }
});

registry.register({
    name: "search_request_lines",

    description: "Find current rental requests and active rentals for a customer.",

    tags: ["request", "lines", "search"],

    async handler(input = {}) {
        return await search.handler({
            type: "REQUEST_LINES",
            searchTerm:
                input.searchText ||
                input.searchTerm ||
                input.query ||
                ""
        });
    }
});

registry.register({
    name: "search_customer_delivery_info",

    description: "Search customer delivery and door information.",

    tags: ["customer", "delivery", "door"],

    async handler(input = {}) {
        return await search.handler({
            type: "CUSTOMER_INFO",
            searchTerm:
                input.searchText ||
                input.searchTerm ||
                input.query ||
                "",
            filterQuery:
                input.filterQuery || "",
            filterQuerydoor:
                input.filterQuerydoor || ""
        });
    }
});

registry.register({
    name: "list_rental_requests",
    description: "List rental request folders",
    tags: ["laserfiche", "rental"],
    async handler() {
        const rentals = await listRentalRequests(context.REPOSITORY_ID);
        return { count: rentals.length, rentals };
    }
});

registry.register({
    name: "get_rental_request",
    description: "Get rental request entry",
    async handler(input) {
        return await getEntry(context.REPOSITORY_ID, Number(input.entryId));
    }
});

registry.register({
    name: "export_rental_request_pdf",
    description: "Export rental request PDF",
    async handler(input) {
        return await exportDocumentPdf(context.REPOSITORY_ID, Number(input.entryId));
    }
});

registry.register({
    name: "create_rental_request",
    description: "Create rental request folder",
    async handler(input) {
        return await createFolder(
            context.REPOSITORY_ID,
            context.RENTAL_FOLDER_ID,
            input.customerName,
            true
        );
    }
});

    return registry;
}