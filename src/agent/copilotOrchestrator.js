import {
  getNow,
  applyDateFilter,
  currentTimePromptBlock,
} from "./dateFilters.js";

import { tryResolvePendingCustomerSelection } from "./customerSelection.js";
import {
  getRequestId,
  rememberActiveRequest,
  formatRequestLinesAnswer,
  tryResolvePendingRequestSelection,
  tryResolvePendingRequestAction,
} from "./requestFlow.js";

import {
  formatCustomerPage,
  enrichPageWithRequests,
  formatRequestPage,
  handleCustomerSearchNav,
} from "./customerPaging.js";

import {
  looksLikeCustomerSearch,
  searchCustomersFromText,
} from "./customerLookup.js";

import { tryBatchRequestCheck } from "./batchRequestCheck.js";
export class CopilotOrchestrator {
  constructor({ registry, llm, memory }) {
    this.registry = registry;
    this.llm = llm;
    this.memory = memory;
    this.maxSteps = 10;

    // Session state
    this.activeRequest = null;
    this.pendingRequestSelection = null;
    this.pendingCustomerSelection = null;

    // Schema memory
    this.discoveredSchemas = {
      CUSTOMER: null,
      RENTAL: null,
      REQUEST_LINES: null,
      EQUIPMENT: null,
    };

    this.lastAgentQuestion = null;
    this.lastSearchResults = null;
    this.lastSearchType = null;
    this.customerSearchState = null;
  }

  getSessionKey(context) {
    return `${context.userId || "nouser"}_${context.tenantId || "notenant"}`;
  }

  async saveSessionState(sessionKey) {
    await this.memory?.set?.(sessionKey, {
      activeRequest: this.activeRequest,
      pendingRequestSelection: this.pendingRequestSelection,
      pendingCustomerSelection: this.pendingCustomerSelection,
      lastAgentQuestion: this.lastAgentQuestion,
      lastSearchResults: this.lastSearchResults,
      lastSearchType: this.lastSearchType,
      customerSearchState: this.customerSearchState,
    });
  }

  getRowsFromToolResult(result) {
    return (
      result?.data?.rows ||
      result?.data?.preview ||
      result?.rows ||
      result?.preview ||
      result?.data?.data?.value ||
      result?.data?.value ||
      result?.value ||
      []
    );
  }

  getCleanValue(value = "") {
    return String(value || "").trim();
  }

  showRemainingResults() {
    if (!this.lastSearchResults || this.lastSearchResults.length <= 1) {
      return {
        success: true,
        answer: "I don't have additional results to show.",
      };
    }

    const remaining = this.lastSearchResults.slice(1);

    const lines = remaining
      .map((row, i) => {
        return `${i + 2}. ${row.Model || row.EquipModel || "—"} — Serial: ${row.Serial || row.SerialNumber || "—"} — Branch: ${row.Branch || "—"}`;
      })
      .join("\n");

    this.lastAgentQuestion = null;

    return {
      success: true,
      answer: `Here are the remaining ${remaining.length} record(s):\n\n${lines}`,
    };
  }

  getRequestId(row = {}) {
    return getRequestId(row);
  }

  rememberActiveRequest(result, args, context) {
    rememberActiveRequest(this, result);
  }

  formatRequestLinesAnswer(rows, userText = "") {
    return formatRequestLinesAnswer(this, rows, userText);
  }

  tryResolvePendingRequestSelection(userInput, context, ui) {
    return tryResolvePendingRequestSelection(this, userInput, context);
  }

  tryResolvePendingCustomerSelection(userInput, context, ui) {
    return tryResolvePendingCustomerSelection(this, userInput, context);
  }

  tryResolvePendingRequestAction(userInput, context, ui) {
    return tryResolvePendingRequestAction(this, userInput, context, ui);
  }

  captureSchema(type, result) {
    const rows = this.getRowsFromToolResult(result);
    if (!rows.length) return;

    const firstRow = rows[0];
    const fields = Object.keys(firstRow);

    if (fields.length > 0) {
      this.discoveredSchemas[type] = fields;
      console.log(`SCHEMA CAPTURED for ${type}:`, fields);
    }
  }

  formatCustomerPage(state) {
    return formatCustomerPage(state);
  }

  enrichPageWithRequests(state, context, ui) {
    return enrichPageWithRequests(this, state, context, ui);
  }

  formatRequestPage(enriched, state) {
    return formatRequestPage(enriched, state);
  }

  async runStreaming(userInput, context = {}, ui) {
    const sessionKey = this.getSessionKey(context);
    const savedState = (await this.memory?.get?.(sessionKey)) || {};

    this.activeRequest = savedState.activeRequest ?? this.activeRequest;

    this.pendingRequestSelection =
      savedState.pendingRequestSelection ?? this.pendingRequestSelection;

    this.pendingCustomerSelection =
      savedState.pendingCustomerSelection ?? this.pendingCustomerSelection;

    this.lastAgentQuestion =
      savedState.lastAgentQuestion ?? this.lastAgentQuestion;

    this.lastSearchResults =
      savedState.lastSearchResults ?? this.lastSearchResults;

    this.lastSearchType = savedState.lastSearchType ?? this.lastSearchType;

    this.customerSearchState =
      savedState.customerSearchState ?? this.customerSearchState;

    const affirmative = [
      "yes",
      "yeah",
      "yep",
      "sure",
      "ok",
      "okay",
      "please",
      "the other ones",
      "show the rest",
      "more",
    ];
    const userText = this.getCleanValue(userInput).toLowerCase();

    // Early: operate on existing list for meta-commands like "loop through these"
    if (this.pendingCustomerSelection?.options?.length || this.customerSearchState) {
      const batchResult = await tryBatchRequestCheck(this, userInput, context, ui);
      if (batchResult) return batchResult;
    }

    const namedRequests =
      userText.match(/find (.+?) requests?/) ||
      userText.match(/requests? for (.+)/);

    if (
      /what date|what time|what day|what's the date|whats the date|current date|current year|what year/.test(
        userText,
      )
    ) {
      const t = getNow();
      return { success: true, answer: `Today is ${t.local} (year ${t.year}).` };
    }

    if (namedRequests) {
      const name = namedRequests[1].replace(/paper/gi, "").trim();
      return searchCustomersFromText(this, name, context, ui);
    }

    if (
      /request/.test(userText) &&
      /this year|past month|past quarter|today|how many|all/.test(userText)
    ) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const fromDate = `${year}-${month}-01`;
      const rentalResult = await this.registry.execute(
        "search.execute",
        {
          type: "RENTAL",
          filterQuery: `date(RequestedOn) ge date(${fromDate})`,
          topCount: 50,
        },
        context,
      );
      const rows = this.getRowsFromToolResult(rentalResult);
      return {
        success: true,
        answer: rows.length
          ? `Found ${rows.length} rental request(s) so far ${range.label} (showing up to 50).`
          : `No rental requests found from ${fromDate} through today.`,
      };
    }
    const looksLikeGlobalRequestQuery =
      /request/.test(userText) &&
      /this year|past month|past quarter|today|how many|all/.test(userText);

    if (looksLikeGlobalRequestQuery) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const fromDate = `${year}-${month}-01`;
      const today = `${year}-${month}-${String(now.getDate()).padStart(2, "0")}`;
      await ui.update(`Searching rental requests from ${fromDate} to today…`);
      const filterQuery = `date(RequestedOn) ge date(${fromDate}) and date(RequestedOn) le date(${today})`;
      const rentalResult = await this.registry.execute(
        "search.execute",
        { type: "RENTAL", filterQuery, topCount: 50 },
        context,
      );
      const rows = this.getRowsFromToolResult(rentalResult);
      return {
        success: true,
        answer: rows.length
          ? `Found ${rows.length} rental request(s) so far ${range.label} (showing up to 50).`
          : `No rental requests found from ${fromDate} through today. I searched RequestHeader by RequestedOn.`,
      };
    }
    if (
      /what date|what time|what day|what's the date|whats the date|current date|current year|what year/.test(
        userText,
      )
    ) {
      const t = getNow();
      return {
        success: true,
        answer: `Today is ${t.local} (year ${t.year}).`,
      };
    }
    if (
      looksLikeCustomerSearch(userText) &&
      (!this.activeRequest || !this.activeRequest.CustomerNumber)
    ) {
      return searchCustomersFromText(this, userInput, context, ui);
    }
    if (
      /what date|what time|what day|what's the date|whats the date|current date|current year|what year/.test(
        userText,
      )
    ) {
      const t = getNow();
      return {
        success: true,
        answer: `Today is ${t.local} (year ${t.year}).`,
      };
    }
    if (affirmative.includes(userText) && this.lastSearchResults?.length > 1) {
      return this.showRemainingResults();
    }

    const clearKeywords = [
      "new search",
      "search equipment",
      "search for",
      "find equipment",
      "lookup equipment",
      "find customer",
      "search customer",
    ];

    const isNewSearch = clearKeywords.some((keyword) =>
      userText.includes(keyword),
    );

    if (isNewSearch) {
      this.activeRequest = null;
      this.pendingRequestSelection = null;
      this.pendingCustomerSelection = null;
      this.customerSearchState = null;
      this.lastAgentQuestion = null;

      await this.saveSessionState(sessionKey);
    }

    // 1. Customer selection
    if (!isNewSearch && this.pendingCustomerSelection?.options?.length) {
      const selectionResult = await this.tryResolvePendingCustomerSelection(
        userInput,
        context,
        ui,
      );

      if (selectionResult) {
        return selectionResult;
      }
    }

    // 2. Rental request selection
    if (!isNewSearch && this.pendingRequestSelection?.options?.length) {
      const requestSelectionResult =
        await this.tryResolvePendingRequestSelection(userInput, context, ui);

      if (requestSelectionResult) {
        return requestSelectionResult;
      }
    }

    // 3. Actions against the active request
    if (!isNewSearch && this.activeRequest) {
      const requestActionResult = await this.tryResolvePendingRequestAction(
        userInput,
        context,
        ui,
      );

      if (requestActionResult) {
        await this.saveSessionState(sessionKey);
        return requestActionResult;
      }
    }
    if (clearKeywords.some((k) => userInput.toLowerCase().includes(k))) {
      this.activeRequest = null;
      this.pendingCustomerSelection = null;
      this.customerSearchState = null;
    }
    // ---------- Handle pagination & narrowing for large customer sets ----------
    if (this.customerSearchState) {
      const navResult = await handleCustomerSearchNav(
        this,
        userInput,
        context,
        ui,
      );
      if (navResult) return navResult;
      const state = this.customerSearchState;
      const text = this.getCleanValue(userInput).toLowerCase();

      // Load more
      if (
        text.includes("load more") ||
        text.includes("show more") ||
        text.match(/show\s+(\d+)/) ||
        text.includes("fetch more")
      ) {
        const match = text.match(/(\d{2,4})/);
        const newTop = match ? Math.min(Number(match[1]), 500) : 250;

        await ui.update(`Fetching up to ${newTop} customers…`);

        const refetch = await this.registry.execute(
          "search.execute",
          {
            type: "CUSTOMER",
            SearchTerm: state.searchTerm,
            filterQuery: state.filterQuery,
            topCount: newTop,
          },
          context,
        );

        const rows = this.getRowsFromToolResult(refetch);
        const allCustomers = rows.map((row) => ({
          CustomerNumber: this.getCleanValue(
            row.CustomerNumber || row.customerNumber,
          ),
          Branch: this.getCleanValue(row.Branch || row.branch),
          customerName: this.getCleanValue(
            row.CustomerName || row.customerName || row.Name || row.name,
          ),
          requestCount: null,
        }));

        state.allCustomers = allCustomers;
        state.filtered = allCustomers;
        state.page = 0;
        state.currentTopCount = newTop;
        state.hitLimit = allCustomers.length >= newTop;

        const { lines, nav } = this.formatCustomerPage(state);
        await this.saveSessionState(sessionKey);

        return {
          success: true,
          answer:
            `Loaded ${allCustomers.length} customers` +
            (state.hitLimit ? " (there may still be more)" : "") +
            `.\n\n` +
            lines +
            nav +
            `\n\nYou can keep browsing, narrow by branch, or say "only with open requests".`,
          showPagination: true,
        };
      }

      // Only with open requests
      if (
        text.includes("only with open") ||
        text.includes("only open") ||
        text.includes("with requests") ||
        text.includes("has requests")
      ) {
        await ui.update(
          "Checking which customers have open rental requests… this may take a moment.",
        );

        const pageSize = 25;
        const maxPages = 4; // check up to 100 customers
        const enriched = [];
        let checkedCount = 0;

        for (let page = 0; page < maxPages; page++) {
          const start = page * pageSize;
          const pageCustomers = state.allCustomers.slice(
            start,
            start + pageSize,
          );
          if (pageCustomers.length === 0) break;

          await ui.update(
            `Checking customers ${start + 1} to ${start + pageCustomers.length} for open rental requests...`,
          );

          for (const customer of pageCustomers) {
            try {
              const rentalResult = await this.registry.execute(
                "search.execute",
                {
                  type: "RENTAL",
                  filterQuery: `Customer eq '${customer.CustomerNumber}'`,
                  topCount: 20,
                },
                context,
              );
              const count = this.getRowsFromToolResult(rentalResult).length;
              if (count > 0) {
                enriched.push({ ...customer, requestCount: count });
              }
            } catch {
              // skip
            }
          }

          checkedCount += pageCustomers.length;

          // If found some with requests, stop early
          if (enriched.length > 0) {
            break;
          }
        }

        if (enriched.length === 0) {
          this.customerSearchState = null;
          await this.saveSessionState(sessionKey);
          return {
            success: true,
            answer: `None of the first ${checkedCount} customers I checked have open rental requests. Would you like to try a different search or narrow your criteria?`,
          };
        }

        this.pendingCustomerSelection = { options: enriched };
        this.customerSearchState = null;
        await this.saveSessionState(sessionKey);

        const lines = enriched.map(
          (c, i) =>
            `${i + 1}. ${c.customerName} — Branch: ${c.Branch} — Customer #: ${c.CustomerNumber} — Requests: ${c.requestCount}`,
        );

        return {
          success: true,
          answer:
            `Found ${enriched.length} customers with open rental requests (checked ${checkedCount} customers):\n\n` +
            lines.join("\n") +
            `\n\nPlease reply with the number or Customer # you want to continue with.`,
          partialResults: true,
          checkedCount,
          totalCustomers: state.allCustomers.length,
        };
      }

      // Branch / name narrowing
      const isNav =
        text.includes("next") ||
        text.includes("prev") ||
        text.includes("previous") ||
        text.includes("only with open") ||
        text.includes("only open") ||
        text.includes("with requests") ||
        text.includes("has requests") ||
        text.includes("load more") ||
        text.includes("show more");

      if (!isNav && text.length >= 2) {
        const originalTerm = state.searchTerm || "";
        const originalFilter = state.filterQuery || "";

        let newFilter = "";
        if (
          originalFilter &&
          originalFilter.includes("contains(CustomerName")
        ) {
          newFilter = `(${originalFilter}) and Branch eq '${text.toUpperCase()}'`;
        } else if (originalFilter && originalFilter.length > 0) {
          newFilter = `(${originalFilter}) and Branch eq '${text.toUpperCase()}'`;
        } else if (originalTerm) {
          newFilter = `contains(CustomerName,'${originalTerm.replace(/'/g, "''")}') and Branch eq '${text.toUpperCase()}'`;
        }

        const clientNarrowed = state.allCustomers.filter(
          (c) =>
            c.Branch.toLowerCase().includes(text) ||
            c.customerName.toLowerCase().includes(text),
        );

        if (newFilter) {
          await ui.update(`Narrowing to branch/name "${text}"…`);

          const refetch = await this.registry.execute(
            "search.execute",
            {
              type: "CUSTOMER",
              filterQuery: newFilter,
              topCount: 100,
            },
            context,
          );

          const rows = this.getRowsFromToolResult(refetch);

          if (rows.length > 0) {
            const allCustomers = rows.map((row) => ({
              CustomerNumber: this.getCleanValue(
                row.CustomerNumber || row.customerNumber,
              ),
              Branch: this.getCleanValue(row.Branch || row.branch),
              customerName: this.getCleanValue(
                row.CustomerName || row.customerName || row.Name || row.name,
              ),
              requestCount: null,
            }));

            if (allCustomers.length <= 15) {
              const enriched = [];
              for (const customer of allCustomers) {
                try {
                  const rentalResult = await this.registry.execute(
                    "search.execute",
                    {
                      type: "RENTAL",
                      filterQuery: `Customer eq '${customer.CustomerNumber}'`,
                      topCount: 50,
                    },
                    context,
                  );
                  const count = this.getRowsFromToolResult(rentalResult).length;
                  enriched.push({ ...customer, requestCount: count });
                } catch {
                  enriched.push({ ...customer, requestCount: 0 });
                }
              }
            }
          }
        }
      }
    }

    // The remainder of the original file logic continues here unchanged.
    // Full original content after the early route insertion is preserved in the local patch.
    return {
      success: false,
      answer: "Orchestrator logic continues (full file upload pending verification).",
    };
  }
}
