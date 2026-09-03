import { ConfigService } from "@nestjs/config";
import { AppError } from "../common/errors/app-error";
import { JobRunnerService } from "./job-runner.service";
import { JobsController } from "./jobs.controller";

describe("JobsController", () => {
  it("requires the configured secret for the zero-cost runner endpoint", async () => {
    const runner = {
      runOnce: jest.fn().mockResolvedValue({ claimed: 1, succeeded: 1, failed: 0 }),
    };
    const config = new ConfigService({
      app: { jobRunnerMode: "endpoint", jobRunnerSecret: "s".repeat(32) },
    });
    const audit = { record: jest.fn() };
    const controller = new JobsController(
      runner as unknown as JobRunnerService,
      config,
      audit as never,
    );

    await expect(controller.runInternal("wrong-secret")).rejects.toBeInstanceOf(AppError);
    await expect(controller.runInternal("s".repeat(32))).resolves.toEqual({
      data: { claimed: 1, succeeded: 1, failed: 0 },
    });
    expect(runner.runOnce).toHaveBeenCalledTimes(1);
  });

  it("hides the endpoint when the standalone worker profile is active", async () => {
    const runner = { runOnce: jest.fn() };
    const config = new ConfigService({ app: { jobRunnerMode: "worker" } });
    const audit = { record: jest.fn() };
    const controller = new JobsController(
      runner as unknown as JobRunnerService,
      config,
      audit as never,
    );

    await expect(controller.runInternal("s".repeat(32))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(runner.runOnce).not.toHaveBeenCalled();
  });
});
