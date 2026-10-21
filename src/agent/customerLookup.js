import {
  formatCustomerPage,
  enrichPageWithRequests,
  formatRequestPage,
} from "./customerPaging.js";

export function extractCustomerSearchTerm(userText) {
  let text = String(userText || "").trim();
  if (!text) return "";

  // Ignore suggestions and meta-feedback
  if (/^(suggestion:|perfect!!|now since there is only one)/i.test(text))
    return "";

  // More conservative stripping
  text = text
    .replace(/^(can you |could you |please |hey |hi )+/i, "")
    .replace(
      /^(find|look up|lookup|search for|show|get|list)\s+(me\s+)?(open\s+)?(requests?|rentals?)\s+(for|from)\s+/i,
      "",
    )
    .replace(/\b(requests?|rentals?|open requests?)\b/gi, " ")
    .replace(/[?.,!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text.length < 3) return "";
  if (/\b(loop|through|these|them|list|all of them|suggestion)\b/i.test(text))
    return "";

  return text;
}

export function looksLikeCustomerSearch(userText) {
  const text = String(userText || "").toLowerCase();

  if (
    /\b(how many|what date|what time|what year|this year|past month)\b/.test(
      text,
    )
  ) {
    return false;
  }

  if (
    /\b(one or more of them|some of them|any of them|several of them|a few of them|loop through|check all|all of them)\b/.test(
      text,
    )
  ) {
    return false;
  }

  const term = extractCustomerSearchTerm(userText);
  return Boolean(term && term.length >= 3);
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
  const rawTerm = String(userInput || "").trim();
  const searchTerm =
    extractCustomerSearchTerm(rawTerm.replace(/[?.,!]+$/g, "")) ||
    rawTerm.replace(/[?.,!]+$/g, "");
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
  if (checkRequests && pageResult.withRequests?.length === 1) {
    const only = pageResult.withRequests[0];
    // Immediately fetch the requests for that single customer and return them
    const rentalResult = await orchestrator.registry.execute(
      "search.execute",
      {
        type: "RENTAL",
        filterQuery: `Customer eq '${only.CustomerNumber}'`,
        topCount: 20,
      },
      context,
    );
    const rows = orchestrator.getRowsFromToolResult(rentalResult);
    // format and return the request list (reuse existing formatting helpers)
    // clear pending selection so we don't ask again
    orchestrator.pendingCustomerSelection = null;
    return {
      success: true,
      answer:
        `Found 1 customer with open requests (${only.customerName}, #${only.CustomerNumber}).\n\n` +
        formatRequestList(rows), // your existing formatter
      awaitingCustomerSelection: false,
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
