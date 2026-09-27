export async function tryResolvePendingCustomerSelection(
  orchestrator,
  userInput,
  context,
) {
  if (!orchestrator.pendingCustomerSelection?.options?.length) {
    return null;
  }

  const value = orchestrator.getCleanValue(userInput);

  const match = orchestrator.pendingCustomerSelection.options.find(
    (c, index) => {
      const customerNumber = orchestrator.getCleanValue(c.CustomerNumber);
      const branch = orchestrator.getCleanValue(c.Branch).toLowerCase();
      return (
        customerNumber === value ||
        branch === value.toLowerCase() ||
        parseInt(value, 10) === index + 1
      );
    },
  );

  if (!match) {
    console.log("No match found for pending customer selection:", value);
    return null;
  }

  orchestrator.pendingCustomerSelection = null;
  orchestrator.customerSearchState = null;

  const result = await orchestrator.registry.execute(
    "search.execute",
    {
      type: "RENTAL",
      filterQuery: `Customer eq '${match.CustomerNumber}'`,
      topCount: 50,
    },
    context,
  );

  const rows = orchestrator.getRowsFromToolResult(result);

  if (!rows.length) {
    return {
      success: true,
      answer: `I found customer ${match.CustomerNumber} (${match.Branch || match.customerName}), but there are currently no open rental requests for this customer.`,
    };
  }

  if (result?.success) {
    orchestrator.rememberActiveRequest(result);
    orchestrator.captureSchema("RENTAL", result);
  }

  await orchestrator.saveSessionState(orchestrator.getSessionKey(context));

  const requestList = rows
    .map((row, index) => {
      const id = orchestrator.getRequestId(row);
      const status = orchestrator.getCleanValue(
        row.RequestStatus || row.Status,
      );
      const contact = orchestrator.getCleanValue(
        row.ContactName || row.Contact,
      );
      return `${index + 1}. RequestID ${id} — Status: ${status}${contact ? ` — Contact: ${contact}` : ""}`;
    })
    .join("\n");

  return {
    success: true,
    answer: `Found ${rows.length} rental request(s) for customer ${match.CustomerNumber} (${match.Branch || match.customerName}):\n\n${requestList}\n\nYou can say "show request lines" or "details" for more information.`,
  };
}

export async function handleCustomerSearchNav(
  orchestrator,
  userInput,
  context,
  ui,
) {
  const state = orchestrator.customerSearchState;
  if (!state?.filtered?.length) return null;

  const sessionKey = orchestrator.getSessionKey(context);
  const text = orchestrator.getCleanValue(userInput).toLowerCase();

  const goPage = async (nextPage) => {
    state.page = nextPage;
    if (state.checkRequests) {
      const enriched = await enrichPageWithRequests(
        orchestrator,
        state,
        context,
        ui,
      );
      const pageResult = formatRequestPage(enriched, state);
      orchestrator.pendingCustomerSelection = pageResult.withRequests.length
        ? { options: pageResult.withRequests }
        : { options: state.filtered };
      await orchestrator.saveSessionState(sessionKey);
      return {
        success: true,
        answer: pageResult.answer,
        showPagination: pageResult.showPagination,
      };
    }
    const { lines, nav } = formatCustomerPage(state);
    orchestrator.pendingCustomerSelection = { options: state.filtered };
    await orchestrator.saveSessionState(sessionKey);
    return {
      success: true,
      answer: `Page ${state.page + 1}:\n\n${lines}${nav}`,
      showPagination: true,
    };
  };

  if (/\bnext\b/.test(text)) {
    const maxPage = Math.max(
      0,
      Math.ceil(state.filtered.length / state.pageSize) - 1,
    );
    if (state.page >= maxPage) {
      return { success: true, answer: "You're already on the last page." };
    }
    return goPage(state.page + 1);
  }

  if (/\b(prev|previous)\b/.test(text)) {
    if (state.page <= 0) {
      return { success: true, answer: "You're already on the first page." };
    }
    return goPage(state.page - 1);
  }

  return null;
}
