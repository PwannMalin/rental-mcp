export async function getRequestDocument(
  repositoryId,
  requestFolderId
) {
  const response =
    await getChildren(
      repositoryId,
      requestFolderId
    );

  return response.value.find(
    e => e.entryType === "Document"
  );
}