# Critic plan `f03d8bfe1471abdd`

## Summary
Fix rental request search to filter customers by name and use CustomerNumber for rental queries

## User input
can you find any requests with UPS?

## Critic
```json
{
  "approve": false,
  "severity": "medium",
  "fixType": "logic",
  "needsCodeChange": true,
  "summary": "The assistant incorrectly searched rental requests by description containing 'UPS' instead of filtering customers by name and then searching their rental requests by CustomerNumber.",
  "evidence": [
    "User asked to find requests with 'UPS'.",
    "Assistant replied: searched rental requests with 'UPS' in the description but found no results.",
    "Domain rules specify customer name search uses CUSTOMER with contains(CustomerName,'UPS').",
    "Rental requests must be searched using RENTAL with CustomerNumber, never CustomerName.",
    "No indication that the assistant searched customers first or used CustomerNumber for rental requests."
  ],
  "issues": [
    "Assistant searched rental requests by description containing 'UPS' instead of searching customers by name 'UPS'.",
    "Assistant did not follow the required flow: CUSTOMER -> CustomerNumber -> RENTAL.",
    "Assistant response may miss valid requests because it did not filter customers properly.",
    "No mention of pagination or partial checks if many customers exist."
  ],
  "requiredFixes": [
    "Implement customer search using CUSTOMER with filter contains(CustomerName,'UPS').",
    "If multiple customers found, handle pagination or narrowing down.",
    "Use the found CustomerNumber(s) to query RENTAL for rental requests.",
    "Do not search rental requests by description containing 'UPS'.",
    "Update assistant response to reflect correct search method and results."
  ],
  "targetAreas": [
    "agent/customerSearch.js",
    "agent/rentalRequestSearch.js",
    "agent/dialogManager.js"
  ],
  "acceptanceCriteria": [
    "When user asks for requests with a customer name, the system first searches customers by name using CUSTOMER with contains(CustomerName,'name').",
    "Rental requests are searched only by CustomerNumber, never by CustomerName or description containing the name.",
    "If multiple customers are found, the assistant prompts to narrow down or paginate results.",
    "Assistant response accurately reflects the search steps and results."
  ],
  "userFacingNote": null
}
```

## Architect plan
```json
{
  "canPatchCode": true,
  "branchName": "fix/critic-f03d8bf",
  "prTitle": "Fix rental request search to filter customers by name and use CustomerNumber for rental queries",
  "prBody": "This PR addresses the logic flaw where rental requests were searched by description containing the user input (e.g., 'UPS') instead of first searching customers by name and then using their CustomerNumber(s) to query rental requests. The fix implements:\n\n- Customer search using CUSTOMER entity with filter contains(CustomerName,'UPS').\n- Handling multiple customers found with pagination or prompting to narrow down.\n- Rental request search using CustomerNumber(s) only.\n- Updated assistant response to reflect the correct search flow and results.\n\nThis ensures compliance with domain rules and improves accuracy of search results.",
  "files": [
    {
      "path": "src/agent/customerSearch.js",
      "instruction": "Modify customer search logic to use OData filter contains(CustomerName,'<userInput>') and support pagination if multiple customers are found."
    },
    {
      "path": "src/agent/rentalRequestSearch.js",
      "instruction": "Update rental request search to query RENTAL entity using CustomerNumber(s) obtained from customer search, removing any search by description containing the user input."
    },
    {
      "path": "src/agent/dialogManager.js",
      "instruction": "Adjust dialog flow to first perform customer search, handle multiple customers by prompting or paginating, then search rental requests by CustomerNumber(s), and update assistant response accordingly."
    }
  ],
  "developerNotes": "The fix requires coordination between customerSearch, rentalRequestSearch, and dialogManager modules to enforce the correct search sequence and filtering. Pagination or narrowing down customers is important to handle multiple matches. The assistant's response text must be updated to accurately describe the search steps and results."
}
```

## Developer notes
The fix requires coordination between customerSearch, rentalRequestSearch, and dialogManager modules to enforce the correct search sequence and filtering. Pagination or narrowing down customers is important to handle multiple matches. The assistant's response text must be updated to accurately describe the search steps and results.