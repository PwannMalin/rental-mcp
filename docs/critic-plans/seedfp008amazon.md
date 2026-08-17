# Critic plan `seedfp008amazon`

## Summary
Fix OData filter to combine CustomerName and Branch filters

## User input
HOUSTON

## Critic
```json
{
  "summary": "Branch reply ignored Amazon filter and searched CustomerName Houston",
  "evidence": [
    "Previous search was Amazon",
    "User said HOUSTON"
  ],
  "targetAreas": [
    "src/agent/copilotOrchestrator.js"
  ],
  "severity": "high",
  "acceptanceCriteria": [
    "Combined OData filter is used"
  ],
  "approve": false,
  "issues": [
    "Must use Branch eq with existing Amazon CustomerName filter"
  ],
  "needsCodeChange": true,
  "requiredFixes": [
    "Combine original CustomerName filter with Branch eq"
  ],
  "fixType": "logic"
}
```

## Architect plan
```json
{
  "canPatchCode": true,
  "branchName": "fix/critic-seedfp008",
  "prTitle": "Fix OData filter to combine CustomerName and Branch filters",
  "prBody": "This PR fixes the filter logic in copilotOrchestrator.js to combine the existing CustomerName filter (e.g. 'Amazon') with the new Branch filter (e.g. 'HOUSTON') when processing consecutive user inputs. This ensures that the search respects both criteria as required by the critique.",
  "files": [
    {
      "path": "src/agent/copilotOrchestrator.js",
      "instruction": "Modify the OData filter construction logic to combine the previous CustomerName filter with the new Branch eq filter using 'and' operator instead of replacing it."
    }
  ],
  "developerNotes": "The fix ensures that when the user first searches for 'Amazon' customers and then says 'HOUSTON', the filter becomes contains(CustomerName,'Amazon') and Branch eq 'HOUSTON' instead of just filtering by Branch."
}
```

## Developer notes
The fix ensures that when the user first searches for 'Amazon' customers and then says 'HOUSTON', the filter becomes contains(CustomerName,'Amazon') and Branch eq 'HOUSTON' instead of just filtering by Branch.