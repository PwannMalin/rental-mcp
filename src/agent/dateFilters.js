export function getNow() {
  const now = new Date();
  return {
    now,
    iso: now.toISOString(),
    ymd: now.toISOString().slice(0, 10),
    year: now.getFullYear(),
    local: now.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    monthAgo: new Date(now.getTime() - 30 * 86400000)
      .toISOString()
      .slice(0, 10),
  };
}

export function resolveDateRange(userInput) {
  const text = String(userInput || "").toLowerCase();
  const now = new Date();
  const end = now.toISOString();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

  if (/past month|last month|last 30|past mo/.test(text)) {
    return { ge: daysAgo(30), lt: end };
  }
  if (/past quarter|last quarter/.test(text)) {
    return { ge: daysAgo(90), lt: end };
  }
  if (/this year|started this year/.test(text)) {
    return { ge: `${now.getUTCFullYear()}-01-01T00:00:00Z`, lt: end };
  }
  if (/\btoday\b/.test(text)) {
    return { ge: `${now.toISOString().slice(0, 10)}T00:00:00Z`, lt: end };
  }
  return null;
}

export function applyDateFilter(userInput, args = {}) {
  const next = { ...args };
  const range = resolveDateRange(userInput);
  if (!range) return next;

  const type = String(next.type || "").toUpperCase();
  if (type !== "RENTAL") return next;

  const field = "RequestedOn";
  const dateClause = `${field} ge ${range.ge} and ${field} lt ${range.lt}`;

  if (next.filterQuery && /2023|2024/.test(next.filterQuery)) {
    next.filterQuery = next.filterQuery.replace(
      /20(23|24)-\d{2}-\d{2}[^'\s]*/g,
      range.ge,
    );
  }

  if (!next.filterQuery) {
    next.filterQuery = dateClause;
  } else if (!/RequestedOn|createdon|RequestDate/i.test(next.filterQuery)) {
    next.filterQuery = `(${next.filterQuery}) and ${dateClause}`;
  }

  return next;
}

export function currentTimePromptBlock() {
  const t = getNow();
  return `
### Current date and time
- UTC: ${t.iso}
- Central Time: ${t.local}
- Current year: ${t.year}
- Today: ${t.ymd}
- Never use 2023 or 2024.
- "past month" → ${t.monthAgo} through ${t.ymd}
`.trim();
}
