require("dotenv").config();
const axios = require("axios");

async function main() {
  try {

    // ====================================
    // GET ACCESS TOKEN
    // ====================================

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

    const accessToken = tokenResponse.data.access_token;

    console.log("TOKEN RECEIVED");

    // ====================================
    // GET REPOSITORY
    // ====================================

    const repoResponse = await axios.get(
      "https://api.laserfiche.com/repository/v1/Repositories",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const repoId = repoResponse.data[0].repoId;

    console.log("Repository:", repoId);

   

   // ====================================
// GET ALL FIELD DEFINITIONS
// ====================================

const metadata = await fetch(
  "https://api.laserfiche.com/repository/v2/$metadata",
  {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  }
).then(r => r.text());
const idx = metadata.indexOf("ElectronicDocument");
console.log(metadata.substring(idx - 1000, idx + 5000));
  } catch (err) {

  console.log("FAILED");

  if (err.response) {

    console.log("URL:");
    console.log(err.config?.url);

    console.log("METHOD:");
    console.log(err.config?.method);

    console.log("Status:");
    console.log(err.response.status);

    console.log("BODY:");
    console.log(JSON.stringify(err.response.data, null, 2));

  } else {

    console.log(err.message);

  }

}}

main();