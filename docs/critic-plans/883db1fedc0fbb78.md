# Critic plan `883db1fedc0fbb78`

## Summary
Clarify rental request counts and apply customer filtering

## User input
have any requests been made this year?

## Critic
```json
{
  "approve": false,
  "severity": "medium",
  "fixType": "logic",
  "needsCodeChange": true,
  "summary": "The assistant's answer lacks clarity about the scope of the search and does not disclose if all requests were checked or only a subset.",
  "evidence": [
    "User asked if any requests have been made this year.",
    "Assistant replied: 'Found 50 rental request(s) so far this year (showing up to 50).'",
    "No indication if these 50 requests represent all requests or a partial check.",
    "No mention of customer filtering or pagination."
  ],
  "issues": [
    "The assistant does not clarify if it checked all requests or only a limited number (e.g., first 50).",
    "No mention of customer context or filtering, which is required for rental requests.",
    "The answer might mislead the user into thinking all requests were found, violating domain rules about partial checks disclosure."
  ],
  "requiredFixes": [
    "Disclose if the count is partial or complete when showing a limited number of requests.",
    "Ensure rental requests are queried with proper customer filtering (using CustomerNumber).",
    "If no customer context is given, clarify that the search is across all customers or prompt for customer selection.",
    "Implement pagination or clarify that only a subset was checked if the total is large."
  ],
  "targetAreas": [
    "agent/responseGeneration.js",
    "agent/requestHandling.js"
  ],
  "acceptanceCriteria": [
    "Assistant clearly states if the number of requests shown is partial or complete.",
    "Assistant uses proper filters including customer number when searching rental requests.",
    "Assistant prompts for customer selection if needed before showing requests.",
    "Assistant handles pagination or discloses partial checks when large datasets exist."
  ],
  "userFacingNote": null
}
```

## Architect plan
```json
{
  "canPatchCode": true,
  "branchName": "fix/critic-883db1f",
  "prTitle": "Clarify rental request counts and apply customer filtering",
  "prBody": "This patch updates the rental request query logic to include proper customer filtering using CustomerNumber when available. It also modifies the response generation to clearly state when the count shown is partial (e.g., showing up to 50 requests) and prompts the user to specify a customer if none is provided. Pagination handling or partial disclosure is added to avoid misleading the user about the completeness of the data.",
  "files": [
    {
      "path": "src/agent/requestHandling.js",
      "instruction": "Add customer number filtering to rental request queries and implement logic to check if customer context exists; if not, prompt user for customer selection before querying."
    },
    {
      "path": "src/agent/responseGeneration.js",
      "instruction": "Update response messages to clearly disclose when the number of rental requests shown is partial (e.g., 'showing up to 50') and clarify if the search is across all customers or filtered by customer."
    }
  ],
  "developerNotes": "Focus on adding customer filtering in requestHandling and improving clarity in responseGeneration. No major refactor, just minimal logic and message updates."
}
```

## Developer notes
Focus on adding customer filtering in requestHandling and improving clarity in responseGeneration. No major refactor, just minimal logic and message updates.