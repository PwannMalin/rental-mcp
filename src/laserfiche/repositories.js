import { lfRequest } from "./client.js";

export async function getRootFolder(
  repositoryId
) {
  return lfRequest(
    `/Repositories/${repositoryId}/Entries/1`
  );
}