import { exportDocumentPdf }
  from "../laserfiche/export.js";

export async function downloadRental(
  documentId
) {
  const repositoryId =
    process.env.REPOSITORY_ID;

  return exportDocumentPdf(
    repositoryId,
    documentId
  );
}