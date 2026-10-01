# Critic plan `b0fcf0d2a9cbd1fc`

## Summary
Fix customer search and rental request retrieval for customer name queries

## User input
can you find requests for clampitt paper?

## Critic
```json
{
  "approve": false,
  "severity": "medium",
  "fixType": "logic",
  "needsCodeChange": true,
  "summary": "The assistant incorrectly searched for customers with a name containing 'clampitt ?' and did not proceed to find rental requests for Clampitt Paper.",
  "evidence": [
    "User asked to find requests for 'clampitt paper'.",
    "Assistant replied it searched for customers named 'clampitt ?' but found none.",
    "No rental request search was performed after customer search.",
    "No clarification or suggestion to refine the search was given."
  ],
  "issues": [
    "The assistant incorrectly added a question mark in the customer name search filter ('clampitt ?').",
    "The assistant did not attempt to find customers with name containing 'Clampitt Paper' properly.",
    "The assistant did not proceed to search rental requests after customer search.",
    "The assistant prematurely concluded no customers found without clarifying or suggesting alternatives.",
    "The assistant response does not follow the domain rule that customer name search uses CUSTOMER with contains(CustomerName,'Amazon') style filtering.",
    "No pagination or further search steps were considered."
  ],
  "requiredFixes": [
    "Correct the customer name search to properly use contains(CustomerName,'Clampitt Paper') without extraneous characters.",
    "After finding customers matching 'Clampitt Paper', proceed to retrieve rental requests using the CustomerNumber.",
    "If no customers found, suggest alternative names or clarifications rather than a blunt 'found none'.",
    "Implement pagination or partial result disclosure if large customer sets exist.",
    "Ensure the flow CUSTOMER → CustomerNumber → RENTAL is followed."
  ],
  "targetAreas": [
    "src/agent/customerLookup.js",
    "src/agent/requestFlow.js",
    "src/agent/copilotOrchestrator.js"
  ],
  "acceptanceCriteria": [
    "When user asks for requests for a customer name, the system searches customers using contains(CustomerName,'name') filter correctly.",
    "If customers are found, rental requests are retrieved using CustomerNumber.",
    "If no customers found, the system suggests alternative names or clarifications.",
    "The system handles large customer sets with pagination or partial result disclosure.",
    "No extraneous characters are added to search filters."
  ],
  "userFacingNote": null
}
```

## Architect plan
```json
{
  "canPatchCode": true,
  "branchName": "fix/critic-b0fcf0d2",
  "prTitle": "Fix customer search and rental request retrieval for customer name queries",
  "prBody": "This PR addresses the issue where the assistant incorrectly searched for customers with extraneous characters and did not proceed to retrieve rental requests.\n\n- Correct customer name search to use contains(CustomerName,'Clampitt Paper') without extraneous characters.\n- After finding matching customers, proceed to retrieve rental requests using CustomerNumber.\n- If no customers are found, suggest alternative names or clarifications instead of bluntly stating none found.\n- Add pagination support for large customer result sets.\n- Ensure the flow CUSTOMER → CustomerNumber → RENTAL is followed as per domain rules.\n\nThese changes improve accuracy and user experience when searching for rental requests by customer name.",
  "files": [
    {
      "path": "src/agent/customerLookup.js",
      "instruction": "Fix searchCustomersFromText to correctly use contains(CustomerName,'searchTerm') without extraneous characters and support pagination."
    },
    {
      "path": "src/agent/requestFlow.js",
      "instruction": "Update logic to retrieve rental requests after customer search using CustomerNumber and handle no customer found scenario with suggestions."
    }
  ],
  "developerNotes": "No changes to copilotOrchestrator.js are needed as routing is not the issue. Focus on fixing customerLookup.js for correct filtering and requestFlow.js for following up with rental requests and user guidance."
}
```

## Developer notes
No changes to copilotOrchestrator.js are needed as routing is not the issue. Focus on fixing customerLookup.js for correct filtering and requestFlow.js for following up with rental requests and user guidance.