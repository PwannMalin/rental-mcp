export function getRequestId(row = {}) {
  return (
    row.RequestID || row.RequestId || row.requestID || row.requestId || null
  );
}

export function rememberActiveRequest(orchestrator, result) {
  const rows = orchestrator.getRowsFromToolResult(result);

  if (!rows.length) {
    orchestrator.activeRequest = null;
    orchestrator.pendingRequestSelection = null;
    return;
  }

  if (rows.length === 1) {
    const row = rows[0];
    orchestrator.activeRequest = {
      RequestID: getRequestId(row),
      Customer: orchestrator.getCleanValue(row.Customer || row.CustomerNumber),
      CustomerNumber: orchestrator.getCleanValue(
        row.CustomerNumber || row.Customer,
      ),
      Branch: orchestrator.getCleanValue(row.Branch),
      RequestStatus: orchestrator.getCleanValue(
        row.Status || row.RequestStatus,
      ),
      ContactName: orchestrator.getCleanValue(row.ContactName || row.Contact),
    };
    orchestrator.pendingRequestSelection = null;
    return;
  }

  orchestrator.pendingRequestSelection = {
    options: rows.map((row) => ({
      RequestID: getRequestId(row),
      Customer: orchestrator.getCleanValue(row.Customer || row.CustomerNumber),
      CustomerNumber: orchestrator.getCleanValue(
        row.CustomerNumber || row.Customer,
      ),
      Branch: orchestrator.getCleanValue(row.Branch),
      RequestStatus: orchestrator.getCleanValue(
        row.Status || row.RequestStatus,
      ),
      ContactName: orchestrator.getCleanValue(row.ContactName || row.Contact),
    })),
  };
  orchestrator.activeRequest = null;
}

export function formatRequestLinesAnswer(orchestrator, rows, userText = "") {
  if (!rows || rows.length === 0) {
    return {
      success: true,
      answer: `I found RequestID ${orchestrator.activeRequest.RequestID}, but there are no request lines for it.`,
    };
  }

  const wantsFull =
    userText.includes("full") ||
    userText.includes("more details") ||
    userText.includes("expand") ||
    userText.includes("everything") ||
    userText.includes("serial") ||
    userText.includes("info") ||
    userText.includes("model") ||
    userText.includes("capacity") ||
    userText.includes("oach");

  const lineNumber = parseInt(userText, 10);
  let linesToShow = rows;

  if (!isNaN(lineNumber) && lineNumber >= 1 && lineNumber <= rows.length) {
    linesToShow = [rows[lineNumber - 1]];
  }

  const linesText = linesToShow
    .map((row, index) => {
      const displayIndex =
        linesToShow.length === 1 ? lineNumber || 1 : index + 1;
      const model = row.EquipModel || row.Model || "—";
      const qty = row.RequestedQty || row.Quantity || row.Qty || "—";
      const oach = row.OACH || "—";
      const capacity = row.Capacity || "—";
      const series = row.EquipSeries || "";
      const group = row.EquipGroup || "";
      const comments = row.comments || row.Comments || "";

      if (wantsFull || linesToShow.length === 1) {
        return (
          `${displayIndex}. ${model}\n` +
          `Group: ${group} | Series: ${series}\n` +
          `Qty: ${qty} | OACH: ${oach} | Capacity: ${capacity} lbs` +
          (comments ? `\nNotes: ${comments.trim()}` : "")
        );
      }

      return `${displayIndex}. ${model} — Qty: ${qty} — OACH: ${oach} — Capacity: ${capacity} lbs`;
    })
    .join("\n\n");

  return {
    success: true,
    answer: `Found ${rows.length} request line(s) for RequestID ${orchestrator.activeRequest.RequestID}:\n\n${linesText}`,
  };
}

export async function tryResolvePendingRequestSelection(
  orchestrator,
  userInput,
  context,
) {
  if (!orchestrator.pendingRequestSelection?.options?.length) {
    return null;
  }

  const value = orchestrator.getCleanValue(userInput).toLowerCase();

  const match = orchestrator.pendingRequestSelection.options.find(
    (r, index) => {
      const requestId = orchestrator.getCleanValue(r.RequestID).toLowerCase();
      return value === requestId || parseInt(value, 10) === index + 1;
    },
  );

  if (!match) {
    console.log("No match found for pending request selection:", value);
    return null;
  }

  orchestrator.activeRequest = {
    RequestID: match.RequestID,
    Customer: orchestrator.getCleanValue(
      match.Customer || match.CustomerNumber,
    ),
    CustomerNumber: orchestrator.getCleanValue(
      match.CustomerNumber || match.Customer,
    ),
    Branch: orchestrator.getCleanValue(match.Branch),
    RequestStatus: orchestrator.getCleanValue(
      match.RequestStatus || match.Status,
    ),
    ContactName: orchestrator.getCleanValue(match.ContactName || match.Contact),
  };

  orchestrator.pendingRequestSelection = null;
  orchestrator.customerSearchState = null;

  await orchestrator.saveSessionState(orchestrator.getSessionKey(context));

  return {
    success: true,
    answer:
      `Selected RequestID ${orchestrator.activeRequest.RequestID}` +
      `${orchestrator.activeRequest.CustomerNumber ? ` for customer ${orchestrator.activeRequest.CustomerNumber}` : ""}.\n\n` +
      `You can say "show request lines", "details", or "equipment requested" for more information.`,
  };
}

export async function tryResolvePendingRequestAction(
  orchestrator,
  userInput,
  context,
  ui,
) {
  if (!orchestrator.activeRequest) return null;

  orchestrator.customerSearchState = null;
  const userText = orchestrator.getCleanValue(userInput).toLowerCase();

  const showLinesKeywords = [
    "request lines",
    "rental request lines",
    "show me the lines",
    "show lines",
    "show request lines",
    "request details",
    "full details",
    "details",
    "more details",
    "equipment requested",
    "what equipment",
    "equipment info",
    "full equipment",
    "lines",
    "model",
    "serial",
    "capacity",
    "oach",
    "qty",
    "quantity",
  ];

  const isLineNumber = /^\d+$/.test(userText);
  const wantsLines =
    showLinesKeywords.some((keyword) => userText.includes(keyword)) ||
    isLineNumber ||
    (userText.includes("equipment") && orchestrator.activeRequest) ||
    (userText.includes("information") && orchestrator.activeRequest);

  if (!wantsLines) return null;

  if (orchestrator.activeRequest.lines?.length) {
    return formatRequestLinesAnswer(
      orchestrator,
      orchestrator.activeRequest.lines,
      userText,
    );
  }

  await ui.update(
    `Fetching request lines for RequestID ${orchestrator.activeRequest.RequestID}...`,
  );

  const result = await orchestrator.registry.execute(
    "search.execute",
    {
      type: "REQUEST_LINES",
      filterQuery: `RequestID eq ${orchestrator.activeRequest.RequestID}`,
      topCount: 50,
    },
    context,
  );

  orchestrator.captureSchema("REQUEST_LINES", result);
  const rows = orchestrator.getRowsFromToolResult(result);
  orchestrator.activeRequest.lines = rows;

  return formatRequestLinesAnswer(orchestrator, rows, userText);
}
