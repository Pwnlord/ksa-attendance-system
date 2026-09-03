import type { ConfigService } from "@nestjs/config";
import { EmailMessage, EmailProvider } from "./email-provider.port";

export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly config: ConfigService) {}

  async send(message: EmailMessage): Promise<void> {
    const apiKey = this.config.getOrThrow<string>("app.resend.apiKey");
    const from = this.config.getOrThrow<string>("app.resend.fromEmail");

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
      if (!response.ok) throw new Error("The email provider rejected the message.");
    } catch {
      // Keep provider responses and request data out of durable job errors/logs.
      throw new Error("Transactional email delivery failed.");
    }
  }
}
