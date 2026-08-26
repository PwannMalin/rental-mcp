import { CosmosClient } from "@azure/cosmos";

let container = null;

export function getChatsContainer() {
  if (container) return container;

  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;

  if (!endpoint || !key) {
    throw new Error("COSMOS_ENDPOINT or COSMOS_KEY is missing");
  }

  const client = new CosmosClient({ endpoint, key });
  const database = client.database("rental");
  container = database.container("chats");

  return container;
}