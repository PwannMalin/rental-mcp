import { getAccessToken } from "./auth.js";

export async function exportDocumentPdf(
  repositoryId,
  entryId
) {
  const token = await getAccessToken();

  const exportResponse = await fetch(
    `https://api.laserfiche.com/repository/v2/Repositories/${repositoryId}/Entries/${entryId}/Export`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        part: "Edoc"
      })
    }
  );

  if (!exportResponse.ok) {
    throw new Error(
      `Export failed: ${exportResponse.status}`
    );
  }

  const exportData =
    await exportResponse.json();

  const fileResponse =
    await fetch(exportData.value);

  if (!fileResponse.ok) {
    throw new Error(
      `Download failed: ${fileResponse.status}`
    );
  }

  return Buffer.from(
    await fileResponse.arrayBuffer()
  );
}