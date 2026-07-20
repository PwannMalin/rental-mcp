import axios from "axios";

export async function callPowerAutomate({
    url,
    payload = {},
    headers = {},
    flowName = "Power Automate Flow"
}) {
    if (!url) {
        throw new Error(`${flowName} URL is not configured.`);
    }

    try {
        console.log(`Calling flow: ${flowName}`);
        console.log("Payload:");
        console.log(JSON.stringify(payload, null, 2));

        console.log("Headers:");
        console.log(JSON.stringify(headers, null, 2));
console.log("FINAL REQUEST HEADERS:");
console.log(JSON.stringify(headers, null, 2));
       const response = await axios.get(
    url,
    {
        headers,
        params: payload
    }
);

console.log("METHOD: GET");
console.log("URL:", url);
console.log("HEADERS:", headers);
console.log("PARAMS:", payload);

        console.log(`${flowName} succeeded`);
        console.log(JSON.stringify(response.data, null, 2));

        return {
            flowName,
            status: response.status,
            data: response.data
        };

    } catch (err) {
        console.error("FLOW ERROR");
        console.error("Flow:", flowName);
        console.error("Status:", err.response?.status);

        console.error("Response:");
        console.error(
            JSON.stringify(
                err.response?.data,
                null,
                2
            )
        );

        throw err;
    }
}