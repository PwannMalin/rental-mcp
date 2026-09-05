import {
  getNow,
  applyDateFilter,
  currentTimePromptBlock,
} from "./dateFilters.js";
import {
  formatCustomerPage,
  enrichPageWithRequests,
  formatRequestPage,
} from "./customerPaging.js";
import { tryResolvePendingCustomerSelection } from "./customerSelection.js";
import {
  getRequestId,
  rememberActiveRequest,
  formatRequestLinesAnswer,
  tryResolvePendingRequestSelection,
  tryResolvePendingRequestAction,
} from "./requestFlow.js";
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
      const state = this.customerSearchState;
      const text = this.getCleanValue(userInput).toLowerCase();

      // Next
      if (text.includes("next")) {
        const maxPage = Math.ceil(state.filtered.length / state.pageSize) - 1;
        if (state.page >= maxPage) {
          return { success: true, answer: "You're already on the last page." };
        }
        state.page += 1;

        if (state.checkRequests) {
          const enriched = await this.enrichPageWithRequests(
            state,
            context,
            ui,
          );
          const pageResult = this.formatRequestPage(enriched, state);
          this.pendingCustomerSelection = pageResult.withRequests.length
            ? { options: pageResult.withRequests }
            : null;
          await this.saveSessionState(sessionKey);
          return {
            success: true,
            answer: pageResult.answer,
            showPagination: pageResult.showPagination,
          };
        }

        const { lines, nav } = this.formatCustomerPage(state);
        await this.saveSessionState(sessionKey);
        return {
          success: true,
          answer: `Page ${state.page + 1}:\n\n${lines}${nav}`,
          showPagination: true,
        };
      }

      // Prev
      if (text.includes("prev") || text.includes("previous")) {
        if (state.page <= 0) {
          return { success: true, answer: "You're already on the first page." };
        }
        state.page -= 1;

        if (state.checkRequests) {
          const enriched = await this.enrichPageWithRequests(
            state,
            context,
            ui,
          );
          const pageResult = this.formatRequestPage(enriched, state);
          this.pendingCustomerSelection = pageResult.withRequests.length
            ? { options: pageResult.withRequests }
            : null;
          await this.saveSessionState(sessionKey);
          return {
            success: true,
            answer: pageResult.answer,
            showPagination: pageResult.showPagination,
          };
        }

        const { lines, nav } = this.formatCustomerPage(state);
        await this.saveSessionState(sessionKey);
        return {
          success: true,
          answer: `Page ${state.page + 1}:\n\n${lines}${nav}`,
          showPagination: true,
        };
      }

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

              const withRequests = enriched.filter((c) => c.requestCount > 0);
              const list = withRequests.length ? withRequests : enriched;

              this.pendingCustomerSelection = { options: list };
              this.customerSearchState = null;
              await this.saveSessionState(sessionKey);

              const lines = list.map(
                (c, i) =>
                  `${i + 1}. ${c.customerName} — Branch: ${c.Branch} — Customer #: ${c.CustomerNumber}${c.requestCount != null ? ` — Requests: ${c.requestCount}` : ""}`,
              );

              return {
                success: true,
                answer:
                  `Narrowed to ${list.length} customer(s) for "${originalTerm || "your search"}" in ${text.toUpperCase()}` +
                  (withRequests.length
                    ? ` (${withRequests.length} with open requests)`
                    : "") +
                  `:\n\n${lines.join("\n")}\n\nReply with the number or Customer #.`,
              };
            }

            state.allCustomers = allCustomers;
            state.filtered = allCustomers;
            state.page = 0;
            state.filterQuery = newFilter;
            state.hitLimit = allCustomers.length >= 100;

            const { lines, nav } = this.formatCustomerPage(state);
            await this.saveSessionState(sessionKey);

            return {
              success: true,
              answer:
                `Narrowed to ${allCustomers.length} customers` +
                (state.hitLimit ? " (there may be more)" : "") +
                ` for branch/name "${text}".\n\n` +
                lines +
                nav +
                `\n\nYou can keep narrowing, use Next/Prev, or say "only with open requests".`,
              showPagination: true,
            };
          }
        }

        if (
          clientNarrowed.length > 0 &&
          clientNarrowed.length < state.allCustomers.length
        ) {
          state.filtered = clientNarrowed;
          state.page = 0;

          const { lines, nav } = this.formatCustomerPage(state);
          await this.saveSessionState(sessionKey);
          return {
            success: true,
            answer:
              `Narrowed to ${clientNarrowed.length} customers (from the current list).\n\n` +
              lines +
              nav,
            showPagination: true,
          };
        }
      }
    } // end if (this.customerSearchState)

    // Check if there is an active customer context (activeRequest with CustomerNumber)
    if (!this.activeRequest || !this.activeRequest.CustomerNumber) {
      // No active customer context, initiate customer search flow
      // Use the userInput as search term for CUSTOMER
      await ui.update(`Searching for customers matching your input...`);

      const customerResult = await this.registry.execute(
        "search.execute",
        {
          type: "CUSTOMER",
          filterQuery: `contains(CustomerName,'${userInput.replace(/'/g, "''")}')`,
          topCount: 50,
        },
        context,
      );

      const customerRows = this.getRowsFromToolResult(customerResult);

      if (!customerRows.length) {
        await this.saveSessionState(this.getSessionKey(context));
        return {
          success: true,
          answer: `I couldn't find any customers matching '${userInput}'. Please try a different search term.`,
        };
      }

      // Normalize customers
      const customers = customerRows.map((row) => ({
        CustomerNumber: this.getCleanValue(
          row.CustomerNumber || row.customerNumber,
        ),
        Branch: this.getCleanValue(row.Branch || row.branch),
        customerName: this.getCleanValue(
          row.CustomerName || row.customerName || row.Name || row.name,
        ),
        requestCount: null,
      }));

      // Enrich customers with rental request counts
      const enriched = [];
      for (const customer of customers) {
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
          enriched.push({ ...customer, requestCount: count });
        } catch {
          enriched.push({ ...customer, requestCount: 0 });
        }
      }

      // If multiple customers found, prompt user to select one or paginate
      if (enriched.length === 1) {
        // Auto-select single customer and fetch rental requests
        const only = enriched[0];
        const rentalResult = await this.registry.execute(
          "search.execute",
          {
            type: "RENTAL",
            filterQuery: `Customer eq '${only.CustomerNumber}'`,
            topCount: 50,
          },
          context,
        );
        const rentalRows = this.getRowsFromToolResult(rentalResult);

        if (!rentalRows.length) {
          await this.saveSessionState(this.getSessionKey(context));
          return {
            success: true,
            answer: `I found customer ${only.CustomerNumber} (${only.Branch || only.customerName}), but there are currently no open rental requests.`,
          };
        }

        if (rentalResult?.success) {
          this.rememberActiveRequest(
            rentalResult,
            {
              type: "RENTAL",
              filterQuery: `Customer eq '${only.CustomerNumber}'`,
              topCount: 50,
            },
            context,
          );
          this.captureSchema("RENTAL", rentalResult);
        }

        await this.saveSessionState(this.getSessionKey(context));

        if (rentalRows.length === 1) {
          const row = rentalRows[0];
          const id = this.getRequestId(row);
          const status = this.getCleanValue(row.RequestStatus || row.Status);
          const contact = this.getCleanValue(row.ContactName || row.Contact);
          return {
            success: true,
            answer: `Found 1 rental request for ${only.customerName} (Customer #${only.CustomerNumber}):\n\nRequestID ${id} — Status: ${status}${contact ? ` — Contact: ${contact}` : ""}\n\nYou can say \"show request lines\", \"details\", or \"equipment requested\" for more information.`,
            showPagination: false,
          };
        }

        const requestList = rentalRows
          .map((row, index) => {
            const id = this.getRequestId(row);
            const status = this.getCleanValue(row.RequestStatus || row.Status);
            const contact = this.getCleanValue(row.ContactName || row.Contact);
            return `${index + 1}. RequestID ${id} — Status: ${status}${contact ? ` — Contact: ${contact}` : ""}`;
          })
          .join("\n");

        return {
          success: true,
          answer: `Found ${rentalRows.length} rental request(s) for ${only.customerName} (Customer #${only.CustomerNumber}):\n\n${requestList}\n\nYou can say \"show request lines\" or \"details\" for more information.`,
          showPagination: true,
        };
      }

      // Multiple customers found, paginate and prompt selection
      this.customerSearchState = {
        allCustomers: enriched,
        filtered: enriched,
        page: 0,
        pageSize: 25,
        searchTerm: userInput,
        filterQuery: `contains(CustomerName,'${userInput.replace(/'/g, "''")}')`,
        onlyWithRequests: false,
        hitLimit: enriched.length >= 50,
        currentTopCount: 50,
        checkRequests: false,
      };

      this.pendingCustomerSelection = { options: enriched };

      const { lines, nav } = this.formatCustomerPage(this.customerSearchState);

      await this.saveSessionState(this.getSessionKey(context));

      return {
        success: true,
        answer: `Found ${enriched.length} customers matching '${userInput}':\n\n${lines}${nav}\n\nPlease reply with the number or Customer # you want to continue with.`,
        showPagination: true,
        awaitingCustomerSelection: true,
        options: enriched,
      };
    }

    // 1) Customer pick (e.g. "1" or customer #)
    const selectionResult = await this.tryResolvePendingCustomerSelection(
      userInput,
      context,
      ui,
    );
    if (selectionResult) {
      return selectionResult;
    }

    // 2) Request pick (when multiple RequestIDs were listed)
    const requestSelectionResult = await this.tryResolvePendingRequestSelection(
      userInput,
      context,
      ui,
    );
    if (requestSelectionResult) {
      return requestSelectionResult;
    }

    // 3) Request lines / equipment for activeRequest
    const requestActionResult = await this.tryResolvePendingRequestAction(
      userInput,
      context,
      ui,
    );
    if (requestActionResult) {
      return requestActionResult;
    }

    const { userId, tenantId } = context;

    let messages = this.buildSystemPrompt(userId, tenantId);
    messages.push({ role: "user", content: userInput });

    for (let step = 0; step < this.maxSteps; step++) {
      await ui.typing();

      try {
        const response = await this.llm.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT,
          messages,
          tools: this.buildTools(),
          tool_choice: "auto",
          temperature: 0.3,
        });

        const msg = response.choices[0].message;

        console.log("========== LLM RESPONSE ==========");
        console.log("content:", msg.content);
        console.log("tool calls:", JSON.stringify(msg.tool_calls, null, 2));
        console.log("==================================");

        // Final answer (no tool calls)
        if (msg.content && !msg.tool_calls?.length) {
          await ui.update("Finalizing response...");
          let answer = msg.content;

          if (
            answer.toLowerCase().includes("unable to search") ||
            answer.toLowerCase().includes("no customer")
          ) {
            answer =
              "I couldn't find matching customer data at the moment. " + answer;
          }

          await this.saveSessionState(sessionKey);
          return { success: true, answer };
        }

        // Tool calls
        if (msg.tool_calls?.length) {
          messages.push(msg);

          for (const call of msg.tool_calls) {
            const toolName = call.function.name;
            await ui.update(`Using: ${toolName}`);

            let args = {};
            try {
              args = JSON.parse(call.function.arguments || "{}");
            } catch (e) {
              args = {};
            }

            // Normalize common LLM argument aliases
            if (toolName === "search.execute") {
              args.type = String(
                args.type || args.searchType || args.SearchType || "",
              )
                .trim()
                .toUpperCase();

              args.SearchTerm =
                args.SearchTerm ||
                args.searchTerm ||
                args.searchText ||
                args.SearchText ||
                args.query ||
                "";
            }

            let result;

            try {
              console.log("Calling tool:", toolName);
              console.log("Arguments:", args);
              if (toolName === "search.execute") {
                args = applyDateFilter(userInput, args);
              }
              result = await this.registry.execute(toolName, args, context);

              if (result?.success) {
                const type = String(args?.type || "").toUpperCase();
                if (type && this.discoveredSchemas.hasOwnProperty(type)) {
                  this.captureSchema(type, result);
                }
              }
              const searchTerm = String(args.SearchTerm || userInput || "")
                .replace(/['"]/g, "")
                .trim();
              const safeTerm = searchTerm.replace(/'/g, "''");
              const normalizedType = String(args?.type || "").toUpperCase();
              const rows = this.getRowsFromToolResult(result);

              if (toolName === "search.execute" && result?.success) {
                this.lastSearchResults = rows;
                this.lastSearchType = normalizedType;
              }

              // === MULTI CUSTOMER HANDLING (with pagination + clarification) ===
              if (
                toolName === "search.execute" &&
                normalizedType === "CUSTOMER" &&
                rows.length > 0
              ) {
                const totalCount = result?.count || rows.length;
                const pageSize = 25;

                // If the search term includes 'amazon', apply OData filter to find customers with CustomerName containing 'Amazon'
                let filteredCustomers = [];
                if (
                  args.SearchTerm &&
                  args.SearchTerm.toLowerCase().includes("amazon")
                ) {
                  // Fetch customers filtered by contains(CustomerName,'Amazon')
                  const amazonResult = await this.registry.execute(
                    "search.execute",
                    {
                      type: "CUSTOMER",
                      filterQuery: searchTerm
                        ? `contains(CustomerName,'${safeTerm}')`
                        : args.filterQuery,
                      topCount: 500,
                    },
                    context,
                  );
                  const amazonRows = this.getRowsFromToolResult(amazonResult);

                  // Normalize amazon customers
                  filteredCustomers = amazonRows.map((row) => ({
                    CustomerNumber: this.getCleanValue(
                      row.CustomerNumber || row.customerNumber,
                    ),
                    Branch: this.getCleanValue(row.Branch || row.branch),
                    customerName: this.getCleanValue(
                      row.CustomerName ||
                        row.customerName ||
                        row.Name ||
                        row.name,
                    ),
                    requestCount: null,
                  }));

                  // Enrich filtered customers with rental request counts (only first 25 to limit load)
                  const enriched = [];
                  const sampleSize = Math.min(25, filteredCustomers.length);
                  for (let i = 0; i < sampleSize; i++) {
                    const customer = filteredCustomers[i];
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
                      const rentalRows =
                        this.getRowsFromToolResult(rentalResult);
                      enriched.push({
                        ...customer,
                        requestCount: rentalRows.length,
                      });
                    } catch {
                      enriched.push({ ...customer, requestCount: 0 });
                    }
                  }

                  filteredCustomers = enriched;

                  // Pagination state for filtered customers
                  this.customerSearchState = {
                    allCustomers: filteredCustomers,
                    filtered: filteredCustomers,
                    page: 0,
                    pageSize: pageSize,
                    searchTerm: args.SearchTerm || "",
                    filterQuery: searchTerm
                      ? `contains(CustomerName,'${safeTerm}')`
                      : args.filterQuery,
                    onlyWithRequests: false,
                    hitLimit: filteredCustomers.length >= 500,
                    currentTopCount: 500,
                    checkRequests: false,
                  };

                  this.pendingCustomerSelection = null;

                  if (filteredCustomers.length === 0) {
                    this.customerSearchState = null;
                    this.pendingCustomerSelection = null;
                    await this.saveSessionState(sessionKey);
                    return {
                      success: true,
                      answer: `No customers with name containing ${searchTerm}' were found. Would you like to try a different search?`,
                    };
                  }

                  if (filteredCustomers.length <= 15) {
                    const withRequests = filteredCustomers.filter(
                      (c) => c.requestCount > 0,
                    );
                    if (withRequests.length === 0) {
                      this.customerSearchState = null;
                      this.pendingCustomerSelection = null;
                      await this.saveSessionState(sessionKey);
                      return {
                        success: true,
                        answer: `No customers matching your search have any active rental requests among the first ${sampleSize} ${searchTerm}' customers checked.\n\nWould you like to search for something else or check more? You can say "load more" to check more customers.`,
                      };
                    }
                    if (withRequests.length === 1) {
                      const only = withRequests[0];
                      this.pendingCustomerSelection = null;
                      this.customerSearchState = null;
                      await this.saveSessionState(sessionKey);
                      const rentalResult = await this.registry.execute(
                        "search.execute",
                        {
                          type: "RENTAL",
                          filterQuery: `Customer eq '${only.CustomerNumber}'`,
                          topCount: 50,
                        },
                        context,
                      );
                      const rentalRows =
                        this.getRowsFromToolResult(rentalResult);
                      if (!rentalRows.length) {
                        await this.saveSessionState(sessionKey);
                        return {
                          success: true,
                          answer: `I found customer ${only.CustomerNumber} (${only.Branch || only.customerName}), but there are currently no open rental requests.`,
                        };
                      }
                      if (rentalResult?.success) {
                        this.rememberActiveRequest(
                          rentalResult,
                          {
                            type: "RENTAL",
                            filterQuery: `Customer eq '${only.CustomerNumber}'`,
                            topCount: 50,
                          },
                          context,
                        );
                        this.captureSchema("RENTAL", rentalResult);
                      }
                      await this.saveSessionState(sessionKey);
                      if (rentalRows.length === 1) {
                        const row = rentalRows[0];
                        const id = this.getRequestId(row);
                        const status = this.getCleanValue(
                          row.RequestStatus || row.Status,
                        );
                        const contact = this.getCleanValue(
                          row.ContactName || row.Contact,
                        );
                        return {
                          success: true,
                          answer:
                            `Found 1 rental request for ${only.customerName} (Customer #${only.CustomerNumber}):\n\n` +
                            `RequestID ${id} — Status: ${status}${contact ? ` — Contact: ${contact}` : ""}\n\n` +
                            `You can say "show request lines", "details", or "equipment requested" for more information.`,
                          showPagination: false,
                        };
                      }
                      const requestList = rentalRows
                        .map((row, index) => {
                          const id = this.getRequestId(row);
                          const status = this.getCleanValue(
                            row.RequestStatus || row.Status,
                          );
                          const contact = this.getCleanValue(
                            row.ContactName || row.Contact,
                          );
                          return `${index + 1}. RequestID ${id} — Status: ${status}${contact ? ` — Contact: ${contact}` : ""}`;
                        })
                        .join("\n");
                      return {
                        success: true,
                        answer:
                          `Found ${rentalRows.length} rental request(s) for ${only.customerName} (Customer #${only.CustomerNumber}):\n\n` +
                          requestList +
                          `\n\nYou can say "show request lines" or "details" for more information.`,
                        showPagination: true,
                      };
                    }
                    this.pendingCustomerSelection = { options: withRequests };
                    this.customerSearchState = null;
                    await this.saveSessionState(sessionKey);
                    const lines = withRequests.map(
                      (c, i) =>
                        `${i + 1}. ${c.customerName} — Branch: ${c.Branch} — Customer #: ${c.CustomerNumber} — Requests: ${c.requestCount}`,
                    );
                    return {
                      success: true,
                      answer:
                        `Found ${withRequests.length} customer(s) with active rental requests among the first ${sampleSize} ${searchTerm} customers checked:\n\n` +
                        lines.join("\n") +
                        `\n\nPlease reply with the number or Customer # you want to continue with. You can also say "load more" to check more ${searchTerm} customers.`,
                      showPagination: true,
                      awaitingCustomerSelection: true,
                      options: withRequests,
                    };
                  }

                  // For larger sets, paginate filtered customers
                  const hitLimit = filteredCustomers.length >= 500;
                  const pageFmt = this.formatCustomerPage(
                    this.customerSearchState,
                  );
                  await this.saveSessionState(sessionKey);
                  let extraHint = "";
                  if (hitLimit) {
                    extraHint =
                      `\n\n⚠️  I only retrieved the first 500 matches. There are likely more.\n` +
                      `• Say **"load more"** (or "show 1000") to fetch a larger set\n` +
                      `• Or narrow by branch / name / "only with open requests"`;
                  }
                  return {
                    success: true,
                    answer:
                      `I found ${filteredCustomers.length} customers matching your search with name containing '${searchTerm}'.\n\n` +
                      `Showing first ${Math.min(pageSize, filteredCustomers.length)}:\n\n` +
                      pageFmt.lines +
                      pageFmt.nav +
                      `\n\nThis is a large result set. You can:\n` +
                      `• Reply with a **branch** name (e.g. "Houston")\n` +
                      `• Give a more specific name (e.g. "${searchTerm} Logistics")\n` +
                      `• Say **"only with open requests"** and I'll check a larger sample\n` +
                      `• Or use **Next ${pageSize}** / **Prev ${pageSize}** to browse` +
                      extraHint,
                    awaitingCustomerSelection: false,
                    showPagination: true,
                  };
                } else {
                  // Normalize the raw rows into a consistent shape
                  let allCustomers = rows.map((row) => ({
                    CustomerNumber: this.getCleanValue(
                      row.CustomerNumber || row.customerNumber,
                    ),
                    Branch: this.getCleanValue(row.Branch || row.branch),
                    customerName: this.getCleanValue(
                      row.CustomerName ||
                        row.customerName ||
                        row.Name ||
                        row.name,
                    ),
                    requestCount: null, // filled later if we enrich
                  }));

                  // ---------- SMALL RESULT SET (≤ 15) → enrich immediately ----------
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
                        const rentalRows =
                          this.getRowsFromToolResult(rentalResult);
                        enriched.push({
                          ...customer,
                          requestCount: rentalRows.length,
                        });
                      } catch {
                        enriched.push({ ...customer, requestCount: 0 });
                      }
                    }

                    const withRequests = enriched.filter(
                      (c) => c.requestCount > 0,
                    );

                    if (withRequests.length === 0) {
                      this.customerSearchState = null;
                      this.pendingCustomerSelection = null;

                      await this.saveSessionState(sessionKey);
                      return {
                        success: true,
                        answer: `No customers matching your search have any active rental requests among the ${enriched.length} checked.\n\nWould you like to search for something else?`,
                      };
                    }
                    if (withRequests.length === 1) {
                      // Auto-select the only customer
                      const only = withRequests[0];
                      this.pendingCustomerSelection = null;
                      this.customerSearchState = null;
                      await this.saveSessionState(sessionKey);
                      // Immediately fetch its rental requests (same logic as tryResolvePendingCustomerSelection)
                      const result = await this.registry.execute(
                        "search.execute",
                        {
                          type: "RENTAL",
                          filterQuery: `Customer eq '${only.CustomerNumber}'`,
                          topCount: 50,
                        },
                        context,
                      );

                      const rows = this.getRowsFromToolResult(result);

                      if (!rows.length) {
                        await this.saveSessionState(sessionKey);
                        return {
                          success: true,
                          answer: `I found customer ${only.CustomerNumber} (${only.Branch || only.customerName}), but there are currently no open rental requests.`,
                        };
                      }

                      if (result?.success) {
                        this.rememberActiveRequest(
                          result,
                          {
                            type: "RENTAL",
                            filterQuery: `Customer eq '${only.CustomerNumber}'`,
                            topCount: 50,
                          },
                          context,
                        );
                        this.captureSchema("RENTAL", result);
                      }

                      await this.saveSessionState(sessionKey);

                      // If there is also only one request, go straight to a nice summary
                      if (rows.length === 1) {
                        const row = rows[0];
                        const id = this.getRequestId(row);
                        const status = this.getCleanValue(
                          row.RequestStatus || row.Status,
                        );
                        const contact = this.getCleanValue(
                          row.ContactName || row.Contact,
                        );

                        return {
                          success: true,
                          answer:
                            `Found 1 rental request for ${only.customerName} (Customer #${only.CustomerNumber}):\n\n` +
                            `RequestID ${id} — Status: ${status}${contact ? ` — Contact: ${contact}` : ""}\n\n` +
                            `You can say "show request lines", "details", or "equipment requested" for more information.`,
                          showPagination: false,
                        };
                      }

                      // Multiple requests → list them
                      const requestList = rows
                        .map((row, index) => {
                          const id = this.getRequestId(row);
                          const status = this.getCleanValue(
                            row.RequestStatus || row.Status,
                          );
                          const contact = this.getCleanValue(
                            row.ContactName || row.Contact,
                          );
                          return `${index + 1}. RequestID ${id} — Status: ${status}${contact ? ` — Contact: ${contact}` : ""}`;
                        })
                        .join("\n");

                      return {
                        success: true,
                        answer:
                          `Found ${rows.length} rental request(s) for ${only.customerName} (Customer #${only.CustomerNumber}):\n\n` +
                          requestList +
                          `\n\nYou can say "show request lines" or "details" for more information.`,
                        showPagination: true,
                      };
                    }

                    this.pendingCustomerSelection = { options: withRequests };
                    this.customerSearchState = null;
                    await this.saveSessionState(sessionKey);

                    const lines = withRequests.map(
                      (c, i) =>
                        `${i + 1}. ${c.customerName} — Branch: ${c.Branch} — Customer #: ${c.CustomerNumber} — Requests: ${c.requestCount}`,
                    );

                    return {
                      success: true,
                      answer:
                        `Found ${withRequests.length} customer(s) with active rental requests:\n\n` +
                        lines.join("\n") +
                        `\n\nPlease reply with the number or Customer # you want to continue with.`,
                      showPagination: true,
                      awaitingCustomerSelection: true,
                      options: withRequests,
                    };
                  }

                  // ---------- LARGE RESULT SET (> 15) ----------
                  const hitLimit = allCustomers.length >= 100;
                  const wantsRequests =
                    /request/i.test(userInput) || /rental/i.test(userInput);

                  this.customerSearchState = {
                    allCustomers,
                    filtered: allCustomers,
                    page: 0,
                    pageSize: 25,
                    searchTerm: args.SearchTerm || "",
                    filterQuery:
                      args.filterQuery ||
                      (args.SearchTerm
                        ? `contains(CustomerName,'${String(args.SearchTerm).replace(/'/g, "''")}')`
                        : ""),
                    onlyWithRequests: false,
                    hitLimit,
                    currentTopCount: args.topCount || 100,
                    checkRequests: wantsRequests,
                  };

                  this.pendingCustomerSelection = null;

                  if (wantsRequests) {
                    const enriched = await this.enrichPageWithRequests(
                      this.customerSearchState,
                      context,
                      ui,
                    );
                    const pageResult = this.formatRequestPage(
                      enriched,
                      this.customerSearchState,
                    );

                    if (pageResult.withRequests.length > 0) {
                      this.pendingCustomerSelection = {
                        options: pageResult.withRequests,
                      };
                    }

                    await this.saveSessionState(sessionKey);

                    return {
                      success: true,
                      answer: pageResult.answer,
                      showPagination: pageResult.showPagination,
                    };
                  }

                  const pageFmt = this.formatCustomerPage(
                    this.customerSearchState,
                  );
                  await this.saveSessionState(sessionKey);

                  let extraHint = "";
                  if (hitLimit) {
                    extraHint =
                      `\n\n⚠️  I only retrieved the first 100 matches. There are likely more.\n` +
                      `• Say **"load more"** (or "show 250") to fetch a larger set\n` +
                      `• Or narrow by branch / name / "only with open requests"`;
                  }

                  return {
                    success: true,
                    answer:
                      `I found ${allCustomers.length} customers matching your search.\n\n` +
                      `Showing first ${Math.min(pageSize, allCustomers.length)}:\n\n` +
                      pageFmt.lines +
                      pageFmt.nav +
                      `\n\nThis is a large result set. You can:\n` +
                      `• Reply with a **branch** name (e.g. "Houston")\n` +
                      `• Give a more specific name (e.g. "Amazon Logistics")\n` +
                      `• Say **"only with open requests"** and I'll check a larger sample\n` +
                      `• Or use **Next ${pageSize}** / **Prev ${pageSize}** to browse` +
                      extraHint,
                    awaitingCustomerSelection: false,
                    showPagination: true,
                  };
                }
              }

              // Remember active rental request
              const looksLikeRentalResult =
                result?.data?.searchType === "RENTAL" ||
                result?.searchType === "RENTAL" ||
                normalizedType === "RENTAL";

              if (looksLikeRentalResult && result.success) {
                this.rememberActiveRequest(result, args, context);
              }

              console.log(
                "ACTIVE REQUEST AFTER TOOL:",
                JSON.stringify(this.activeRequest, null, 2),
              );

              // Handle older tools that return requiresSelection
              if (result?.requiresSelection && result?.options?.length) {
                this.pendingCustomerSelection = {
                  options: result.options.map((c) => ({
                    CustomerNumber: c.customerNumber || c.CustomerNumber,
                    Branch: c.branch || c.Branch,
                    customerName: c.customerName || c.CustomerName,
                  })),
                };

                await this.saveSessionState(sessionKey);

                return {
                  success: true,
                  answer:
                    "Multiple customer locations found.\n\n" +
                    result.options
                      .map(
                        (c, i) =>
                          `${i + 1}. ${c.customerName || c.CustomerName} (${c.branch || c.Branch})`,
                      )
                      .join("\n"),
                  awaitingCustomerSelection: true,
                  options: result.options,
                  showPagination: true,
                };
              }

              console.log("TOOL RESULT:", JSON.stringify(result, null, 2));
            } catch (toolErr) {
              console.error(`Tool ${toolName} failed:`, toolErr.message);
              result = {
                success: false,
                error: toolErr.message,
                message: `The ${toolName} tool encountered an issue.`,
              };
            }

            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(result),
            });

            await ui.update(`Completed: ${toolName}`);
          }
        }
      } catch (err) {
        console.error(`Error in step ${step}:`, err);
        return {
          success: false,
          answer: `ERROR: ${err.message}`,
        };
      }
    }

    return {
      success: false,
      answer: "I couldn't complete the request after several attempts.",
    };
  }

  buildTools() {
    const tools = this.registry?.tools || {};
    const toolList =
      tools instanceof Map ? Array.from(tools.values()) : Object.values(tools);

    const builtTools = toolList.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "No description provided",
        parameters: t.parameters ||
          t.inputSchema ||
          t.schema || {
            type: "object",
            properties: {},
          },
      },
    }));

    console.log(
      "TOOLS EXPOSED TO GPT:",
      builtTools.map((t) => t.function.name),
    );

    return builtTools;
  }

  buildSystemPrompt(userId, tenantId) {
    const memory = this.memory?.get?.(userId, tenantId) || {
      customers: [],
      rentals: [],
      lastActions: [],
      context: {},
    };

    const lastDomain = memory.context?.lastSearchDomain || "none";
    const lastParams = memory.context?.lastSearchParams || {};

    return [
      {
        role: "system",
        content: `
You are a helpful internal Rental Assistant.
${currentTimePromptBlock()}
### Critical Tool Rules
- Always include the "type" parameter when calling search.execute.
- Valid types: CUSTOMER, RENTAL, REQUEST_LINES, EQUIPMENT
- Correct: { "type": "CUSTOMER", "filterQuery": "contains(CustomerName,'Clampitt')" }
- Incorrect: { "filterQuery": "contains(CustomerName,'Clampitt')" }

### Business Rules
- Customer name only → search CUSTOMER first
- Customer number → search RENTAL using CustomerNumber
- Equipment serial / series / model → search EQUIPMENT or REQUEST_LINES
- Never search RENTAL using CustomerName

### Conversation Context (very important)
- Current last search domain: ${lastDomain}
- Last search parameters: ${JSON.stringify(lastParams)}
- Keep the same domain unless the user clearly changes topic.
- Example: if previous turn was about equipment and user says "oh chargers", stay in EQUIPMENT domain.
- Do not switch domains on short ambiguous replies.

### Memory
Recent customers: ${JSON.stringify(memory.customers.slice(0, 4))}
Recent rentals: ${JSON.stringify(memory.rentals.slice(0, 4))}
Recent actions: ${JSON.stringify(memory.lastActions.slice(0, 4))}

### Response Rules
- Be concise and specific.
- When no results are found, say what you searched and suggest a next step.
- Avoid repeating the exact same search.
- Ask clarifying questions when the request is ambiguous.
                `.trim(),
      },
    ];
  }
}
