import { lfRequest } from "./client.js";

export async function createFolder(
  repositoryId,
  parentFolderId,
  folderName,
  autoRename = false
) {
  return lfRequest(
    `/Repositories/${repositoryId}/Entries/${parentFolderId}/Folder/Children`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        entryType: "Folder",
        name: folderName,
        autoRename
      })
    }
  );
}