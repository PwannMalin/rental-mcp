function escapeOData(value) {
  return value.replace(/'/g, "''");
}

export function buildEquipmentFilter({
  search,
  serial,
  make,
  model,
  series,
  branch
}) {
  const filters = [];

  // -----------------------------
  // EXACT LOOKUPS FIRST (FAST PATHS)
  // -----------------------------
  if (serial) {
    filters.push(`Serial eq '${escapeOData(serial)}'`);
  }

  if (make) {
    filters.push(`Make eq '${escapeOData(make)}'`);
  }

  if (model) {
    filters.push(`Model eq '${escapeOData(model)}'`);
  }

  if (series) {
    filters.push(`Series eq '${escapeOData(series)}'`);
  }

  if (branch) {
    filters.push(`Branch eq '${escapeOData(branch)}'`);
  }

  // -----------------------------
  // FUZZY SEARCH (MULTI-FIELD)
  // -----------------------------
  if (search) {
    const q = escapeOData(search);

    filters.push(
      `(contains(Make,'${q}') or
        contains(Model,'${q}') or
        contains(Series,'${q}') or
        contains(Description,'${q}') or
        contains(MalinID,'${q}') or
        contains(Serial,'${q}'))`
    );
  }

  return filters.length ? filters.join(" and ") : null;
}