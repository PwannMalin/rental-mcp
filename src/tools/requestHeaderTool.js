import { callPowerAutomate } from "../logic/powerAutomateClient.js";

const VALID_COMMANDS = ["GET", "UPDATE", "CREATE"];

function normalizeCommand(command) {
    return String(command || "").trim().toUpperCase();
}

export function requestHeaderTool(context = {}) {
    return {
        name: "requestHeader.execute",
        description:
            "Gets, creates, or updates a rental request header record using Power Automate.",
        tags: [
            "request",
            "request header",
            "header",
            "rental request",
            "create",
            "update",
            "get",
            "power automate"
        ],
        aliases: [
            "create request header",
            "update request header",
            "get request header",
            "create rental request",
            "update rental request"
        ],
        examples: [
            "create request header for ABC Construction",
            "update request header status to quoted",
            "get request header 123"
        ],

        async handler(input = {}) {
            const Command = normalizeCommand(input.Command || input.command);

            if (!VALID_COMMANDS.includes(Command)) {
                throw new Error(
                    `Invalid request header command. Expected one of: ${VALID_COMMANDS.join(", ")}`
                );
            }

            const payload = {
                Command,
                rowID: input.rowID || input.rowId || "",
                rowInfo: input.rowInfo || input.data || {}
            };

            if ((Command === "GET" || Command === "UPDATE") && !payload.rowID) {
                throw new Error(`${Command} requires rowID for request header.`);
            }

            if ((Command === "CREATE" || Command === "UPDATE") && !payload.rowInfo) {
                throw new Error(`${Command} requires rowInfo for request header.`);
            }

            const result = await callPowerAutomate({
                url: process.env.PA_UPDATE_CREATE_GET_REQUEST_URL,
                payload,
                flowName: "Get Update Create Rental Request"
            });

            return {
                requestType: "header",
                command: Command,
                payload,
                result,
                confidence: 0.98
            };
        }
    };
}