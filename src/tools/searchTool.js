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
    "Serial",
    "Make",
    "Model",
    "Series",
    "OACH",
    "Descrip"
];

const EQUIPMENT_ALIASES = {
    raymond: "RAYE",
    ray: "RAYE",
    raye: "RAYE"
};

function normalizeEquipmentSearchTerm(value = "") {
    const raw = String(value || "").trim();
    const key = raw.toLowerCase();

    return EQUIPMENT_ALIASES[key] || raw;
};

const adjustedSearch =
    EQUIPMENT_ALIASES[
        searchTerm.toLowerCase()
    ] || searchTerm;


function escapeOData(value = "") {
    return String(value).replace(/'/g, "''");
}

function buildContainsFilter(field, value) {
    return `contains(${field},'${escapeOData(value)}')`;
}

function buildFilter(type, searchTerm, input = {}) {
    const term = (searchTerm || "").trim();

    switch (type) {
        case "CUSTOMER":
        case "RENTAL":
            return `contains(CustomerName,'${escapeOData(term)}')`;

        case "MODEL":
        case "REQUEST_LINES":
            return `contains(EquipModel,'${escapeOData(term)}')`;

        case "EQUIPMENT":
            if (input.filterQuery) return input.filterQuery;
            if (input.field) return buildContainsFilter(input.field, term);

            // Default multi-field search
            return EQUIPMENT_FIELDS
                .map(field => buildContainsFilter(field, term))
                .join(" or ");

        case "CUSTOMER_INFO":
            return input.filterQuery || "";

        default:
            return term;
    }
}

export function searchTool() {
    return {
        name: "search.execute",

        description: "Powerful search across customers, rentals, equipment, models and related data.",

        
parameters: {
    type: "object",
    properties: {
        type: {
            type: "string",
            enum: ["CUSTOMER", "EQUIPMENT", "MODEL", "RENTAL", "REQUEST_LINES", "LOOKUPS", "CUSTOMER_INFO"],
            description: "Type of search to perform. Use CUSTOMER for customer name or branch lookups."
        },
        SearchTerm: {
            type: "string",
            description: "The main search term, such as customer name, model, equipment, or rental request. For follow-up questions, reuse the prior search term if available."
        },
        field: {
            type: "string",
            description: "Specific field to search in for equipment or advanced searches."
        },
        filterQuery: {
            type: "string",
            description: "Custom OData filter. Use this when SearchTerm is unavailable or when applying a precise filter."
        },

            },
            required: ["type"]
        },

        async handler(input = {}) {
    try {
        const type = String(input.type || "").trim().toUpperCase();
        const config = SEARCH_TYPES[type];

        if (!config) {
            return {
                success: false,
                error: `Unsupported search type: ${type}. Use CUSTOMER, EQUIPMENT, MODEL, RENTAL, REQUEST_LINES, LOOKUPS, or CUSTOMER_INFO.`
            };
        }

        const searchTerm = input.SearchTerm || input.searchTerm || input.query || "";

        if (!searchTerm && !input.filterQuery) {
            return {
                success: false,
                error: "SearchTerm or filterQuery is required."
            };
        }

        const payload = {
            filterQuery: buildFilter(type, searchTerm, input)
        };

        if (type === "CUSTOMER_INFO") {
            payload.filterQuerydoor = input.filterQuerydoor || "";
        }

        console.log(`🔍 ${type} Search:`, payload);
        console.log("Environment variable:", config.env);
        console.log("URL exists:", !!process.env[config.env]);
        console.log("URL starts with:", process.env[config.env]?.substring(0, 60));

        let headers = {};

if (type === "EQUIPMENT") {
    const equipmentSearchTerm = normalizeEquipmentSearchTerm(searchTerm);

    headers = {
        equipsearchtext: equipmentSearchTerm
    };

    console.log("Equipment header search term:", equipmentSearchTerm);
}

const flowResponse = await callPowerAutomate({
    url: process.env[config.env],
    payload,
    headers,
    flowName: config.flowName
});

        /*
          Your logs show the Power Automate shape is:
          {
            success: true,
            data: {
              value: [...]
            }
          }
        */

        const rows =
            flowResponse?.data?.value ||
            flowResponse?.value ||
            flowResponse?.data ||
            [];

        const safeRows = Array.isArray(rows) ? rows : [];

        console.log(
    "FIRST ROW:",
    JSON.stringify(
        safeRows[0],
        null,
        2
    )
);
        const limit = Number(input.limit || input.top || 10);
        const preview = safeRows.slice(0, limit);

        let answer = "";

        if (type === "CUSTOMER") {
            answer = preview.length
                ? `Found ${safeRows.length} customer result(s). First ${preview.length}:\n` +
                  preview.map((row, index) => {
                      const name =
                          row.CustomerName ||
                          row.customerName ||
                          row.Name ||
                          row.name ||
                          "Unknown customer";

                      const branch =
                          row.Branch ||
                          row.branch ||
                          row.BranchName ||
                          row.branchName ||
                          "Unknown branch";

                      const customerNumber =
                          row.CustomerNumber ||
                          row.CustomerNo ||
                          row.CustomerID ||
                          row.CustomerId ||
                          row.customerNumber ||
                          "";

                      return `${index + 1}. ${name} — Branch: ${branch}${customerNumber ? ` — Customer #: ${customerNumber}` : ""}`;
                  }).join("\n")
                : `No customer results found for "${searchTerm}".`;
        } else {
            answer = preview.length
                ? `Found ${safeRows.length} result(s). Returning first ${preview.length}.`
                : `No results found for "${searchTerm}".`;
        }

        console.log(`${config.flowName} succeeded`);
        console.log("Result count:", safeRows.length);
        console.log("Preview:", JSON.stringify(preview.slice(0, 5), null, 2));

        return {
            success: true,
            searchType: type,
            searchTerm,
            filterQuery: payload.filterQuery,
            count: safeRows.length,
            returned: preview.length,
            rows: preview,
            preview,
            answer
        };

    } catch (err) {
        console.error("Search tool error:", err.message);

        return {
            success: false,
            error: err.message,
            message: "Search service temporarily unavailable. Please try again later."
        };
    }
}
    };
}