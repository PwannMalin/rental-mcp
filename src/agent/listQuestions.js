/**
 * Handles questions about the current customer list instead of
 * treating them as new CustomerName searches.
 *
 * Examples: "was that the full list", "how many were there",
 * "which branches", "are those all the Clampitt customers".
 */

const LIST_QUESTION_PATTERNS = [
  /\bwas that the full list\b/i,
  /\bis that (the |all |the full )?list\b/i,
  /\bhow many (were there|customers|results)\b/i,
  /\bwhich branches\b/i,
  /\bwhat branches\b/i,
  /\bare those all\b/i,
  /\bwas that all\b/i,
  /\bfull list of\b/i,
  /\bhow many did you find\b/i,
  /\bhow many total\b/i,
];

export function looksLikeListQuestion(userText) {
  const text = String(userText || "").trim();
  if (!text) return false;
  return LIST_QUESTION_PATTERNS.some((re) => re.test(text));
}

export function tryAnswerListQuestion(orchestrator, userInput) {
  if (!looksLikeListQuestion(userInput)) return null;

  const pending = orchestrator.pendingCustomerSelection?.options || [];
  const state = orchestrator.customerSearchState;
  const customers =
    pending.length > 0
      ? pending
      : state?.allCustomers || state?.filtered || [];

  if (!customers.length) {
    return {
      success: true,
      answer:
        "I don't have a current customer list to answer that about. " +
        "Try a customer search first.",
    };
  }

  const branches = [
    ...new Set(customers.map((c) => c.Branch).filter(Boolean)),
  ].sort();
  const names = customers
    .slice(0, 5)
    .map((c) => c.customerName || "Unknown")
    .join(", ");

  const more =
    customers.length > 5 ? ` (and ${customers.length - 5} more)` : "";

  return {
    success: true,
    answer:
      `The current list has ${customers.length} customer(s).\n` +
      `Branches: ${branches.join(", ") || "none listed"}.\n` +
      `Examples: ${names}${more}.\n\n` +
      `You can say \"loop through these\" or \"check requests on all of them\" to look up rental requests.`,
  };
}
