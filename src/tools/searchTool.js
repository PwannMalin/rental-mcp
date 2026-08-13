import { callPowerAutomate } from "../logic/powerAutomateClient.js";

const SEARCH_TYPES = {
  CUSTOMER: {
    env: "PA_SEARCH_CUSTOMERS_URL",
    flowName: "Search Rental Customer",
  },
  EQUIPMENT: {
    env: "PA_SEARCH_EQUIPMENT_URL",
    flowName: "Search Rental Equipment",
  },
  MODEL: {
    env: "PA_SEARCH_MODEL_URL",
    flowName: "Search Rental Model",
  },
  RENTAL: {
    env: "PA_SEARCH_RENTALS_URL",
    flowName: "Search Rental Request",
  },
  REQUEST_LINES: {
    env: "PA_SEARCH_REQUEST_LINES_URL",
    flowName: "Search Request Lines",
  },
  LOOKUPS: {
    env: "PA_SEARCH_CURRENT_RENTALS_CCR_USERS",
    flowName: "Get Rental Lookups",
  },
  CUSTOMER_INFO: {
    env: "PA_SEARCH_CUSTOMER_INFO_DOOR",
    flowName: "Search Customer Delivery/DoorInfo",
  },
};

const EQUIPMENT_FIELDS = [
  "Serial",
  "Make",
  "Model",
  "Series",
  "OACH",
  "Descrip",
];

const EQUIPMENT_ALIASES = {
  raymond: "RAYE",
  crown: "CROW",
  hyster: "HYST",
  toyota: "TOYO",
  yale: "YALE",
};
console.log("Equipment fields:", EQUIPMENT_FIELDS);
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
    return {
      success: false,
      error: "Search type is required.",
    };
  }

  if (!SEARCH_TYPES[type]) {
    return {
      success: false,
      error: `Unsupported search type: ${type}`,
    };
  }

  if (type === "REQUEST_LINES" && !input.filterQuery && !input.SearchTerm) {
    return {
      success: false,
      error: "REQUEST_LINES requires SearchTerm or filterQuery.",
    };
  }

  return null;
}

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
      return (
        input.filterQuery ||
        (term ? `contains(EquipModel,'${escapeOData(term)}')` : "")
      );

    case "REQUEST_LINES":
      return input.filterQuery || "";

    case "EQUIPMENT":
      if (input.filterQuery) return input.filterQuery;
      if (input.field) return buildContainsFilter(input.field, term);

      return EQUIPMENT_FIELDS.map((field) =>
        buildContainsFilter(field, term),
      ).join(" or ");

    case "CUSTOMER_INFO":
      return input.filterQuery || "";

    default:
      return term;
  }
}

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
- CUSTOMER_INFO          ← for door height / delivery info

Important:
- Use CUSTOMER for customer names or customer numbers when you only need basic info.
- Use returnAll: true or say "all customers", "every customer", or "list all customers" to retrieve every matching customer.
- CUSTOMER searches default to 100 rows unless returnAll is true.
- Example normal customer search payload:
  {
    "type": "CUSTOMER",
    "SearchTerm": "Acme"
  }
- Example all-customer search payload:
  {
    "type": "CUSTOMER",
    "SearchTerm": "all customers",
    "returnAll": true
  }
- Use CUSTOMER_INFO when you need door height, dock, ramp, or delivery information.
- For CUSTOMER_INFO always pass a filterQuery like: CustomerNumber eq '9045180'
- Use CUSTOMER for customer names.
- Use RENTAL only for rental request headers.
- Do not search RENTAL by CustomerName.
- Customer rental lookup flow is:
  1. CUSTOMER search by contains(CustomerName,'name')
  2. Extract CustomerNumber
  3. RENTAL search by Customer eq 'CustomerNumber'
- Preserve filterQuery exactly when provided.
- Use REQUEST_LINES with RequestID to retrieve request lines.
`,

    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "CUSTOMER",
            "EQUIPMENT",
            "MODEL",
            "RENTAL",
            "REQUEST_LINES",
            "LOOKUPS",
            "CUSTOMER_INFO",
          ],
          description:
            "Required. The search category. Always use this property name exactly: type. Do not use searchType.",
        },

        SearchTerm: {
          type: "string",
          description:
            "The main search term. Always use this property name exactly: SearchTerm. Do not use searchTerm unless the user is debugging legacy calls.",
        },

        field: {
          type: "string",
          description:
            "Specific field to search in for equipment or advanced searches.",
        },

        filterQuery: {
          type: "string",
          description:
            "Custom OData filter. For CUSTOMER name searches, prefer contains(CustomerName,'name'). For RENTAL searches, use Customer eq 'customerNumber'. Never use CustomerName in RENTAL filters.",
        },

        topCount: {
          type: "number",
          description:
            "Optional max number of rows to return. If omitted for CUSTOMER searches, the default is 100.",
        },

        returnAll: {
          type: "boolean",
          description:
            "When true for CUSTOMER searches, fetch all pages of Dataverse/List Rows results using nextLink/skipToken and return all matching customers.",
        },

        orderBy: {
          type: "string",
          description:
            "Optional OData order by value, such as CustomerName desc. This must be text, not a number.",
        },
      },
      required: ["type"],
    },

    async handler(input = {}) {
      try {
        console.log("RAW INPUT:", JSON.stringify(input, null, 2));

        const type = String(
          input.type || input.searchType || input.SearchType || "",
        )
          .trim()
          .toUpperCase();
        console.log("RESOLVED TYPE:", type);
        const validationError = validateSearchInput(input);

        if (validationError) {
          return validationError;
        }

        const config = SEARCH_TYPES[type];

        if (!config) {
          return {
            success: false,
            error: `Unsupported search type: ${type}. Use CUSTOMER, EQUIPMENT, MODEL, RENTAL, REQUEST_LINES, LOOKUPS, or CUSTOMER_INFO.`,
          };
        }

        const searchTerm =
          input.SearchTerm ||
          input.searchTerm ||
          input.searchText ||
          input.SearchText ||
          input.query ||
          "";

        const normalizedSearchTerm =
          type === "EQUIPMENT"
            ? normalizeEquipmentSearchTerm(searchTerm)
            : searchTerm;

        const allSearchMatch = String(searchTerm || "")
          .trim()
          .toLowerCase()
          .match(
            /^\s*(all|every|list all|show all|all customers|every customer)\b(?:\s+(.*))?$/,
          );

        const wantsAllCustomers =
          type === "CUSTOMER" && Boolean(allSearchMatch);

        const effectiveSearchTerm =
          type === "CUSTOMER" && wantsAllCustomers
            ? allSearchMatch?.[2] || ""
            : normalizedSearchTerm;

        const allowEmptyFilter =
          type === "LOOKUPS" ||
          type === "RENTAL" ||
          type === "CUSTOMER_INFO" ||
          (type === "CUSTOMER" && wantsAllCustomers);

        if (!allowEmptyFilter && !searchTerm && !input.filterQuery) {
          return {
            success: false,
            error: "SearchTerm or filterQuery is required.",
          };
        }

        const payload = {
          filterQuery: buildFilter(type, effectiveSearchTerm, input),
          topCount:
            type === "CUSTOMER"
              ? Number(
                  input.topCount ||
                    input.limit ||
                    (wantsAllCustomers ? 2000 : 100),
                )
              : input.topCount,
          returnAll:
            type === "CUSTOMER" ? input.returnAll || wantsAllCustomers : false,
          orderBy: input.orderBy,
        };

        // Auto-build filter for CUSTOMER_INFO when only CustomerNumber is given
        if (type === "CUSTOMER_INFO") {
          const customerNumber =
            input.CustomerNumber || input.customerNumber || input.CustomerNo;

          if (customerNumber && !input.filterQuery && !searchTerm) {
            input.filterQuery = `CustomerNumber eq '${String(customerNumber).trim()}'`;
          }
        }

        console.log(`🔍 ${type} Search:`, payload);
        console.log("Environment variable:", config.env);
        console.log("URL exists:", !!process.env[config.env]);
        console.log(
          "URL starts with:",
          process.env[config.env]?.substring(0, 60),
        );

        let headers = {};

        if (type === "EQUIPMENT") {
          const equipmentSearchTerm = normalizedSearchTerm;
          headers = { equipsearchtext: equipmentSearchTerm };
          console.log("Equipment header search term:", equipmentSearchTerm);
        }

        const flowResponse = await callPowerAutomate({
          url: process.env[config.env],
          payload,
          headers,
          flowName: config.flowName,
        });

        if (type === "LOOKUPS") {
          console.log(
            "RAW LOOKUPS RESPONSE:",
            JSON.stringify(flowResponse, null, 2),
          );
        }

        const responseBody = flowResponse?.data || {};

        if (type === "LOOKUPS" && Array.isArray(responseBody)) {
          const lookupGroups = {};
          responseBody.forEach((item) => {
            lookupGroups[item.type] = item.load?.value || [];
          });
          return {
            success: true,
            searchType: type,
            lookupGroups,
            count: Object.keys(lookupGroups).length,
            rows: lookupGroups,
          };
        }

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

        console.log(
          "ROWS LENGTH:",
          Array.isArray(rows) ? rows.length : "NOT ARRAY",
        );
        console.log("FIRST ROW:", JSON.stringify(safeRows[0], null, 2));

        // Decide how many rows to actually return to the orchestrator
        const requestedTop = Number(
          input.topCount || input.limit || input.top || 0,
        );

        const defaultTop =
          type === "CUSTOMER" ? 100 : type === "RENTAL" ? 50 : 25;

        const limit = requestedTop > 0 ? requestedTop : defaultTop;

        // For CUSTOMER we want the orchestrator to see a useful number of rows
        // so it can paginate / enrich. Don’t artificially cap at 10.
        const rowsToReturn = safeRows.slice(
          0,
          Math.min(safeRows.length, limit),
        );

        // Small preview just for the human-readable answer
        const previewLimit = Math.min(rowsToReturn.length, 25);
        const preview = rowsToReturn.slice(0, previewLimit);

        // Extract discovered fields from the first row
        let discoveredFields = [];
        if (rowsToReturn.length > 0) {
          discoveredFields = Object.keys(rowsToReturn[0]);
        }

        let answer = "";

        if (type === "CUSTOMER") {
          answer = rowsToReturn.length
            ? `Found ${safeRows.length} customer result(s). Showing first ${preview.length}:\n` +
              preview
                .map((row, index) => {
                  const name =
                    row.CustomerName ||
                    row.customerName ||
                    row.Name ||
                    row.name ||
                    "Unknown customer";
                  const branch = row.Branch || row.branch || "Unknown branch";
                  const customerNumber =
                    row.CustomerNumber ||
                    row.CustomerNo ||
                    row.customerNumber ||
                    "";
                  return `${index + 1}. ${name} — Branch: ${branch}${customerNumber ? ` — Customer #: ${customerNumber}` : ""}`;
                })
                .join("\n")
            : `No customer results found for "${searchTerm}".`;
        } else if (type === "CUSTOMER_INFO") {
          answer = preview.length
            ? `Found ${safeRows.length} delivery/door record(s):\n` +
              preview
                .map((row, index) => {
                  const height = row.DeliveryDoorHeightInches ?? "—";
                  const dock = row.hasDock ? "Yes" : "No";
                  const ramp = row.hasRamp ? "Yes" : "No";
                  const ground = row.hasGround ? "Yes" : "No";
                  const contact = row.RentalContactName || "";
                  return `${index + 1}. Customer ${row.CustomerNumber} — Door Height: ${height}" | Dock: ${dock} | Ramp: ${ramp} | Ground: ${ground}${contact ? ` | Contact: ${contact}` : ""}`;
                })
                .join("\n")
            : `No delivery/door information found.`;
        } else {
          answer = preview.length
            ? `Found ${safeRows.length} result(s). Returning first ${preview.length}.`
            : `No results found for "${searchTerm}".`;
        }

        console.log(`${config.flowName} succeeded`);
        console.log("Result count:", safeRows.length);
        console.log("Returning to orchestrator:", rowsToReturn.length);

        return {
          success: true,
          searchType: type,
          searchTerm,
          filterQuery: payload.filterQuery,
          count: safeRows.length, // real total from Power Automate
          returned: rowsToReturn.length,
          rows: rowsToReturn, // ← now up to 100 for CUSTOMER
          preview,
          discoveredFields,
          answer,
        };
      } catch (err) {
        console.error("Search tool error:", err.message);
        if (type === "CUSTOMER") {
          answer = preview.length
            ? `Found ${safeRows.length} customer result(s). First ${preview.length}:\n` +
              preview
                .map((row, index) => {
                  const name =
                    row.CustomerName ||
                    row.customerName ||
                    row.Name ||
                    row.name ||
                    "Unknown customer";
                  const branch = row.Branch || row.branch || "Unknown branch";
                  const customerNumber =
                    row.CustomerNumber ||
                    row.CustomerNo ||
                    row.customerNumber ||
                    "";
                  return `${index + 1}. ${name} — Branch: ${branch}${customerNumber ? ` — Customer #: ${customerNumber}` : ""}`;
                })
                .join("\n")
            : `No customer results found for "${searchTerm}".`;
        }
      }
    },
  };
}
