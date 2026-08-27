# Critic plan `cf6ea2fadd25c296`

## Summary
Fix customer search to filter by 'Amazon' in CustomerName and retrieve rental requests accordingly

## User input
can you find requests for any amazon customer

## Critic
```json
{
  "approve": false,
  "severity": "medium",
  "fixType": "logic",
  "needsCodeChange": true,
  "summary": "The assistant fails to filter customers by 'Amazon' and does not use the required OData filter for customer name search.",
  "evidence": [
    "User asked to find requests for any Amazon customer.",
    "Assistant replied by checking customers 1-25 without filtering by 'Amazon'.",
    "No mention of using CUSTOMER filter with contains(CustomerName,'Amazon').",
    "No rental requests found but no indication that the search was narrowed to Amazon customers."
  ],
  "issues": [
    "Customer search does not apply the required filter for 'Amazon'.",
    "Assistant checks generic customers instead of filtering by customer name containing 'Amazon'.",
    "No use of CUSTOMER → CustomerNumber → RENTAL flow as per domain rules.",
    "Pagination is shown but the initial search is incorrect, leading to irrelevant results."
  ],
  "requiredFixes": [
    "Apply OData filter to search customers with CustomerName containing 'Amazon'.",
    "After finding Amazon customers, retrieve their CustomerNumbers and then check RENTAL requests for those customers.",
    "Ensure the flow CUSTOMER → CustomerNumber → RENTAL is followed.",
    "Only paginate after filtering by 'Amazon' customers."
  ],
  "targetAreas": [
    "customerSearchLogic",
    "rentalRequestRetrieval",
    "paginationHandling"
  ],
  "acceptanceCriteria": [
    "When user asks for requests for 'Amazon' customers, the system filters customers by CustomerName containing 'Amazon'.",
    "Rental requests are retrieved only for those filtered customers using their CustomerNumbers.",
    "Pagination applies only to the filtered customer set.",
    "Assistant response reflects the filtered search and rental request status accurately."
  ],
  "userFacingNote": null
}
```

## Architect plan
```json
{
  "canPatchCode": true,
  "branchName": "fix/critic-cf6ea2f",
  "prTitle": "Fix customer search to filter by 'Amazon' in CustomerName and retrieve rental requests accordingly",
  "prBody": "This fix updates the customer search logic to apply an OData filter that includes only customers whose CustomerName contains 'Amazon'. It then retrieves rental requests only for those filtered customers by using their CustomerNumbers, following the CUSTOMER → CustomerNumber → RENTAL flow. Pagination is applied after filtering to ensure relevant results. This addresses the critique that the assistant previously searched all customers without filtering, leading to irrelevant results and incorrect rental request retrieval.",
  "files": [
    {
      "path": "src/agent/copilotOrchestrator.js",
      "instruction": "Modify the customer search function to include an OData filter with contains(CustomerName,'Amazon') when the user query includes 'Amazon'. Ensure subsequent rental request retrieval uses the filtered CustomerNumbers. Adjust pagination logic to paginate over filtered customers only."
    }
  ],
  "developerNotes": "The main change is to add the OData filter for customer search and ensure rental requests are fetched only for those filtered customers. This preserves existing pagination but scoped to the filtered set."
}
```

## Developer notes
The main change is to add the OData filter for customer search and ensure rental requests are fetched only for those filtered customers. This preserves existing pagination but scoped to the filtered set.