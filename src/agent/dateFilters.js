function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getNow() {
  const now = new Date();
  return {
    now,
    iso: now.toISOString(),
    ymd: ymd(now),
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
    monthAgo: ymd(new Date(now.getTime() - 30 * 86400000)),
  };
}

export function resolveDateRange(userInput) {
  const text = String(userInput || "").toLowerCase();
  const now = new Date();
  const end = ymd(now);
  const daysAgo = (n) => ymd(new Date(now.getTime() - n * 86400000));
  if (/last week|past week|past 7|last 7/.test(text)) {
    return {
      ge: daysAgo(7),
      lt: ymd(now),
      label: `the last 7 days (${daysAgo(7)} through ${ymd(now)})`,
    };
  }
  if (/past month|last month|last 30|past mo/.test(text)) {
    return { ge: `${now.getFullYear()}-01-01`, lt: end };
  }
  if (/past quarter|last quarter/.test(text)) {
    return { ge: daysAgo(90), lt: end };
  }
  if (/this year|started this year|how many/.test(text)) {
    return { ge: `${now.getFullYear()}-01-01`, lt: end };
  }

  if (/\btoday\b/.test(text)) {
    return { ge: end, lt: end };
  }
  return null;
}

export function applyDateFilter(userInput, args = {}) {
  const next = { ...args };
  const range = resolveDateRange(userInput);
  if (!range) return next;

  const type = String(next.type || "").toUpperCase();
  if (type !== "RENTAL") return next;

  const dateClause = `date(RequestedOn) ge date(${range.ge})`;

  if (!next.filterQuery) {
    next.filterQuery = dateClause;
  } else if (!/RequestedOn/i.test(next.filterQuery)) {
    next.filterQuery = `(${next.filterQuery}) and ${dateClause}`;
  } else {
    next.filterQuery = next.filterQuery
      .replace(/CreatedOn/gi, "RequestedOn")
      .replace(/datetime'[^']+'/g, `date(${range.ge})`)
      .replace(/\d{4}-\d{2}-\d{2}T[^'\s]+/g, range.ge);
  }

  return next;
}

export function currentTimePromptBlock() {
  const t = getNow();
  return `
### Current date and time
- Central Time: ${t.local}
- Current year: ${t.year}
- Today: ${t.ymd}
- Date filters must use: date(RequestedOn) ge date(YYYY-MM-DD)
- Never use 2023/2024 or a Z suffix.
`.trim();
}
