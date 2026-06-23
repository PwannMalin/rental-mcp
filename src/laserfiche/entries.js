import { lfRequest } from "./client.js";

export async function getChildren(
  repositoryId,
  entryId
) {


  console.log("repositoryId:", repositoryId);
  console.log("entryId:", entryId);

  return lfRequest(
    `/Repositories/${repositoryId}/Entries/${entryId}/Folder/Children`
  );
}

export async function getEntry(
  repositoryId,
  entryId
) {
  return lfRequest(
    `/Repositories/${repositoryId}/Entries/${entryId}`
  );
}