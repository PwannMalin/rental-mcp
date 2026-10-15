/**
 * Looks at the last tool payload and suggests (or executes) a next action
 * when the shape of the data makes the intent obvious.
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

/**
 * Execute the action suggested by decideNextAction.
 * Returns a result object the orchestrator can return, or null to fall through.
 */
export async function executePayloadAction(orchestrator, next, context, ui) {
  if (!next) return null;

  if (next.action === "searchRentals" && next.customerNumber) {
    await ui.update(
      `Looking up open rental requests for customer ${next.customerNumber}…`,
    );
    const result = await orchestrator.registry.execute(
      "search.execute",
      {
        type: "RENTAL",
        filterQuery: `Customer eq '${next.customerNumber}'`,
        topCount: 20,
      },
      context,
    );
    const rows = orchestrator.getRowsFromToolResult(result);
    orchestrator.captureSchema("RENTAL", result);
    orchestrator.lastSearchResults = rows;
    orchestrator.lastSearchType = "RENTAL";

    if (!rows.length) {
      return {
        success: true,
        answer: `No open rental requests found for customer ${next.customerNumber}.`,
      };
    }

    const lines = rows
      .slice(0, 10)
      .map((r, i) => {
        const id = r.RequestID || r.RequestId || r.requestId || "—";
        const date = r.RequestedOn || r.requestedOn || "";
        return `${i + 1}. Request #${id}${date ? ` — ${date}` : ""}`;
      })
      .join("\n");

    return {
      success: true,
      answer:
        `Found ${rows.length} rental request(s) for customer ${next.customerNumber}:\n\n` +
        lines +
        (rows.length > 10 ? `\n\n(showing first 10)` : "") +
        `\n\nReply with a request number to see the lines.`,
    };
  }

  if (next.action === "getRequestLines" && next.requestId) {
    await ui.update(`Fetching request lines for RequestID ${next.requestId}…`);
    const result = await orchestrator.registry.execute(
      "search.execute",
      {
        type: "REQUEST_LINES",
        filterQuery: `RequestID eq ${next.requestId}`,
        topCount: 50,
      },
      context,
    );
    const rows = orchestrator.getRowsFromToolResult(result);
    orchestrator.captureSchema("REQUEST_LINES", result);
    orchestrator.lastSearchResults = rows;
    orchestrator.lastSearchType = "REQUEST_LINES";

    if (!rows.length) {
      return {
        success: true,
        answer: `No request lines found for RequestID ${next.requestId}.`,
      };
    }

    const lines = rows
      .slice(0, 15)
      .map((r, i) => {
        const model = r.Model || r.EquipModel || r.model || "—";
        const serial = r.Serial || r.SerialNumber || r.serial || "";
        return `${i + 1}. ${model}${serial ? ` — Serial: ${serial}` : ""}`;
      })
      .join("\n");

    return {
      success: true,
      answer:
        `Request lines for #${next.requestId} (${rows.length} total):\n\n` +
        lines +
        (rows.length > 15 ? `\n\n(showing first 15)` : ""),
    };
  }

  // narrowByBranch is left for the existing customerSearchState path
  return null;
}
