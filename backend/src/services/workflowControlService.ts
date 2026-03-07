import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import { ConflictError, WorkflowTerminatedError } from "../orchestration/errors.js";

type ActiveWorkflowRun = {
  runId: string;
  controller: AbortController;
  tempDirs: Set<string>;
};

export type WorkflowRunContext = {
  runId: string;
  signal: AbortSignal;
};

export type TerminateWorkflowResult = {
  terminated: boolean;
  cleanedTempDirs: number;
};

export class WorkflowControlService {
  private activeRun: ActiveWorkflowRun | null = null;

  startRun(): WorkflowRunContext {
    if (this.activeRun) {
      throw new ConflictError("A workflow is already running");
    }

    const controller = new AbortController();
    const runId = randomUUID();
    this.activeRun = {
      runId,
      controller,
      tempDirs: new Set<string>(),
    };

    return {
      runId,
      signal: controller.signal,
    };
  }

  getActiveSignal(): AbortSignal | undefined {
    return this.activeRun?.controller.signal;
  }

  ensureNotTerminated(): void {
    if (this.activeRun?.controller.signal.aborted) {
      throw new WorkflowTerminatedError();
    }
  }

  registerTempDir(tempDir: string): void {
    const normalizedTempDir = tempDir.trim();
    if (!normalizedTempDir || !this.activeRun) {
      return;
    }

    this.activeRun.tempDirs.add(normalizedTempDir);
  }

  async terminateCurrentRun(): Promise<TerminateWorkflowResult> {
    if (!this.activeRun) {
      return {
        terminated: false,
        cleanedTempDirs: 0,
      };
    }

    this.activeRun.controller.abort();
    const cleanedTempDirs = await this.cleanupTempDirs(this.activeRun.tempDirs);
    return {
      terminated: true,
      cleanedTempDirs,
    };
  }

  async finishRun(runId: string): Promise<void> {
    if (!this.activeRun || this.activeRun.runId !== runId) {
      return;
    }

    // Removed to allow caching on errors: await this.cleanupTempDirs(this.activeRun.tempDirs);
    this.activeRun = null;
  }

  private async cleanupTempDirs(tempDirs: Set<string>): Promise<number> {
    const directories = Array.from(tempDirs);
    if (directories.length === 0) {
      return 0;
    }

    await Promise.all(
      directories.map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );

    return directories.length;
  }
}

export const workflowControlService = new WorkflowControlService();
