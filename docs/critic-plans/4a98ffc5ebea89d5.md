# Critic plan `4a98ffc5ebea89d5`

## Summary
Fix rental request search flow to use CUSTOMER search and auto-continue on single result

## User input
Can find any with Requests?

## Critic
```json
{
  "approve": false,
  "severity": "medium",
  "fixType": "logic",
  "needsCodeChange": true,
  "summary": "The assistant incorrectly uses 'Customers with open rental requests' without confirming the customer search or using proper filters and does not follow the required flow of using CUSTOMER to find CustomerNumber before RENTAL.",
  "evidence": [
    "Assistant states 'Found 1 customers with open rental requests' without showing a prior CUSTOMER search step.",
    "The reply includes customer name and branch, but rental requests should be filtered by CustomerNumber using RENTAL entity.",
    "The assistant asks the user to reply with number or Customer # to continue, but if only one customer is found, it should auto-continue without forcing a number pick.",
    "No mention of using OData filters or pagination for large customer sets."
  ],
  "issues": [
    "Missing proper CUSTOMER search step before listing rental requests.",
    "Rental requests should be queried by CustomerNumber, not by customer name.",
    "Unnecessary prompt for number selection when only one customer is found.",
    "No indication of pagination or partial check if large data sets exist."
  ],
  "requiredFixes": [
    "Implement CUSTOMER search with filter on CustomerName before querying RENTAL with CustomerNumber.",
    "Auto-continue when only one customer with requests is found, without asking for number selection.",
    "Use proper OData filters for rental requests and disclose partial checks if applicable.",
    "Follow the domain flow: CUSTOMER -> CustomerNumber -> RENTAL -> REQUEST_LINES."
  ],
  "targetAreas": [
    "agent/copilotOrchestrator.js",
    "agent/customerSearchHandler.js",
    "agent/rentalRequestHandler.js"
  ],
  "acceptanceCriteria": [
    "The assistant performs a CUSTOMER search with filter on CustomerName before querying rental requests.",
    "Rental requests are retrieved using CustomerNumber, not CustomerName.",
    "If only one customer with open requests is found, the assistant proceeds without asking for number selection.",
    "If large customer sets exist, the assistant paginates and discloses partial checks."
  ],
  "userFacingNote": null
}
```

## Architect plan
```json
{
  "canPatchCode": true,
  "branchName": "fix/critic-4a98ffc5",
  "prTitle": "Fix rental request search flow to use CUSTOMER search and auto-continue on single result",
  "prBody": "This PR addresses the critique that the assistant incorrectly lists rental requests without first performing a CUSTOMER search filtered by CustomerName. It ensures that rental requests are queried using CustomerNumber obtained from the CUSTOMER search. Additionally, if only one customer with open requests is found, the assistant auto-continues without prompting the user to select a number. Proper OData filters and pagination considerations are added to handle large data sets. The domain flow CUSTOMER -> CustomerNumber -> RENTAL -> REQUEST_LINES is followed correctly.",
  "files": [
    {
      "path": "src/agent/copilotOrchestrator.js",
      "instruction": "Update orchestrator logic to ensure CUSTOMER search is performed before RENTAL queries, and to auto-continue when only one customer with requests is found."
    },
    {
      "path": "src/agent/customerSearchHandler.js",
      "instruction": "Implement CUSTOMER search with OData filters on CustomerName and pagination support."
    },
    {
      "path": "src/agent/rentalRequestHandler.js",
      "instruction": "Modify rental request queries to use CustomerNumber from CUSTOMER search results and handle single result auto-continue."
    }
  ],
  "developerNotes": "The fix involves coordinating customer search and rental request retrieval steps to align with domain flow and improve user experience by removing unnecessary prompts."
}
```

## Developer notes
The fix involves coordinating customer search and rental request retrieval steps to align with domain flow and improve user experience by removing unnecessary prompts.