# Critic plan `e7acace9395ebc08`

## Summary
Clarify request count scope and handle pagination for yearly request counts

## User input
how many requests have been created this year? U

## Critic
```json
{
  "approve": false,
  "severity": "medium",
  "fixType": "logic",
  "needsCodeChange": true,
  "summary": "The assistant's answer does not clarify the scope of the search or the filtering criteria used to count requests, and it may not handle large datasets properly.",
  "evidence": [
    "User asked: 'how many requests have been created this year?'",
    "Assistant replied: 'Found 50 rental request(s) so far this year (showing up to 50).'",
    "No mention of filtering by CustomerNumber or pagination for large datasets",
    "No indication of how the requests were counted or if partial data was checked"
  ],
  "issues": [
    "The assistant does not specify if the count is global or filtered by customer, which is required by domain rules.",
    "No disclosure if the count is partial or complete, which is important for large datasets.",
    "No use of OData filters or mention of how the requests were retrieved.",
    "No handling of pagination or partial checks for large numbers of requests."
  ],
  "requiredFixes": [
    "Implement filtering by CustomerNumber if applicable or clarify scope if global.",
    "Disclose if only a subset of requests were checked (e.g., 'checked first 50 of X requests').",
    "Use proper OData filters to count requests created this year.",
    "Handle pagination properly and inform the user if the count is partial."
  ],
  "targetAreas": [
    "agent/requestHandler.js",
    "agent/filteringLogic.js"
  ],
  "acceptanceCriteria": [
    "When asked for request counts, the assistant uses appropriate filters and discloses partial counts if applicable.",
    "The assistant clarifies the scope of the count (e.g., per customer or global).",
    "The assistant handles large datasets with pagination and informs the user accordingly."
  ],
  "userFacingNote": null
}
```

## Architect plan
```json
{
  "canPatchCode": true,
  "branchName": "fix/critic-e7acace9",
  "prTitle": "Clarify request count scope and handle pagination for yearly request counts",
  "prBody": "This patch improves the logic for counting rental requests created this year by:\n\n- Applying appropriate OData filters for the current year using RequestedOn date.\n- Clarifying whether the count is global or filtered by customer number if applicable.\n- Handling pagination to check beyond the first page of results.\n- Disclosing to the user if the count is partial due to pagination limits.\n\nThese changes ensure the assistant's answers are accurate, transparent, and handle large datasets properly as per the critique.",
  "files": [
    {
      "path": "src/agent/requestFlow.js",
      "instruction": "Update request count logic to use RequestedOn date filter for the current year, apply customer number filter if present, handle pagination to count all requests, and return count with indication if partial."
    }
  ],
  "developerNotes": "No new files needed. The fix focuses on requestFlow.js where request queries and counts are handled. The patch adds proper OData filters for RequestedOn year, customer filtering if applicable, and implements pagination to ensure full counts or partial count disclosure."
}
```

## Developer notes
No new files needed. The fix focuses on requestFlow.js where request queries and counts are handled. The patch adds proper OData filters for RequestedOn year, customer filtering if applicable, and implements pagination to ensure full counts or partial count disclosure.