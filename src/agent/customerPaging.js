function extractCustomerSearchTerm(userText) {
  const text = String(userText || "").trim();
  if (!text) return "";

  const stripped = text
    .replace(/^(can you |could you |please |hey |hi )+/i, "")
    .replace(/\b(find|look up|lookup|search for|show|get|list)\b/gi, " ")
    .replace(/\b(requests?|rentals?|open requests?|rental requests?)\b/gi, " ")
    .replace(/\b(for|from|named|called|customer|customers|the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripped;
}

export function looksLikeCustomerSearch(userText) {
  const text = String(userText || "").toLowerCase();

  // Metrics / date questions are not a customer directory search
  if (
    /\b(how many|what date|what time|what year|this year|past month)\b/.test(
      text,
    )
  ) {
    return false;
  }

  // "find requests for clampitt paper" IS a customer search
  // (name first, then requests by CustomerNumber)
  if (/\b(customer|customers|find|look up|lookup|search for)\b/.test(text)) {
    return Boolean(extractCustomerSearchTerm(userText));
  }

  return false;
}

export function wantsRequestCheck(userText) {
  return /\b(request|requests|rental|rentals)\b/i.test(String(userText || ""));
}

export async function searchCustomersFromText(
  orchestrator,
  userInput,
  context,
  ui,
) {
  const searchTerm =
    extractCustomerSearchTerm(userInput) || String(userInput || "").trim();
  const safe = searchTerm.replace(/'/g, "''");
  const checkRequests = wantsRequestCheck(userInput);

  await ui.update(
    `Searching for customers matching '${searchTerm}' with contains(CustomerName,'${safe}')…`,
  );

  const pageSize = 50;
  let skip = 0;
  let allRows = [];
  let hitLimit = false;

  // Page the customer directory until exhausted or a hard cap
  const maxPages = 10;
  for (let page = 0; page < maxPages; page += 1) {
    const customerResult = await orchestrator.registry.execute(
      "search.execute",
      {
        type: "CUSTOMER",
        filterQuery: `contains(CustomerName,'${safe}')`,
        topCount: pageSize,
        skipCount: skip,
      },
      context,
    );

    const rows = orchestrator.getRowsFromToolResult(customerResult);
    allRows = allRows.concat(rows);

    if (rows.length < pageSize) {
      hitLimit = false;
      break;
    }
    hitLimit = true;
    skip += pageSize;
  }

  if (!allRows.length) {
    return {
      success: true,
      answer: `I searched customers with contains(CustomerName,'${safe}') and found none. Please try a different name.`,
    };
  }

  const customers = allRows.map((row) => ({
    CustomerNumber: orchestrator.getCleanValue(
      row.CustomerNumber || row.customerNumber,
    ),
    Branch: orchestrator.getCleanValue(row.Branch || row.branch),
    customerName: orchestrator.getCleanValue(
      row.CustomerName || row.customerName || row.Name || row.name,
    ),
    requestCount: null,
  }));

  orchestrator.customerSearchState = {
    allCustomers: customers,
    filtered: customers,
    page: 0,
    pageSize: 25,
    searchTerm,
    filterQuery: `contains(CustomerName,'${safe}')`,
    onlyWithRequests: false,
    hitLimit,
    currentTopCount: allRows.length,
    checkRequests,
  };

  if (checkRequests) {
    const enriched = await enrichPageWithRequests(
      orchestrator,
      orchestrator.customerSearchState,
      context,
      ui,
    );
    const pageResult = formatRequestPage(
      enriched,
      orchestrator.customerSearchState,
    );
    orchestrator.pendingCustomerSelection = pageResult.withRequests.length
      ? { options: pageResult.withRequests }
      : { options: customers };

    await orchestrator.saveSessionState(orchestrator.getSessionKey(context));

    const extra = hitLimit
      ? `\n\nNote: the directory returned a full page set; say Next if you need more accounts.`
      : "";

    return {
      success: true,
      answer: pageResult.answer + extra,
      showPagination: pageResult.showPagination,
      awaitingCustomerSelection: true,
      options: orchestrator.pendingCustomerSelection.options,
    };
  }

  orchestrator.pendingCustomerSelection = { options: customers };

  const { lines, nav } = formatCustomerPage(orchestrator.customerSearchState);

  await orchestrator.saveSessionState(orchestrator.getSessionKey(context));

  return {
    success: true,
    answer:
      `Found ${customers.length} customers matching '${searchTerm}' ` +
      `(filter: contains(CustomerName,'${safe}')):\n\n${lines}${nav}` +
      `\n\nPlease reply with the number or Customer # you want to continue with.` +
      (hitLimit ? `\nMore results may exist — say Next to keep paging.` : ""),
    showPagination: true,
    awaitingCustomerSelection: true,
    options: customers,
  };
}

export function formatCustomerPage(state) {
  const { filtered, page, pageSize } = state;
  const start = page * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const lines = pageRows.map((c, i) => {
    const globalIndex = start + i + 1;
    const reqText =
      c.requestCount != null ? ` — Requests: ${c.requestCount}` : "";
    return `${globalIndex}. ${c.customerName} — Branch: ${c.Branch} — Customer #: ${c.CustomerNumber}${reqText}`;
  });

  let nav = "";
  if (totalPages > 1) {
    const parts = [];
    if (page > 0) parts.push(`Prev ${pageSize}`);
    if (page < totalPages - 1) parts.push(`Next ${pageSize}`);
    nav = `\n\n[ ${parts.join("  |  ")} ]  (page ${page + 1} of ${totalPages})`;
  }

  return {
    lines: lines.join("\n"),
    nav,
    pageRows,
  };
}

export async function enrichPageWithRequests(orchestrator, state, context, ui) {
  const start = state.page * state.pageSize;
  const pageRows = state.filtered.slice(start, start + state.pageSize);

  await ui.update(
    `Checking ${pageRows.length} customers on this page for open rental requests…`,
  );

  const enriched = [];

  for (const customer of pageRows) {
    try {
      const rentalResult = await orchestrator.registry.execute(
        "search.execute",
        {
          type: "RENTAL",
          filterQuery: `Customer eq '${customer.CustomerNumber}'`,
          topCount: 20,
        },
        context,
      );
      const count = orchestrator.getRowsFromToolResult(rentalResult).length;
      enriched.push({ ...customer, requestCount: count });
    } catch {
      enriched.push({ ...customer, requestCount: 0 });
    }
  }

  return enriched;
}

export function formatRequestPage(enriched, state) {
  const withRequests = enriched.filter((c) => c.requestCount > 0);
  const start = state.page * state.pageSize;
  const totalPages = Math.ceil(state.filtered.length / state.pageSize);

  let nav = "";
  if (totalPages > 1) {
    const parts = [];
    if (state.page > 0) parts.push(`Prev ${state.pageSize}`);
    if (state.page < totalPages - 1) parts.push(`Next ${state.pageSize}`);
    nav = `\n\n[ ${parts.join("  |  ")} ]  (page ${state.page + 1} of ${totalPages})`;
  }

  const footer =
    `\n\nYou can:\n` +
    `• Reply with a **branch** (e.g. Houston)\n` +
    `• Say **"only with open requests"** to scan more at once\n` +
    `• Or use **Next / Prev** to check another page`;

  if (withRequests.length === 0) {
    return {
      answer:
        `Checked customers ${start + 1}–${start + enriched.length}.\n` +
        `None of them have open rental requests.` +
        nav +
        footer,
      withRequests: [],
      showPagination: totalPages > 1,
    };
  }

  const lines = withRequests.map((c, i) => {
    return `${i + 1}. ${c.customerName} — Branch: ${c.Branch} — Customer #: ${c.CustomerNumber} — Requests: ${c.requestCount}`;
  });

  return {
    answer:
      `Checked customers ${start + 1}–${start + enriched.length}.\n` +
      `Found ${withRequests.length} with open rental requests:\n\n` +
      lines.join("\n") +
      nav +
      `\n\nReply with the number or Customer # to continue.` +
      footer,
    withRequests,
    showPagination: totalPages > 1,
  };
}

export async function handleCustomerSearchNav(
  orchestrator,
  userInput,
  context,
  ui,
) {
  let state = orchestrator.customerSearchState;
  if (!state) {
    // Initialize state for full search with empty filtered and page 0
    state = { filtered: [], page: 0, pageSize: 10, checkRequests: false };
    orchestrator.customerSearchState = state;
  }
  if (!state) return null;

  const sessionKey = orchestrator.getSessionKey(context);
  const text = orchestrator.getCleanValue(userInput).toLowerCase();

  // Perform full search with OData filter using contains for customerName
  const filterQuery = `contains(CustomerName, '${text}')`;
  const allResults = [];
  let skip = 0;
  const top = 50;
  while (true) {
    const result = await orchestrator.registry.execute(
      "search.execute",
      {
        type: "CUSTOMER",
        filterQuery,
        topCount: top,
        skipCount: skip,
      },
      context
    );
    const rows = orchestrator.getRowsFromToolResult(result);
    if (!rows.length) break;
    allResults.push(...rows);
    if (rows.length < top) break;
    skip += top;
  }
  state.filtered = allResults;
  state.page = 0;

  if (text.includes("next")) {
    const maxPage = Math.ceil(state.filtered.length / state.pageSize) - 1;
    if (state.page >= maxPage) {
      return { success: true, answer: "You're already on the last page." };
    }
    state.page += 1;
    if (state.checkRequests) {
      const enriched = await orchestrator.enrichPageWithRequests(
        state,
        context,
        ui,
      );
      const pageResult = orchestrator.formatRequestPage(enriched, state);
      orchestrator.pendingCustomerSelection = pageResult.withRequests.length
        ? { options: pageResult.withRequests }
        : null;
      await orchestrator.saveSessionState(sessionKey);
      return {
        success: true,
        answer: pageResult.answer,
        showPagination: pageResult.showPagination,
      };
    }
    const { lines, nav } = orchestrator.formatCustomerPage(state);
    await orchestrator.saveSessionState(sessionKey);
    return {
      success: true,
      answer: `Page ${state.page + 1}:\n\n${lines}${nav}`,
      showPagination: true,
    };
  }

  if (text.includes("prev") || text.includes("previous")) {
    if (state.page <= 0) {
      return { success: true, answer: "You're already on the first page." };
    }
    state.page -= 1;
    if (state.checkRequests) {
      const enriched = await orchestrator.enrichPageWithRequests(
        state,
        context,
        ui,
      );
      const pageResult = orchestrator.formatRequestPage(enriched, state);
      orchestrator.pendingCustomerSelection = pageResult.withRequests.length
        ? { options: pageResult.withRequests }
        : null;
      await orchestrator.saveSessionState(sessionKey);
      return {
        success: true,
        answer: pageResult.answer,
        showPagination: pageResult.showPagination,
      };
    }
    const { lines, nav } = orchestrator.formatCustomerPage(state);
    await orchestrator.saveSessionState(sessionKey);
    return {
      success: true,
      answer: `Page ${state.page + 1}:\n\n${lines}${nav}`,
      showPagination: true,
    };
  }

  return null;
}
