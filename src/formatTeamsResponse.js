export function formatTeamsResponse(result) {

    if (!result.success) {
        return {
            type: "message",
            text: "❌ I couldn't complete that request."
        };
    }

    // If tool-heavy response → use structured card
    return {
        type: "message",
        attachments: [
            {
                contentType: "application/vnd.microsoft.card.adaptive",
                content: buildAdaptiveCard(result)
            }
        ]
    };
}

function buildAdaptiveCard(result) {
    return {
        type: "AdaptiveCard",
        version: "1.5",
        body: [
            {
                type: "TextBlock",
                size: "Large",
                weight: "Bolder",
                text: "Copilot Result"
            },
            {
                type: "TextBlock",
                wrap: true,
                text: result.answer
            }
        ],
        actions: [
            {
                type: "Action.Submit",
                title: "Run Again",
                data: { retry: true }
            }
        ]
    };
}