import { PDFParse } from "pdf-parse";

export async function extractRental(pdfBuffer) {

  const parser = new PDFParse({
    data: new Uint8Array(pdfBuffer)
  });

  const result = await parser.getText();

  const text = result.text;

  const hiddenPos =
    text.indexOf("HiddenJson");

  if (hiddenPos === -1) {
    throw new Error("HiddenJson label not found");
  }

  const customersPos =
    text.indexOf("Customers", hiddenPos);

  if (customersPos === -1) {
    throw new Error("Customers marker not found");
  }

  let jsonText =
    text.substring(
      hiddenPos,
      customersPos
    );

  jsonText =
    jsonText.substring(
      jsonText.indexOf("["),
      jsonText.lastIndexOf("]") + 1
    );

  jsonText = jsonText
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, "");

  console.log(
    "JSON LENGTH:",
    jsonText.length
  );

  const customers =
    JSON.parse(jsonText);

  return customers;
}