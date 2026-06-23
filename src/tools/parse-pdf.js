import fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export async function parsePdf(
  filePath
) {

  const data =
    new Uint8Array(
      fs.readFileSync(filePath)
    );

  const pdf =
    await pdfjsLib.getDocument({
      data
    }).promise;

  let text = "";

  for (
    let i = 1;
    i <= pdf.numPages;
    i++
  ) {

    const page =
      await pdf.getPage(i);

    const content =
      await page.getTextContent();

    text += content.items
      .map(i => i.str)
      .join(" ");

    text += "\n";
  }

  return text;
}