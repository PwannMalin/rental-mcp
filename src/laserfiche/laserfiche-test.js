import dotenv from "dotenv";
import { createFolder } from "./folders.js";

dotenv.config();

async function main() {

  try {

    const result =
      await createFolder(
        process.env.REPOSITORY_ID,
        67,
        "Test MCP Folder"
      );

    console.log(
      "Folder Created Successfully"
    );

    console.log(result);

  } catch (err) {

    console.log("FAILED");

    console.log(err.message);

  }

}

main();