export function buildFilter(filters = []) {
  return filters
    .filter(f => f.value !== undefined && f.value !== null && f.value !== "")
    .map(f => {
      if (typeof f.value === "string") {
        return `${f.column} ${f.operator || "eq"} '${f.value}'`;
      }

      return `${f.column} ${f.operator || "eq"} ${f.value}`;
    })
    .join(" and ");
}