import "dotenv/config";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { captureSanitizedError, initializeSentry } from "./observability/sentry";
import { JobRunnerService } from "./jobs/job-runner.service";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  initializeSentry(app.get(ConfigService));
  const runner = app.get(JobRunnerService);
  let running = true;
  const stop = () => {
    running = false;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    while (running) {
      const result = await runner.runOnce(10);
      if (result.claimed === 0) {
        await delay(1_000);
        continue;
      }
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  captureSanitizedError("Background worker failed");
  console.error(error instanceof Error ? error.message : "Background worker failed.");
  process.exitCode = 1;
});
