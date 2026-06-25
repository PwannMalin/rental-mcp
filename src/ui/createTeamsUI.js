export function createTeamsUI(context) {
    let messageId = null;

    return {
        typing: async () => {
            try {
                await context.sendActivity({ type: "typing" });
            } catch (e) {
                console.warn("Typing failed (normal in some test environments)");
            }
        },

        update: async (text) => {
            try {
                if (!messageId) {
                    const response = await context.sendActivity(text);
                    messageId = response.id;
                } else {
                    await context.updateActivity({
                        id: messageId,
                        type: "message",
                        text: text
                    });
                }
            } catch (err) {
                console.error("Update failed:", err.message);
                // Fallback
                await context.sendActivity(text);
            }
        },

        sendFinal: async (text) => {
            try {
                if (!messageId) {
                    await context.sendActivity(text);
                } else {
                    await context.updateActivity({
                        id: messageId,
                        type: "message",
                        text: text
                    });
                }
            } catch (err) {
                console.error("sendFinal failed:", err.message);
                await context.sendActivity(text); // fallback
            }
        }
    };
}