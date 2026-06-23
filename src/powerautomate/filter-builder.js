function buildRequestFilter({
  requestId,
  customer,
  status,
  assignedTo,
  branch,
  requestedFrom,
  requestedTo
}) {
  const filters = [];

  if (requestId) {
    filters.push(`RequestID eq ${requestId}`);
  }

  if (customer) {
    filters.push(`startswith(Customer, '${escapeOData(customer)}')`);
  }

  if (status) {
    const normalized = STATUS_ENUM.find(
      s => s.toLowerCase() === status.toLowerCase()
    );

    if (normalized) {
      filters.push(`RequestStatus eq '${normalized}'`);
    }
  }

  if (assignedTo) {
    filters.push(`contains(AssignedTo, '${escapeOData(assignedTo)}')`);
  }

  if (branch) {
    filters.push(`Branch eq '${escapeOData(branch)}'`);
  }

  if (requestedFrom) {
    filters.push(`RequestedOn ge '${new Date(requestedFrom).toISOString()}'`);
  }

  if (requestedTo) {
    filters.push(`RequestedOn le '${new Date(requestedTo).toISOString()}'`);
  }

  return filters.length ? filters.join(" and ") : null;
}