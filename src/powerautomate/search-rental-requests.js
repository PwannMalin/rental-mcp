import { z } from "zod";

export function registerSearchRentalRequest(server, {
  searchRentalRequest,
  buildRequestFilter
}) {

  server.tool(
    "search_rental_request",
    "Search rental request headers by RequestID, Customer, status, or assigned user",
    {
      requestId: z.number().optional(),
      customer: z.string().optional(),
      status: z.string().optional(),
      assignedTo: z.string().optional(),
      branch: z.string().optional(),
      limit: z.number().min(1).max(100).optional()
    },
    async ({
      requestId,
      customer,
      status,
      assignedTo,
      branch,
      limit = 25
    }) => {

      // -----------------------------
      // 1. Validate input (IMPORTANT)
      // -----------------------------
      if (!requestId && !customer && !status && !assignedTo && !branch) {
        throw new Error(
          "You must provide at least one search parameter (requestId, customer, status, assignedTo, or branch)"
        );
      }

      // -----------------------------
      // 2. Build safe filter
      // -----------------------------
      const filterQuery = buildRequestFilter({
        requestId,
        customer,
        status,
        assignedTo,
        branch
      });

      console.log("search_rental_request filter:", filterQuery);

      // -----------------------------
      // 3. Query backend
      // -----------------------------
      const result = await searchRentalRequest({
        filterQuery,
        limit
      });

      const requests = result?.value ?? [];

      // -----------------------------
      // 4. Normalize output (trim strings)
      // -----------------------------
      const cleaned = requests.map(r => ({
        requestId: r.RequestID,
        requestType: r.RequestType,
        status: r.RequestStatus,
        customer: r.Customer?.trim?.() ?? r.Customer,
        assignedTo: r.AssignedTo,
        branch: r.Branch,
        contactName: r.ContactName,
        contactPhone: r.ContactPhone,
        requestedDelivery: r.RequestedDelivery,
        deliveryMethod: r.DeliveryMethod,
        oracleOpportunity: r.OracleOpportunity,
        erpDocument: r.ERPDocument
      }));

      // -----------------------------
      // 5. Return MCP response
      // -----------------------------
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: cleaned.length,
                results: cleaned
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
}