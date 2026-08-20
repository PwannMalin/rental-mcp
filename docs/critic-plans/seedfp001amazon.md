# Critic plan `seedfp001amazon`

## Summary
Fix filter logic to combine previous CustomerName and new Branch filter

## User input
HOUSTON

## Critic
```json
{
  "summary": "Branch reply ignored Amazon filter and searched CustomerName Houston",
  "evidence": [
    "Previous search was Amazon",
    "User said HOUSTON",
    "Filter was contains(CustomerName,'HOUSTON')"
  ],
  "targetAreas": [
    "src/agent/copilotOrchestrator.js"
  ],
  "severity": "high",
  "acceptanceCriteria": [
    "HOUSTON after Amazon uses combined OData filter"
  ],
  "approve": false,
  "issues": [
    "Must narrow with Branch eq, not new CustomerName search"
  ],
  "needsCodeChange": true,
  "requiredFixes": [
    "Combine contains(CustomerName,'Amazon') and Branch eq 'HOUSTON'"
  ],
  "fixType": "logic"
}
```

## Architect plan
```json
{
  "canPatchCode": true,
  "branchName": "fix/critic-seedfp001",
  "prTitle": "Fix filter logic to combine previous CustomerName and new Branch filter",
  "prBody": "This PR fixes the filter logic in copilotOrchestrator.js to combine the previous CustomerName filter (e.g., 'Amazon') with the new Branch filter (e.g., 'HOUSTON') when the user input is a branch name following a customer search. This ensures the OData query narrows results correctly instead of replacing the filter, addressing the critique about ignoring the previous customer filter.",
  "files": [
    {
      "path": "src/agent/copilotOrchestrator.js",
      "instruction": "Modify the filter construction logic to combine previous CustomerName filter with new Branch eq filter when user input is a branch name, instead of replacing the filter with contains(CustomerName, userInput)."
    }
  ],
  "developerNotes": "Ensure that when the user input is recognized as a branch name following a customer name search, the OData filter uses contains(CustomerName, previousCustomer) and Branch eq userInput to narrow results."
}
```

## Developer notes
Ensure that when the user input is recognized as a branch name following a customer name search, the OData filter uses contains(CustomerName, previousCustomer) and Branch eq userInput to narrow results.