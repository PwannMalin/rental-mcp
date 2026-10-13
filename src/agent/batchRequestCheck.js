/**
 * Detects meta-commands that should operate on an existing customer list
 * instead of starting a new CustomerName search.
 *
 * Examples: "loop through these", "for each of the above",
 * "check requests on all of them", "do that for the list".
 */

const BATCH_PATTERNS = [
  /\bloop through (these|them|the list|above)\b/i,
  /\bfor each of (these|them|the above|the list)\b/i,
  /\bcheck requests on (all of them|these|the list)\b/i,
  /\bdo that for (the list|these|them|all of them)\b/i,
  /\bprocess the list\b/i,
  /\bcheck all of them\b/i,
  /\bfind requests for (these|all of them|the list)\b/i,
];

export function looksLikeBatchOnExistingList(userText) {
  const text = String(userText || "").trim();
  if (!text) return false;
  return BATCH_PATTERNS.some((re) => re.test(text));
}

export async function tryBatchRequestCheck(orchestrator, userInput, context, ui) {
  if (!looksLikeBatchOnExistingList(userInput)) {
    return null;
  }

  // Prefer the explicit pending selection; fall back to the full search state
  let customers = orchestrator.pendingCustomerSelection?.options || [];
  if (!customers.length && orchestrator.customerSearchState?.allCustomers?.length) {
    customers = orchestrator.customerSearchState.allCustomers;
  }
  if (!customers.length && orchestrator.customerSearchState?.filtered?.length) {
    customers = orchestrator.customerSearchState.filtered;
  }

  if (!customers.length) {
    return {
      success: true,
      answer:
        "I don't have a current customer list to loop through. " +
        "Try a customer search first, then say \"loop through these\" or \"check requests on all of them\".",
    };
  }

  const sessionKey = orchestrator.getSessionKey(context);
  const maxToCheck = Math.min(customers.length, 40); // safety cap
  const toCheck = customers.slice(0, maxToCheck);

  await ui.update(
    `Checking open rental requests for ${toCheck.length} customers from the current list…`,
  );

  const withRequests = [];
  let checked = 0;

  for (const customer of toCheck) {
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
      if (count > 0) {
        withRequests.push({ ...customer, requestCount: count });
      }
      checked += 1;
    } catch {
      // skip individual failures
    }
  }

  // Keep the ones that have requests as the new pending selection so the user can pick one
  if (withRequests.length) {
    orchestrator.pendingCustomerSelection = { options: withRequests };
  }
  await orchestrator.saveSessionState(sessionKey);

  if (!withRequests.length) {
    const note =
      customers.length > maxToCheck
        ? ` (checked the first ${maxToCheck} of ${customers.length})`
        : "";
    return {
      success: true,
      answer:
        `I looped through the current list and checked ${checked} customers${note}. ` +
        `None of them currently have open rental requests.`,
    };
  }

  const lines = withRequests.map(
    (c, i) =>
      `${i + 1}. ${c.customerName || "Unknown"} — Branch: ${c.Branch || "—"} — Customer #: ${c.CustomerNumber} — Requests: ${c.requestCount}`,
  );

  const note =
    customers.length > maxToCheck
      ? `\n\n(Note: checked the first ${maxToCheck} of ${customers.length} customers in the list.)`
      : "";

  return {
    success: true,
    answer:
      `I looped through the current list and checked ${checked} customers.\n` +
      `Found ${withRequests.length} with open rental requests:\n\n` +
      lines.join("\n") +
      note +
      `\n\nReply with the number or Customer # to continue.`,
    awaitingCustomerSelection: true,
    options: withRequests,
  };
}
