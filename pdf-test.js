// pdf-test.js

import fs from "fs";
import { PDFParse } from "pdf-parse";

const data = fs.readFileSync("./rental.pdf");

const parser = new PDFParse({
  data
});

const result = await parser.getText();

console.log(result.text);