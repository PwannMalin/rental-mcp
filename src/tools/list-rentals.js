import { lfRequest } from "../laserfiche/client.js";

export async function listRentals() {

  const repositoryId =
    process.env.REPOSITORY_ID;

  console.log(
    "REPOSITORY_ID:",
    repositoryId
  );

  const result =
    await lfRequest(
      `/Repositories/${repositoryId}/Entries/67/Folder/Children`
    );

  return result.value;
}