import { CosmosClient } from "@azure/cosmos";

let chatsContainer = null;
let critiquesContainer = null;

function getClient() {
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;

  if (!endpoint || !key) {
    throw new Error("COSMOS_ENDPOINT or COSMOS_KEY is missing");
  }

  return new CosmosClient({ endpoint, key });
}

export function getChatsContainer() {
  if (chatsContainer) return chatsContainer;
  chatsContainer = getClient().database("rental").container("chats");
  return chatsContainer;
}

export function getCritiquesContainer() {
  if (critiquesContainer) return critiquesContainer;
  critiquesContainer = getClient().database("rental").container("critiques");
  return critiquesContainer;
}