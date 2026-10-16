import {
  formatCustomerPage,
  enrichPageWithRequests,
  formatRequestPage,
} from "./customerPaging.js";

function extractCustomerSearchTerm(userText) {
  let text = String(userText || "").trim();
  if (!text) return "";

  // Strip leading intent + filler
  text = text
    .replace(/^(can you |could you |please |hey |hi |ok |okay )+/i, "")
    .replace(
      /^(find|look up|lookup|search for|show|get|list|pull)\s+(me\s+)?(some\s+)?(open\s+)?(requests?|rentals?)?\s*(for|from|named|called)?\s*/i,
      "",
    )
    .replace(/\b(requests?|rentals?|open requests?|rental requests?)\b/gi, " ")
    .replace(
      /\b(for|from|named|called|customer|customers|the|a|an|me|some)\b/gi,
      " ",
    )
    .replace(/[?.,!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Reject obviously bad terms
  if (!text || text.length < 3) return "";
  if (/\b(loop|through|these|them|list|all of them)\b/i.test(text)) return "";

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
