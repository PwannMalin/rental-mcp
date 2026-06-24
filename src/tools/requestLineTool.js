import { callPowerAutomate } from "../logic/powerAutomateClient.js";

const VALID_COMMANDS = ["GET", "UPDATE", "DELETE", "CREATE"];

function normalizeCommand(command) {
    return String(command || "").trim().toUpperCase();
}

async function executeSingleLine({ Command, rowID = "", rowInfo = {} }) {
    const payload = {
        Command,
        rowID,
        rowInfo
    };

    return await callPowerAutomate({
        url: process.env.PA_UPDATE_CREATE_GET_REQUEST_LINE_URL,
        payload,
        flowName: "Get Update Create Rental Request Line"
    });
}

export function requestLineTool(context = {}) {
    return {
        name: "requestLine.execute",
        description:
            "Gets, creates, updates, or deletes rental request line records for each requested rental equipment type using Power Automate.",
        tags: [
            "request line",
            "line",
            "equipment",
            "rental equipment",
            "create",
            "update",
            "delete",
            "get",
            "power automate"
        ],
        aliases: [
            "create request line",
            "update request line",
            "delete request line",
            "get request line",
            "create equipment line",
            "create rental equipment line"
        ],
        examples: [
            "create request line for forklift",
            "create request lines for 2 forklifts and 1 pallet jack",
            "update request line 123",
            "delete request line 123"
        ],

        async handler(input = {}) {
            const Command = normalizeCommand(input.Command || input.command);

            if (!VALID_COMMANDS.includes(Command)) {
                throw new Error(
                    `Invalid request line command. Expected one of: ${VALID_COMMANDS.join(", ")}`
                );
            }

            // Batch create/update support
            const lines = input.lines || input.requestLines || input.equipmentLines;

            if (Array.isArray(lines) && lines.length > 0) {
                const results = [];

                for (const line of lines) {
                    const lineResult = await executeSingleLine({
                        Command,
                        rowID: line.rowID || line.rowId || "",
                        rowInfo: line.rowInfo || line.data || line
                    });
                   

                    results.push({
                        input: line,
                        result: lineResult
                    });
                }

                return {
                    requestType: "line",
                    command: Command,
                    count: results.length,
                    results,
                    confidence: 0.98
                };
            }

            const rowID = input.rowID || input.rowId || "";
            const rowInfo = input.rowInfo || input.data || {};

            if ((Command === "GET" || Command === "UPDATE" || Command === "DELETE") && !rowID) {
                throw new Error(`${Command} requires rowID for request line.`);
            }

            const result = await executeSingleLine({
                Command,
                rowID,
                rowInfo
            });

            return {
                requestType: "line",
                command: Command,
                payload: {
                    Command,
                    rowID,
                    rowInfo
                },
                result,
                confidence: 0.98
            };
        }
    };
}