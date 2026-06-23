import { getAccessToken } from "./auth.js";

const BASE_URL =
  "https://api.laserfiche.com/repository/v2";


export async function lfRequest(
  path,
  options = {}
) {
  const token = await getAccessToken();

  const response = await fetch(
    `${BASE_URL}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(options.headers || {})
      }
    }
  );
console.log("REQUEST URL:", `${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(
      `${response.status}: ${await response.text()}`
    );
  }

  return response.json();
}