function extractSimpleEquipmentLines(query = "") {
    const text = String(query).toLowerCase();

    const knownEquipment = [
        "forklift",
       
        "pallet jack",
        "pallet jacks",
        "reach truck",
        "reach trucks",
        "order picker",
        "order pickers",
        "scissor lift",
        "scissor lifts"
    ];

    const numberWords = {
        one: 1, two: 2, three: 3, four: 4, five: 5,
        six: 6, seven: 7, eight: 8, nine: 9, ten: 10
    };

    const lines = [];

    for (const equipment of knownEquipment) {
        if (!text.includes(equipment)) continue;

        const regex = new RegExp(`(\\d+|${Object.keys(numberWords).join('|')})\\s+${equipment}`);
        const match = text.match(regex);

        let quantity = 1;
        if (match?.[1]) {
            quantity = numberWords[match[1]] || Number(match[1]) || 1;
        }

        lines.push({
            EquipmentType: equipment,
            Quantity: quantity,
            RawRequest: query
        });
    }

    return lines;
}

function getCreatedRequestId(previousResult) {
    return (
        previousResult?.result?.data?.rowID ||
        previousResult?.result?.data?.RowID ||
        previousResult?.result?.data?.id ||
        previousResult?.result?.data?.ID ||
        previousResult?.result?.data?.RequestID ||
        previousResult?.result?.data?.requestId ||
        previousResult?.rowID ||
        previousResult?.id ||
        ""
    );
}

function getCustomerSearchResults(result) {
    return (
        result?.data?.rows ||
        result?.data?.preview ||
        result?.rows ||
        result?.preview ||
        result?.result?.data?.data?.value ||
        []
    );
}

function extractCustomerName(query = "") {
    const match = String(query).match(/for\s+(.+?)(?:\s+with|\s*$)/i);
    return match?.[1]?.trim() || "";
}

// ================================================================

export function registerWorkflows(chainEngine) {

    chainEngine.registerWorkflow("rentalQuoteWorkflow", [
        {
            name: "searchCustomer",
            tool: "search.execute",
            mapInput: (input) => ({
                type: "CUSTOMER",
                SearchTerm: input.customer || extractCustomerName(input.query)
            })
        },

        {
            name: "createRequestHeader",
            tool: "requestHeader.execute",
            mapInput: (input, previousResult) => {
                const customers = getCustomerSearchResults(previousResult);
                const customer = customers[0] || {};

                return {
                    Command: "CREATE",
                    rowInfo: {
                        RequestType: "Rental",
                        RequestStatus: "Created",
                        Customer: customer.CustomerNumber?.trim() || "1",
                        Branch: customer.Branch?.trim() || "ADDISON",
                        RequestedBy: "Patrick.Wann@malinusa.com",
                        RequestedOn: new Date().toISOString(),
                        isLocked: false,
                        RequestSource: "Copilot MCP",
                        Comments: input.comments || input.query || "",
                        RawRequest: input.query
                    }
                };
            }
        },

        {
            name: "createRequestLines",
            tool: "requestLine.execute",
            mapInput: (input, previousResult) => {
                const requestId = getCreatedRequestId(previousResult);

                const requestLines = input.requestLines ||
                                   input.equipmentLines ||
                                   extractSimpleEquipmentLines(input.query);

                const lines = requestLines.map(line => ({
                    ...line,
                    RequestRowID: requestId
                }));

                return {
                    Command: "CREATE",
                    lines
                };
            }
        },

        {
            name: "findRequestor",
            tool: "user.lookup",
            mapInput: (input) => ({
                SearchTerm: input.recipientName ||
                           input.SearchTerm ||
                           "Patrick Wann"
            })
        },

        {
            name: "sendConfirmationEmail",
            tool: "email.send",
            mapInput: (input, previousResult) => {
                const userResults = previousResult?.result?.data || [];
                const firstUser = Array.isArray(userResults) ? userResults[0] : userResults;

                return {
                    Recipient: firstUser?.Mail ||
                              firstUser?.UserPrincipalName ||
                              input.Recipient ||
                              "",
                    Subject: "Rental Request Created",
                    textBody: `Your rental request has been submitted successfully.\n\nRequest:\n${input.query}\n\nThis request was generated by MCP.`,
                    Attachment: []
                };
            }
        }
    ]);


    // =================================================================
chainEngine.registerWorkflow("searchRentalRequestsWorkflow", [

    // =========================================================
    // STEP 1: Find Customer
    // =========================================================
    {
        name: "findCustomer",
        tool: "search.execute",
        mapInput: (input) => ({
            type: "CUSTOMER",
            SearchTerm:
                input.SearchTerm ||
                input.searchTerm ||
                input.customer ||
                input.query ||
                ""
        })
    },

    // =========================================================
    // STEP 2: Find Rental Requests
    // =========================================================
    {
        name: "findRentalRequests",
        tool: "search.execute",
        mapInput: (input, previousResult) => {

            console.log("PREVIOUS RESULT FROM CUSTOMER SEARCH:");
            console.log(JSON.stringify(previousResult, null, 2));

            const customers =
                previousResult?.rows ||
                previousResult?.preview ||
                previousResult?.data?.rows ||
                previousResult?.data?.preview ||
                [];

            console.log("CUSTOMER COUNT:", customers.length);

            const customer =
                customers.find(
                    c =>
                        c.Branch?.trim().toUpperCase() === "ADDISON"
                ) ||
                customers[0];

            console.log(
                "SELECTED CUSTOMER:",
                JSON.stringify(customer, null, 2)
            );

            if (!customer) {
                return {
                    type: "RENTAL",
                    filterQuery: "1 eq 0"
                };
            }

            const customerNumber = String(
                customer.CustomerNumber ||
                customer.CustomerNo ||
                customer.CustomerID ||
                customer.CustomerId ||
                customer.customerNumber ||
                customer.Customer ||
                ""
            ).trim();

            console.log(
                "CUSTOMER NUMBER:",
                customerNumber
            );

            if (!customerNumber) {
                return {
                    type: "RENTAL",
                    filterQuery: "1 eq 0"
                };
            }

            const filterQuery =
                `Customer eq '${customerNumber}'`;

            console.log(
                "RENTAL FILTER:",
                filterQuery
            );

            return {
                type: "RENTAL",
                filterQuery
            };
        }
    },

    // =========================================================
    // STEP 3: Find Request Lines
    // =========================================================
    {
        name: "findRequestLines",
        tool: "search.execute",
        mapInput: (input, previousResult) => {

            console.log("RENTAL REQUEST RESULT:");
            console.log(
                JSON.stringify(
                    previousResult,
                    null,
                    2
                )
            );

            const requests =
                previousResult?.rows ||
                previousResult?.preview ||
                previousResult?.data?.rows ||
                previousResult?.data?.preview ||
                [];

            console.log(
                "REQUEST COUNT:",
                requests.length
            );

            const request = requests[0];

            console.log(
                "SELECTED REQUEST:",
                JSON.stringify(
                    request,
                    null,
                    2
                )
            );

            if (!request?.RequestID) {
                return {
                    type: "REQUEST_LINES",
                    filterQuery: "1 eq 0"
                };
            }

            const filterQuery =
                `RequestID eq ${request.RequestID}`;

            console.log(
                "REQUEST LINE FILTER:",
                filterQuery
            );

            return {
                type: "REQUEST_LINES",
                filterQuery
            };
        }
    }

]);
    chainEngine.registerWorkflow("emailQuoteWorkflow", [
        {
            name: "findRecipient",
            tool: "user.lookup",
            mapInput: (input) => ({
                SearchTerm: input.recipientName ||
                           input.SearchTerm ||
                           input.query
            })
        },

        {
            name: "sendEmail",
            tool: "email.send",
            mapInput: (input, previousResult) => {
                const userResults = previousResult?.result?.data || [];
                const firstUser = Array.isArray(userResults) ? userResults[0] : userResults;

                return {
                    Recipient: firstUser?.Mail ||
                              firstUser?.UserPrincipalName ||
                              input.Recipient ||
                              "",
                    Subject: input.Subject || input.subject || "Rental Quote",
                    textBody: input.textBody || input.body || "Your rental quote request has been processed.",
                    Attachment: input.Attachment || input.attachments || []
                };
            }
        }
    ]);
}