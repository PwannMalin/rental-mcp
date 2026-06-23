import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

export async function getAccessToken() {
console.log("=== AUTH FUNCTION CALLED ===");

  try {
    console.log("PWD:", process.cwd());
console.log("LF_AUTH_KEY EXISTS:", !!process.env.LF_AUTH_KEY);
console.log("LF_AUTH_KEY LENGTH:", process.env.LF_AUTH_KEY?.length);
    const tokenResponse = await axios.post(
      "https://signin.laserfiche.com/oauth/token",
      "grant_type=client_credentials&scope=repository.Read repository.Write table.Read table.Write project/Global project/Rental+Request+Solution",
      {
        headers: {
          Authorization: `Bearer ${process.env.LF_AUTH_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    return tokenResponse.data.access_token;

  } catch (error) {

    console.log("TOKEN RESPONSE:");
    console.log(error.response?.status);
    console.log(error.response?.data);

    throw new Error(
      `Token request failed: ${error.response?.status}`
    );
  }
}