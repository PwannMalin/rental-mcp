export function createTeamsUI(context) {

    let messageId = null;

    return {
        typing: async () => {
            await context.sendActivity({ type: "typing" });
        },

        update: async (text) => {

            if (!messageId) {
                const msg = await context.sendActivity(text);
                messageId = msg.id;
                return;
            }

            await context.updateActivity({
                id: messageId,
                type: "message",
                text
            });
        },

        sendFinal: async (text) => {
            if (!messageId) {
                await context.sendActivity(text);
            } else {
                await context.updateActivity({
                    id: messageId,
                    type: "message",
                    text
                });
            }
        }
    };
}