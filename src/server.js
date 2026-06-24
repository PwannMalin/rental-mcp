import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { z } from "zod";

import { listRentalRequests } from "./laserfiche/rentals.js";
import { getEntry } from "./laserfiche/entries.js";
import { exportDocumentPdf } from "./laserfiche/export.js";
import { createFolder } from "./laserfiche/folders.js";

import { mcpSafe } from "./utils/mcpSafe.js";



const REPOSITORY_ID =
  process.env.REPOSITORY_ID;

const server = new Server(
  {
    name: "rental-mcp",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.tool(
  "list_rental_requests",
  "List all rental requests",

  {},

  async () => {

    const rentals =
      await listRentalRequests(
        REPOSITORY_ID
      );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            rentals,
            null,
            2
          )
        }
      ]
    };
  }
);

server.tool(
  "get_rental_request",

  "Retrieve a rental request by entry ID",

  {
    entryId: z.number()
  },

  async ({ entryId }) => {

    const request =
      await getEntry(
        REPOSITORY_ID,
        entryId
      );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            request,
            null,
            2
          )
        }
      ]
    };
  }
);

server.tool(
  "export_rental_request_pdf",

  "Export rental request as PDF",

  {
    entryId: z.number()
  },

  async ({ entryId }) => {

    const pdf =
      await exportDocumentPdf(
        REPOSITORY_ID,
        entryId
      );

    return {
      content: [
        {
          type: "text",
          text:
            `PDF exported successfully.
             Size: ${pdf.length} bytes`
        }
      ]
    };
  }
);

server.tool(
    "create_rental_request",
    "Create a Rental Workflow folder",
    {
        customerName: z.string()
    },
    async ({ customerName }) =>
        mcpSafe(async () => {
            const folder = await createFolder(
                process.env.REPOSITORY_ID,
                process.env.RENTAL_FOLDER_ID,
                customerName,
                true
            );

            return {
                content: [
                    {
                        type: "text",
                        text: `✅ Folder created\n\nName: ${folder.name}\nID: ${folder.id}\nPath: ${folder.fullPath}`
                    }
                ]
            };
        })
);