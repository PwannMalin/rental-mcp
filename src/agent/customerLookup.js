export function looksLikeCustomerSearch(userText) {
  const text = String(userText || "").toLowerCase();
  if (
    /request|this year|past month|past quarter|how many|what date|what time|what year/.test(
      text,
    )
  ) {
    return false;
  }
  return (
    /customer|find |look up|lookup|search for/.test(text) ||
    /^[a-z0-9][a-z0-9 .&-]{2,}$/i.test(text)
  );
}

export async function searchCustomersFromText(
  orchestrator,
  userInput,
  context,
  ui,
) {
  await ui.update(`Searching for customers matching your input...`);

  const safe = String(userInput || "").replace(/'/g, "''");
  const customerResult = await orchestrator.registry.execute(
    "search.execute",
    {
      type: "CUSTOMER",
      filterQuery: `contains(CustomerName,'${safe}')`,
      topCount: 50,
    },
    context,
  );

  const customerRows = orchestrator.getRowsFromToolResult(customerResult);
  if (!customerRows.length) {
    return {
      success: true,
      answer: `I couldn't find any customers matching '${userInput}'. Please try a different search term.`,
    };
  }

  const customers = customerRows.map((row) => ({
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
    searchTerm: userInput,
    filterQuery: `contains(CustomerName,'${safe}')`,
    onlyWithRequests: false,
    hitLimit: customers.length >= 50,
    currentTopCount: 50,
    checkRequests: false,
  };

  orchestrator.pendingCustomerSelection = { options: customers };

  const { lines, nav } = orchestrator.formatCustomerPage(
    orchestrator.customerSearchState,
  );

  await orchestrator.saveSessionState(orchestrator.getSessionKey(context));

  return {
    success: true,
    answer: `Found ${customers.length} customers matching '${userInput}':\n\n${lines}${nav}\n\nPlease reply with the number or Customer # you want to continue with.`,
    showPagination: true,
    awaitingCustomerSelection: true,
    options: customers,
  };
}
