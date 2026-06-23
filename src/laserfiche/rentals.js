import { getChildren } from "./entries.js";

const RENTAL_FOLDER_ID = 67;

export async function listRentalRequests(
  repositoryId
) {
  const result =
    await getChildren(
      repositoryId,
      RENTAL_FOLDER_ID
    );

  return result.value.map(r => ({
    id: r.id,
    name: r.name,
    created: r.creationTime
  }));
}