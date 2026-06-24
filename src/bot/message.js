import { createTeamsUI } from "../ui/createTeamsUI.js";

export function registerMessageHandler({ adapter, copilot }) {

    return async function messageHandler(req, res) {

        await adapter.processActivity(req, res, async (context) => {

            if (context.activity.type !== "message") return;

            const ui = createTeamsUI(context);

            const userMessage = context.activity.text;

            const result = await copilot.runStreaming(
                userMessage,
                {
                    userId: context.activity.from.id,
                    tenantId: context.activity.conversation.tenantId
                },
                ui
            );

            await ui.sendFinal(result.answer || "Done.");
        });
    };
}