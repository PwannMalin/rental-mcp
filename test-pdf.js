import fs from "fs";
import { PDFParse } from "pdf-parse";

const buffer = fs.readFileSync("./rental.pdf");

console.log("PDF SIZE:", buffer.length);

const parser = new PDFParse({
  data: buffer
});

const result = await parser.getText();

console.log("========== TEXT ==========");
console.log(result.text);

await parser.destroy();