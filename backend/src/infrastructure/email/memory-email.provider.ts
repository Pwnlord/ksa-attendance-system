import { Injectable } from "@nestjs/common";
import { EmailMessage, EmailProvider } from "./email-provider.port";

@Injectable()
export class MemoryEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}
