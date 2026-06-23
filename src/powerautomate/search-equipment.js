import { z } from "zod";

export function registerSearchEquipment(server, {
  searchEquipment,
  buildEquipmentFilter
}) {

  server.tool(
    "search_equipment",
    "Search available equipment by serial, model, make, series, description, or branch",
    {
      query: z.string().optional(),
      serial: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
      series: z.string().optional(),
      branch: z.string().optional(),
      limit: z.number().min(1).max(100).optional()
    },

    async ({
      query,
      serial,
      make,
      model,
      series,
      branch,
      limit = 25
    }) => {

      // -----------------------------
      // 1. VALIDATION
      // -----------------------------
      if (!query && !serial && !make && !model && !series && !branch) {
        throw new Error(
          "Provide at least one search parameter (query, serial, make, model, series, branch)"
        );
      }

      // -----------------------------
      // 2. BUILD FILTER
      // -----------------------------
      const filterQuery = buildEquipmentFilter({
        search: query,
        serial,
        make,
        model,
        series,
        branch
      });

      console.log("search_equipment filter:", filterQuery);

      // -----------------------------
      // 3. CALL BACKEND
      // -----------------------------
      const result = await searchEquipment({
        filterQuery,
        limit
      });

      const items = result?.value ?? [];

      // -----------------------------
      // 4. NORMALIZE OUTPUT
      // -----------------------------
      const cleaned = items.map(e => ({
        internalId: e.InternalID,
        group: e.Group?.trim(),
        series: e.Series?.trim(),
        make: e.Make?.trim(),
        model: e.Model?.trim(),
        serial: e.Serial?.trim(),
        malinId: e.MalinID?.trim(),
        description: e.Description?.trim(),
        branch: e.Branch?.trim(),
        department: e.EquipDeptName?.trim()
      }));

      // -----------------------------
      // 5. RESPONSE
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