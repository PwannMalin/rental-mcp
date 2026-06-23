import { z } from "zod";

export function registerSearchModels(server, {
  searchModels,
  buildModelFilter
}) {

  server.tool(
    "search_models",
    "Search equipment models by model code, make, or series",
    {
      query: z.string().optional(),
      model: z.string().optional(),
      make: z.string().optional(),
      series: z.string().optional(),
      group: z.string().optional(),
      limit: z.number().min(1).max(100).optional()
    },

    async ({
      query,
      model,
      make,
      series,
      group,
      limit = 25
    }) => {

      // -----------------------------
      // 1. VALIDATION
      // -----------------------------
      if (!query && !model && !make && !series && !group) {
        throw new Error(
          "Provide at least one search parameter (query, model, make, series, group)"
        );
      }

      // -----------------------------
      // 2. BUILD FILTER
      // -----------------------------
      const filterQuery = buildModelFilter({
        query,
        model,
        make,
        series,
        group
      });

      console.log("search_models filter:", filterQuery);

      // -----------------------------
      // 3. BACKEND CALL
      // -----------------------------
      const result = await searchModels({
        filterQuery,
        limit
      });

      const items = result?.value ?? [];

      // -----------------------------
      // 4. NORMALIZE OUTPUT
      // -----------------------------
      const cleaned = items.map(m => ({
        group: m.Group?.trim(),
        series: m.Series?.trim(),
        make: m.Make?.trim(),
        model: m.Model?.trim()
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