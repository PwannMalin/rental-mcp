export function createTeamsUI(context) {
    return {
        typing: async () => {
            try {
                await context.sendActivity({ type: "typing" });
            } catch (e) {}
        },

        update: async (text) => {
            try {
                await context.sendActivity(text);
            } catch (e) {
                console.warn("Update failed");
            }
        },

        sendFinal: async (text) => {
            try {
                await context.sendActivity(text);
            } catch (e) {
                console.warn("sendFinal failed");
                // Ultimate fallback
                if (context.sendActivity) {
                    await context.sendActivity(text);
                }
            }
        }
    };
}