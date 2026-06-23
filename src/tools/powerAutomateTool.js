export function powerAutomateTool(context = {}) {
    return {
        name: "powerAutomate.runFlow",
        description:
            "Execute Power Automate flows for approvals, quote creation, Laserfiche workflow submission, notifications, and business process automation.",
        tags: [
            "flow",
            "automation",
            "power automate",
            "workflow",
            "approval",
            "laserfiche",
            "submit",
            "quote",
            "rental quote",
            "notification"
        ],
        aliases: [
            "run flow",
            "start flow",
            "trigger flow",
            "start workflow",
            "submit to laserfiche",
            "send approval",
            "start quote approval",
            "submit rental quote",
            "create quote workflow",
            "run rental quote workflow"
        ],
        examples: [
            "submit this quote to Laserfiche",
            "start the approval workflow",
            "run the rental quote flow",
            "send quote for approval",
            "create a rental quote workflow",
            "trigger Power Automate for this rental"
        ],

        async handler(input = {}) {
            const payload = {
                query: input.query || "",
                action: input.action || "run-flow",
                rentalData: input.rentalData || null,
                previousResult: input.previousResult || null
            };

            let result;

            if (context.powerAutomate?.runFlow) {
                result = await context.powerAutomate.runFlow(payload);
            } else if (context.azure?.runFlow) {
                // Backward compatible with your current code
                result = await context.azure.runFlow(payload);
            } else {
                throw new Error("Power Automate flow handler is not configured.");
            }

            return {
                result,
                payload,
                confidence: 0.95
            };
        }
    };
}