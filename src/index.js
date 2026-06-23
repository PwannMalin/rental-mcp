import express from "express";
import dotenv from "dotenv";
import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { listRentals } from "./tools/list-rentals.js";
import { getRental } from "./tools/get-rental.js";
import { downloadRental } from "./tools/download-rental.js";
import { extractRental } from "./tools/extract-rental.js";

// Power Automate search tools
import { searchCustomer } from "./powerautomate/search-customer.js";
import { searchEquipment } from "./powerautomate/search-equipment.js";
import { searchModels } from "./powerautomate/search-models.js";
import { searchRentalRequests } from "./powerautomate/search-rental-requests.js";

dotenv.config();

const app = express();
app.use(express.json());

const server = new McpServer({
  name: "rental-mcp",
  version: "1.0.0"
});

//
// -------------------------------
// SMART SEARCH ROUTER
// -------------------------------
//
function inferSearchType(query) {
  const q = query.toLowerCase();

  if (
    q.includes("serial") ||
    q.includes("vin") ||
    q.includes("excavator") ||
    q.includes("forklift") ||
    q.includes("cat ") ||
    q.includes("john deere")
  ) {
    return "equipment";
  }

  if (
    q.includes("request") ||
    q.includes("rental") ||
    q.includes("order")
  ) {
    return "rental_request";
  }

  if (
    q.includes("customer") ||
    q.includes("@") ||
    q.includes("email")
  ) {
    return "customer";
  }

  if (
    q.includes("model") ||
    q.includes("series")
  ) {
    return "model";
  }

  return null;
}

async function routeSearch({ query, type }) {
  switch (type) {
    case "customer":
      return await searchCustomer({ search: query });

    case "rental_request":
      return await searchRentalRequests({ search: query });

    case "equipment":
      return await searchEquipment({ search: query });

    case "model":
      return await searchModels({ search: query });

    default:
      const [customers, rentals, equipment, models] =
        await Promise.all([
          searchCustomer({ search: query }),
          searchRentalRequests({ search: query }),
          searchEquipment({ search: query }),
          searchModels({ search: query })
        ]);

      return {
        customers,
        rentals,
        equipment,
        models
      };
  }
}

//
// -------------------------------
// MCP TOOLS
// -------------------------------
//

server.tool(
  "list_rentals",
  "List rental requests from Laserfiche",
  {},
  async () => {
    const rentals = await listRentals();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(rentals, null, 2)
        }
      ]
    };
  }
);

server.tool(
  "get_rental",
  "Get rental entry by ID",
  {
    id: z.number()
  },
  async ({ id }) => {
    const rental = await getRental(id);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(rental, null, 2)
        }
      ]
    };
  }
);

//
// SMART UNIFIED SEARCH TOOL
//
server.tool(
  "search",
  "Smart unified search across customers, rentals, equipment, and models (auto-routes query)",
  {
    query: z.string()
  },
  async ({ query }) => {
    const type = inferSearchType(query);

    console.log("[SMART SEARCH]", { query, type });

    const result = await routeSearch({ query, type });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query,
              inferredType: type ?? "all",
              result
            },
            null,
            2
          )
        }
      ]
    };
  }
);

server.tool(
  "extract_rental",
  "Download rental PDF and parse HiddenJson",
  {
    id: z.number()
  },
  async ({ id }) => {
    const pdfBuffer = await downloadRental(id);
    const result = await extractRental(pdfBuffer);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

//
// -------------------------------
// MCP TRANSPORT
// -------------------------------
//

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport();

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

//
// -------------------------------
// HEALTH
// -------------------------------
//

app.get("/", (req, res) => {
  res.send("Rental MCP Running");
});

app.get("/ping", (req, res) => {
  res.send("pong");
});

//
// -------------------------------
// LOCAL TEST ENDPOINTS
// -------------------------------
//

app.get("/test-extract/:id", async (req, res) => {
  try {
    const pdfBuffer = await downloadRental(Number(req.params.id));
    const result = await extractRental(pdfBuffer);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/extract-rental/:id", async (req, res) => {
  const pdfBuffer = await downloadRental(req.params.id);
  const customers = await extractRental(pdfBuffer);
  res.json(customers);
});

//
// -------------------------------
// START SERVER
// -------------------------------
//

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`MCP listening on ${port}`);
  console.log(`PID: ${process.pid}`);
});