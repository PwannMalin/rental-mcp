import { callPowerAutomate } from "../logic/powerAutomateClient.js";

export function userLookupTool(context = {}) {
    return {
        name: "user.lookup",
        description:
            "Finds a user by name or search term using the user directory Power Automate flow.",
        tags: [
            "user",
            "directory",
            "lookup",
            "find user",
            "recipient",
            "email address"
        ],
        aliases: [
            "find user",
            "lookup user",
            "search user",
            "find recipient",
            "get email address"
        ],
        examples: [
            "find user Sarah Smith",
            "lookup email for Emma Riley",
            "find recipient named Mike"
        ],

        async handler(input = {}) {
            const SearchTerm =
                input.SearchTerm ||
                input.searchTerm ||
                input.name ||
                input.query ||
                "";

            if (!SearchTerm) {
                throw new Error("SearchTerm is required for user lookup.");
            }

            const payload = {
                SearchTerm
            };

            const result = await callPowerAutomate({
                url: process.env.PA_UPDATE_USER_URL,
                payload,
                flowName: "FindUser"
            });

            return {
                searchTerm: SearchTerm,
                payload,
                result,
                confidence: 0.95
            };
        }
    };
}