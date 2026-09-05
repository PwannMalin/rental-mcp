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
  const state = orchestrator.customerSearchState;
  if (!state) return null;

  const sessionKey = orchestrator.getSessionKey(context);
  const text = orchestrator.getCleanValue(userInput).toLowerCase();

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
