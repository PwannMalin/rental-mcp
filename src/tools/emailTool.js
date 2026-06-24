import { callPowerAutomate } from "../logic/powerAutomateClient.js";

export function emailTool(context = {}) {
    return {
        name: "email.send",
        description:
            "Sends an email using Power Automate with recipient, subject, body, and optional attachments.",
        tags: [
            "email",
            "mail",
            "send",
            "recipient",
            "subject",
            "attachment",
            "power automate"
        ],
        aliases: [
            "send email",
            "send mail",
            "email customer",
            "email quote",
            "send quote email"
        ],
        examples: [
            "send quote email to Sarah",
            "email the rental quote to the customer",
            "send approval email"
        ],

        async handler(input = {}) {
            const recipient =
                input.Recipient ||
                input.recipient ||
                (Array.isArray(input.to) ? input.to.join(";") : input.to) ||
                "";

            const payload = {
                Recipient: recipient,
                Subject: input.Subject || input.subject || "",
                textBody: input.textBody || input.body || input.Body || "",
                Attachment: input.Attachment || input.attachments || []
            };

            if (!payload.Recipient) {
                throw new Error("Email Recipient is required.");
            }

            if (!payload.Subject) {
                throw new Error("Email Subject is required.");
            }

            const result = await callPowerAutomate({
                url: process.env.PA_UPDATE_EMAIL_URL,
                payload,
                flowName: "Send Mail"
            });

            return {
                command: "SEND_EMAIL",
                payload,
                result,
                confidence: 0.98
            };
        }
    };
}