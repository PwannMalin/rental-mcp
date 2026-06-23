// src/powerautomate/client.js

import axios from "axios";

export async function callFlow(url, payload) {

  const response = await axios.post(
    url,
    payload,
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;
}