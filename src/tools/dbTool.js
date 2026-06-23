export function dbTool(context = {}) {
    return {
        name: "db.search",
        description:
            "Search SQL database records for rentals, quotes, customers, equipment, and business records.",
        tags: [
            "database",
            "sql",
            "records",
            "search",
            "lookup",
            "rental",
            "rentals",
            "quote",
            "quotes",
            "customer",
            "equipment"
        ],
        aliases: [
            "search database",
            "search sql",
            "find rental",
            "lookup rental",
            "get rental",
            "list rentals",
            "find customer",
            "lookup customer",
            "find quote",
            "lookup quote",
            "create rental quote",
            "rental quote"
        ],
        examples: [
            "find rental 12345",
            "show rentals for ABC Construction",
            "lookup customer ABC Construction",
            "find quote details",
            "create a rental quote for ABC Construction",
            "search equipment availability"
        ],

        async handler(input = {}) {
            const query = input.query || "";

            if (!context.db?.query) {
                throw new Error("Database query handler is not configured.");
            }

           const searchText = query
    .replace(/create a rental quote for/i, "")
    .replace(/create rental quote for/i, "")
    .replace(/generate a rental quote for/i, "")
    .replace(/generate rental quote for/i, "")
    .trim();

const rows = await context.db.query(
    `
    SELECT *
    FROM records
    WHERE name LIKE ?
       OR rentalType LIKE ?
       OR description LIKE ?
    `,
    [`%${searchText}%`, `%${searchText}%`, `%${searchText}%`]
);
            return {
                rows,
                count: rows.length,
                query,
                confidence: rows.length > 0 ? 0.95 : 0.4
            };
        }
    };
}