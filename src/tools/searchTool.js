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
    crown: "CROW",
    hyster: "HYST",
    toyota: "TOYO",
    yale: "YALE"
};

function normalizeEquipmentSearchTerm(value = "") {
    const raw = String(value || "").trim();
    const key = raw.toLowerCase();
    return EQUIPMENT_ALIASES[key] || raw;
}

function escapeOData(value = "") {
    return String(value).replace(/'/g, "''");
}

function buildContainsFilter(field, value) {
    return `contains(${field},'${escapeOData(value)}')`;
}

function validateSearchInput(input) {
    const type = String(input.type || "").toUpperCase();
    if (!type) {
        return { success: false, error: "Search type is required." };
    }
    if (!SEARCH_TYPES[type]) {
        return { success: false, error: `Unsupported search type: ${type}` };
    }
    if (type === "REQUEST_LINES" && !input.filterQuery && !input.SearchTerm) {
        return { success: false, error: "REQUEST_LINES requires SearchTerm or filterQuery." };
    }
    return null;
}

// Detect analytics intent from user query text
function detectAnalyticsIntent(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    // Keywords indicating analytics intent
    const analyticsKeywords = ["how many", "which branch", "what status", "break it out by", "show me all open requests", "count", "group by", "aggregate", "summary", "total", "list all open", "open requests"];
    return analyticsKeywords.some(kw => lower.includes(kw));
}

// Build aggregate filter and query parameters
function buildAggregateParams(input) {
    // Support count and groupBy
    const aggregate = {};
    if (input.count || /how many/i.test(input.SearchTerm || "")) {
        aggregate.count = true;
    }
    if (input.groupBy) {
        aggregate.groupBy = input.groupBy;
    } else {
        // Try to parse groupBy from SearchTerm if phrase "break it out by"
        const match = (input.SearchTerm || "").match(/break it out by ([a-zA-Z]+)/i);
        if (match) {
            aggregate.groupBy = match[1];
        }
    }
    return aggregate;
}

// Compose OData group by and aggregate filter
function composeAggregateFilter(filterQuery, aggregate) {
    if (!aggregate) return filterQuery;
    let filter = filterQuery || "";
    // This is a placeholder: actual aggregate support depends on backend
    // For now, just append groupBy as orderBy to simulate grouping
    if (aggregate.groupBy) {
        if (filter) filter += " and ";
        // No direct groupBy filter, but we can order by groupBy field
        // This is a simplification
    }
    return filter;
}

// Conversation memory and active entity tracking
const conversationMemory = {
    lastSearchType: null,
    lastSearchTerm: null,
    lastFilterQuery: null,
    lastAggregate: null
};

export function searchTool() {
    return {
        name: "search.execute",
        description: ` Search across customers, rentals, equipment, models, request lines, lookup values, and customer info.

Valid values for "type":
- CUSTOMER
- EQUIPMENT
- MODEL
- RENTAL
- REQUEST_LINES
- LOOKUPS
- CUSTOMER_INFO

Supports analytics intent detection for aggregate queries like count and group by.
`,
        parameters: {
            type: "object",
            properties: {
                type: {
                    type: "string",
                    enum: ["CUSTOMER", "EQUIPMENT", "MODEL", "RENTAL", "REQUEST_LINES", "LOOKUPS", "CUSTOMER_INFO"],
                    description: "Required. The search category. Always use this property name exactly: type. Do not use searchType."
                },
                SearchTerm: {
                    type: "string",
                    description: "The main search term. Always use this property name exactly: SearchTerm."
                },
                field: {
                    type: "string",
                    description: "Specific field to search in for equipment or advanced searches."
                },
                filterQuery: {
                    type: "string",
                    description: "Custom OData filter."
                },
                topCount: {
                    type: "number",
                    description: "Optional max number of rows to return."
                },
                orderBy: {
                    type: "string",
                    description: "Optional OData order by value."
                },
                count: {
                    type: "boolean",
                    description: "If true, return count of matching records."
                },
                groupBy: {
                    type: "string",
                    description: "Field name to group results by."
                }
            },
            required: ["type"]
        },
        async handler(input = {}) {
            try {
                const type = String(input.type || "").trim().toUpperCase();
                const searchTerm = input.SearchTerm || "";

                // Validate input
                const validationError = validateSearchInput(input);
                if (validationError) return validationError;

                // Detect analytics intent
                const isAnalytics = detectAnalyticsIntent(searchTerm);

                // Build aggregate params
                const aggregate = buildAggregateParams(input);

                // Update conversation memory
                conversationMemory.lastSearchType = type;
                conversationMemory.lastSearchTerm = searchTerm;
                conversationMemory.lastFilterQuery = input.filterQuery || null;
                conversationMemory.lastAggregate = aggregate;

                // Normalize equipment search term
                const normalizedSearchTerm = type === "EQUIPMENT" ? normalizeEquipmentSearchTerm(searchTerm) : searchTerm;

                // Auto-build filter for CUSTOMER_INFO when only CustomerNumber is given
                if (type === "CUSTOMER_INFO") {
                    const customerNumber = input.CustomerNumber || input.customerNumber || input.CustomerNo || searchTerm;
                    if (customerNumber && !input.filterQuery) {
                        input.filterQuery = `CustomerNumber eq '${String(customerNumber).trim()}'`;
                    }
                }

                const allowEmptyFilter = ["LOOKUPS", "RENTAL", "CUSTOMER_INFO"].includes(type);
                if (!allowEmptyFilter && !normalizedSearchTerm && !input.filterQuery) {
                    return { success: false, error: "SearchTerm or filterQuery is required." };
                }

                // Compose filter with aggregate if any
                const filterQuery = composeAggregateFilter(buildFilter(type, normalizedSearchTerm, input), aggregate);

                const payload = {
                    filterQuery,
                    topCount: input.topCount,
                    orderBy: input.orderBy
                };

                let headers = {};
                if (type === "EQUIPMENT") {
                    headers = { equipsearchtext: normalizedSearchTerm };
                }

                // Retry logic
                let flowResponse = null;
                let attempts = 0;
                const maxAttempts = 2;
                while (attempts < maxAttempts) {
                    try {
                        flowResponse = await callPowerAutomate({
                            url: process.env[SEARCH_TYPES[type].env],
                            payload,
                            headers,
                            flowName: SEARCH_TYPES[type].flowName
                        });
                        break;
                    } catch (err) {
                        attempts++;
                        if (attempts >= maxAttempts) {
                            throw err;
                        }
                    }
                }

                const responseBody = flowResponse?.data || {};

                // Parse rows
                let rows = [];
                if (Array.isArray(responseBody?.deliveryInfo?.value)) {
                    rows = responseBody.deliveryInfo.value;
                } else if (Array.isArray(responseBody?.value)) {
                    rows = responseBody.value;
                } else if (Array.isArray(responseBody)) {
                    rows = responseBody;
                } else if (Array.isArray(responseBody?.results?.value)) {
                    rows = responseBody.results.value;
                } else if (Array.isArray(responseBody?.data?.value)) {
                    rows = responseBody.data.value;
                } else if (Array.isArray(flowResponse?.value)) {
                    rows = flowResponse.value;
                }

                const safeRows = Array.isArray(rows) ? rows : [];

                // Limit preview
                const limit = Number(input.limit || input.top || input.topCount || 10);
                const preview = safeRows.slice(0, limit);

                // Extract fields
                let discoveredFields = preview.length > 0 ? Object.keys(preview[0]) : [];

                // Compose answer
                let answer = "";

                if (aggregate.count) {
                    answer = `Count of matching records: ${safeRows.length}`;
                } else if (aggregate.groupBy) {
                    // Grouping summary
                    const groupField = aggregate.groupBy;
                    const groupCounts = {};
                    safeRows.forEach(row => {
                        const key = row[groupField] || "(none)";
                        groupCounts[key] = (groupCounts[key] || 0) + 1;
                    });
                    answer = `Grouped by ${groupField}:\n` + Object.entries(groupCounts).map(([k, v]) => `${k}: ${v}`).join("\n");
                } else if (type === "CUSTOMER") {
                    answer = preview.length
                        ? `Found ${safeRows.length} customer result(s). First ${preview.length}:\n` +
                          preview.map((row, i) => {
                              const name = row.CustomerName || row.customerName || row.Name || row.name || "Unknown customer";
                              const branch = row.Branch || row.branch || "Unknown branch";
                              const customerNumber = row.CustomerNumber || row.CustomerNo || row.customerNumber || "";
                              return `${i + 1}. ${name} — Branch: ${branch}${customerNumber ? ` — Customer #: ${customerNumber}` : ""}`;
                          }).join("\n")
                        : `No customer results found for "${searchTerm}".`;
                } else if (type === "CUSTOMER_INFO") {
                    answer = preview.length
                        ? `Found ${safeRows.length} delivery/door record(s):\n` +
                          preview.map((row, i) => {
                              const height = row.DeliveryDoorHeightInches ?? "—";
                              const dock = row.hasDock ? "Yes" : "No";
                              const ramp = row.hasRamp ? "Yes" : "No";
                              const ground = row.hasGround ? "Yes" : "No";
                              const contact = row.RentalContactName || "";
                              return `${i + 1}. Customer ${row.CustomerNumber} — Door Height: ${height}\" | Dock: ${dock} | Ramp: ${ramp} | Ground: ${ground}${contact ? ` | Contact: ${contact}` : ""}`;
                          }).join("\n")
                        : `No delivery/door information found.`;
                } else {
                    answer = preview.length
                        ? `Found ${safeRows.length} result(s). Returning first ${preview.length}.`
                        : `No results found for "${searchTerm}".`;
                }

                return {
                    success: true,
                    searchType: type,
                    searchTerm,
                    filterQuery: payload.filterQuery,
                    count: safeRows.length,
                    returned: preview.length,
                    rows: preview,
                    preview,
                    discoveredFields,
                    answer
                };
            } catch (err) {
                return {
                    success: false,
                    error: err.message,
                    message: "Search service temporarily unavailable. Please try again later."
                };
            }
        }
    };
}

// Reuse existing buildFilter from original code
function buildFilter(type, searchTerm, input = {}) {
    const term = String(searchTerm || "").trim();
    switch (type) {
        case "CUSTOMER":
            if (input.filterQuery) return input.filterQuery;
            return term ? `contains(CustomerName,'${escapeOData(term)}')` : "";
        case "LOOKUPS":
            return input.filterQuery || "";
        case "RENTAL":
            return input.filterQuery || "";
        case "MODEL":
            return input.filterQuery || (term ? `contains(EquipModel,'${escapeOData(term)}')` : "");
        case "REQUEST_LINES":
            return input.filterQuery || "";
        case "EQUIPMENT":
            if (input.filterQuery) return input.filterQuery;
            if (input.field) return buildContainsFilter(input.field, term);
            return EQUIPMENT_FIELDS.map(field => buildContainsFilter(field, term)).join(" or ");
        case "CUSTOMER_INFO":
            return input.filterQuery || "";
        default:
            return term;
    }
}
