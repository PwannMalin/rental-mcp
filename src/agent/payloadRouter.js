/**
 * Looks at the last tool payload and suggests a next action
 * when the shape of the data makes the intent obvious.
 *
 * Returns null if no strong signal, so the orchestrator falls through
 * to its existing logic.
 */

export function summarizePayload(type, result) {
  const rows = result?.rows || result?.data?.rows || result?.preview || [];
  const first = rows[0] || {};
  const fields = Object.keys(first);

  return {
    type: String(type || result?.searchType || "").toUpperCase(),
    fields,
    rowCount: rows.length,
    hasCustomerNumber: fields.some((f) => /customer.?number/i.test(f)),
    hasRequestId: fields.some((f) => /request.?id/i.test(f)),
    hasBranch: fields.some((f) => /^branch$/i.test(f)),
    sampleKeys: fields.slice(0, 8),
    customerNumber:
      first.CustomerNumber || first.customerNumber || first.CustomerNo || null,
    requestId: first.RequestID || first.RequestId || first.requestId || null,
  };
}

export function decideNextAction(summary, userText = "") {
  if (!summary) return null;
  const text = String(userText || "").toLowerCase();

  // Customer list + user wants requests → use the CustomerNumber we already have
  if (
    summary.hasCustomerNumber &&
    summary.customerNumber &&
    /request|rental|open/.test(text) &&
    summary.rowCount === 1
  ) {
    return {
      action: "searchRentals",
      customerNumber: summary.customerNumber,
      reason: "single customer with CustomerNumber in last payload",
    };
  }

  // Request header(s) + user wants lines / items / equipment
  if (
    summary.hasRequestId &&
    summary.requestId &&
    /line|item|equipment|serial|what.?s on/.test(text)
  ) {
    return {
      action: "getRequestLines",
      requestId: summary.requestId,
      reason: "RequestID present and user asked for lines/items",
    };
  }

  // Multiple customers and user said a branch → narrow by Branch if the field exists
  if (
    summary.hasBranch &&
    summary.rowCount > 1 &&
    text.length >= 2 &&
    text.length <= 30 &&
    !/request|next|prev|loop|all/.test(text)
  ) {
    return {
      action: "narrowByBranch",
      branch: text.toUpperCase(),
      reason: "Branch field present and short reply looks like a branch name",
    };
  }

  return null;
}
