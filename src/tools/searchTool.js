import { callPowerAutomate } from "../logic/powerAutomateClient.js";

const SEARCH_TYPES = {
    CUSTOMER: {
        env: "PA_SEARCH_CUSTOMERS_URL",
        flowName: "Search Rental Customer"
    },
    EQUIPMENT: {
        env: "PA_SEARCH_EQUIPMENT_URL",
        flowName: "Search Rental Equipment"
    },
    MODEL: {
        env: "PA_SEARCH_MODEL_URL",
        flowName: "Search Rental Model"
    },
    RENTAL: {
        env: "PA_SEARCH_RENTALS_URL",
        flowName: "Search Rental Request"
    },
    REQUEST_LINES: {
        env: "PA_SEARCH_REQUEST_LINES_URL",
        flowName: "Search Request Lines"
    },
    LOOKUPS: {
        env: "PA_SEARCH_CURRENT_RENTALS_CCR_USERS",
        flowName: "Get Rental Lookups"
    },
    CUSTOMER_INFO: {
        env: "PA_SEARCH_CUSTOMER_INFO_DOOR",
        flowName: "Search Customer Delivery/DoorInfo"
    }
};

const EQUIPMENT_FIELDS = [
    "EquipSeries",
    "EquipModel",
    "Description",
    "Category",
    "Branch",
    "Status",
    "Manufacturer"
];

// Helper functions
function escapeOData(value = "") {
    return String(value).replace(/'/g, "''");
}

function buildContainsFilter(field, value) {
    return `contains(${field},'${escapeOData(value)}')`;
}

function buildFilter(type, searchTerm, input = {}) {
    switch (type) {
        case "CUSTOMER":
        case "RENTAL":
            return `contains(CustomerName,'${escapeOData(searchTerm)}')`;

        case "MODEL":
        case "REQUEST_LINES":
            return `contains(EquipModel,'${escapeOData(searchTerm)}')`;

        case "EQUIPMENT":
            if (input.filterQuery) {
                return input.filterQuery;
            }
            if (input.field) {
                return buildContainsFilter(input.field, searchTerm);
            }
            // Default: search across all major fields
            return EQUIPMENT_FIELDS
                .map(field => buildContainsFilter(field, searchTerm))
                .join(" or ");

        case "CUSTOMER_INFO":
            // Special handling if needed
            return input.filterQuery || "";

        default:
            return searchTerm;
    }
}

export function searchTool(context = {}) {
    return {
        name: "search.execute",

        description: "Searches customers, rentals, equipment, models and related rental information using Power Automate.",

        tags: ["search", "customer", "rental", "equipment", "model", "lookup"],

        aliases: [
            "search customer",
            "find customer",
            "search rental",
            "search equipment",
            "search model"
        ],

        async handler(input = {}) {
            const type = String(input.type || "").trim().toUpperCase();

            const config = SEARCH_TYPES[type];
            if (!config) {
                throw new Error(`Unsupported search type: ${type}`);
            }

            const searchTerm = input.SearchTerm ||
                              input.searchTerm ||
                              input.query ||
                              "";

            const payload = {
                filterQuery: buildFilter(type, searchTerm, input)
            };

            // Special case for CUSTOMER_INFO
            if (type === "CUSTOMER_INFO") {
                payload.filterQuerydoor = input.filterQuerydoor || "";
            }

            console.log("SEARCH PAYLOAD");
            console.log(JSON.stringify(payload, null, 2));

            const result = await callPowerAutomate({
                url: process.env[config.env],
                payload,
                flowName: config.flowName
            });

            return {
                searchType: type,
                payload,
                result,
                confidence: 0.98
            };
        }
    };
}