/**
 * Workflow registration
 */
export function registerWorkflows(chainEngine) {
    chainEngine.registerWorkflow("rentalQuoteWorkflow", [
        {
            name: "searchRentalData",
            tool: "db.search",
            mapInput: input => {
                return {
                    query: input.query,
                    action: "search-rental-data"
                };
            }
        },
        {
            name: "submitQuoteWorkflow",
            tool: "powerAutomate.runFlow",
            mapInput: (input, previousResult) => {
                return {
                    query: input.query,
                    action: "submit-rental-quote-workflow",
                    rentalData: previousResult
                };
            }
        }
    ]);
}