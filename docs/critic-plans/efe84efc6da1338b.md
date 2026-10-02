# Critic plan `efe84efc6da1338b`

## Summary
Fix customer name filter and follow-up rental request search

## User input
Can you find requests from clampitt paper?

## Critic
```json
{
  "approve": false,
  "severity": "medium",
  "fixType": "logic",
  "needsCodeChange": true,
  "summary": "The assistant incorrectly included a question mark in the customer name filter, causing a failed search.",
  "evidence": [
    "The draft answer states: I searched customers with contains(CustomerName,'clampitt paper?') and found none.",
    "The user asked to find requests from 'clampitt paper' without a question mark.",
    "The assistant did not proceed to check rental requests after customer search."
  ],
  "issues": [
    "The filter used contains(CustomerName,'clampitt paper?') incorrectly includes a question mark, which is not in the user input.",
    "The assistant did not attempt to find rental requests after customer search, missing the flow CUSTOMER → RENTAL.",
    "The assistant prematurely concluded no customers found without clarifying or suggesting alternatives properly."
  ],
  "requiredFixes": [
    "Remove the question mark from the customer name filter in the search.",
    "Follow the domain flow: after finding the customer(s), use CustomerNumber to search rental requests.",
    "If no customers found, suggest alternative names or clarify the search.",
    "Ensure the assistant does not claim no results without checking relevant data properly."
  ],
  "targetAreas": [
    "src/agent/customerLookup.js",
    "src/agent/requestFlow.js"
  ],
  "acceptanceCriteria": [
    "Customer name searches do not include extraneous punctuation not in user input.",
    "After customer search, rental requests are searched using CustomerNumber.",
    "If no customers found, the assistant clearly states that and suggests alternatives.",
    "The assistant does not prematurely claim no results without proper checks."
  ],
  "userFacingNote": null
}
```

## Architect plan
```json
{
  "canPatchCode": true,
  "branchName": "fix/critic-efe84efc",
  "prTitle": "Fix customer name filter and follow-up rental request search",
  "prBody": "This PR fixes the incorrect inclusion of a question mark in the customer name filter when searching customers. It ensures the filter uses the exact user input without extraneous punctuation. Additionally, after finding customers, it proceeds to search rental requests using the CustomerNumber(s) as per the domain flow CUSTOMER → RENTAL. If no customers are found, the assistant now clearly states that and suggests alternatives instead of prematurely concluding no results. These changes improve search accuracy and user experience.",
  "files": [
    {
      "path": "src/agent/customerLookup.js",
      "instruction": "Fix customer name filter to strip trailing punctuation like question marks from user input before searching."
    },
    {
      "path": "src/agent/requestFlow.js",
      "instruction": "Add logic to search rental requests by CustomerNumber after customer search returns results; handle no customer found case with clear messaging."
    }
  ],
  "developerNotes": "The fix focuses on cleaning the customer search input to avoid including question marks and ensuring the flow continues to rental request search after customers are found. No changes to orchestrator or prompt files are needed."
}
```

## Developer notes
The fix focuses on cleaning the customer search input to avoid including question marks and ensuring the flow continues to rental request search after customers are found. No changes to orchestrator or prompt files are needed.