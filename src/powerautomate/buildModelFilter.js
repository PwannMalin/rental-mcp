function escapeOData(value) {
  return value.replace(/'/g, "''");
}

export function buildModelFilter({
  query,
  model,
  make,
  series,
  group
}) {
  const filters = [];

  // -----------------------------
  // EXACT MATCH FILTERS (FAST PATH)
  // -----------------------------
  if (model) {
    filters.push(`Model eq '${escapeOData(model)}'`);
  }

  if (make) {
    filters.push(`Make eq '${escapeOData(make)}'`);
  }

  if (series) {
    filters.push(`Series eq '${escapeOData(series)}'`);
  }

  if (group) {
    filters.push(`Group eq '${escapeOData(group)}'`);
  }

  // -----------------------------
  // FUZZY SEARCH (LIGHTWEIGHT)
  // -----------------------------
  if (query) {
    const q = escapeOData(query);

    filters.push(
      `(contains(Model,'${q}') or
        contains(Make,'${q}') or
        contains(Series,'${q}') or
        contains(Group,'${q}'))`
    );
  }

  return filters.length ? filters.join(" and ") : null;
}