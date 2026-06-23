import { extractRental } from "./tools/extract-rental.js";

const result = await extractRental("rental.pdf");

console.log(
  JSON.stringify(result[0], null, 2)
);