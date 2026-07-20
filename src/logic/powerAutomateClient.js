import axios from "axios";

export async function callPowerAutomate({
    url,
    payload,
    flowName = "Power Automate Flow"
}) {
    if (!url) {
        throw new Error(`${flowName} URL is not configured.`);
    }

    try {

        console.log(`Calling flow: ${flowName}`);
        console.log("Payload:");
        console.log(JSON.stringify(payload, null, 2));

        const response = await axios.post(
            url,
            payload,
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        console.log(`${flowName} succeeded`);
        console.log(response.data);
console.log("ACTUAL RESPONSE:");
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