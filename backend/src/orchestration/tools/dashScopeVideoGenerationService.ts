import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { AgentConfigInput } from "../../services/agentConfigService.js";
import { workflowCacheService } from "../../services/workflowCacheService.js";

const DEFAULT_VIDEO_SIZE = "720*1280";
const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 40;
const TASK_TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
  "UNKNOWN",
]);

// DashScope only allows one active video task per API key.
// If a previous task is still running (e.g. orphaned from a failed parallel run),
// the API returns "A workflow is already running". We retry with backoff to wait it out.
const SUBMIT_RETRY_ATTEMPTS = 8;
const SUBMIT_RETRY_DELAY_MS = 30_000;

const createTaskResponseSchema = z.object({
  request_id: z.string().optional(),
  code: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  output: z
    .object({
      task_id: z.string().min(1),
      task_status: z.string().min(1),
      video_url: z.string().optional().default(""),
      code: z.string().nullable().optional(),
      message: z.string().nullable().optional(),
    })
    .optional(),
});

const taskStatusResponseSchema = z.object({
  request_id: z.string().optional(),
  code: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  output: z
    .object({
      task_id: z.string().min(1),
      task_status: z.string().min(1),
      video_url: z.string().optional().default(""),
      submit_time: z.string().optional(),
      scheduled_time: z.string().optional(),
      end_time: z.string().optional(),
      orig_prompt: z.string().optional(),
      code: z.string().nullable().optional(),
      message: z.string().nullable().optional(),
    })
    .optional(),
});

type CreateTaskResponse = z.infer<typeof createTaskResponseSchema>;
type TaskStatusResponse = z.infer<typeof taskStatusResponseSchema>;

export type GeneratedVideoArtifact = {
  taskId: string;
  status: "SUCCEEDED";
  videoUrl: string;
  localPath: string;
};

type GenerateVideoClipInput = {
  config: AgentConfigInput;
  prompt: string;
  durationSec: number;
  outputDir: string;
  fileNameStem: string;
  signal?: AbortSignal;
};

/** Reads ?prompt_extend=false from the apiUrl; defaults to true. */
function parsePromptExtend(apiUrl: string): boolean {
  try {
    const url = new URL(apiUrl);
    const param = url.searchParams.get("prompt_extend");
    if (param === null) return true;
    return param.toLowerCase() !== "false" && param !== "0";
  } catch {
    return true;
  }
}

export class DashScopeVideoGenerationService {
  async createOutputDirectory(): Promise<string> {
    await workflowCacheService.init();
    return workflowCacheService.getTempDir();
  }

  async testConnection(
    config: AgentConfigInput,
  ): Promise<{ taskId: string; videoUrl: string }> {
    const apiBase = normalizeDashScopeApiBase(config.apiUrl);
    const taskId = await this.submitTask({
      apiBase,
      apiKey: config.apiKey,
      modelName: config.modelName,
      prompt: "A simple two-second cinematic camera move over a calm neutral scene.",
      durationSec: 2,
      promptExtend: true,
    });

    // DashScope accepts task submissions even for overdue/blocked accounts —
    // billing rejection only surfaces when the task is actually executed.
    // Fully wait for SUCCEEDED or FAILED so "prompt check ok" is definitive.
    const status = await this.waitForTask({ apiBase, apiKey: config.apiKey, taskId });
    const videoUrl = status.output?.video_url?.trim() ?? "";

    return { taskId, videoUrl };
  }

  async generateVideoClip(
    input: GenerateVideoClipInput,
  ): Promise<GeneratedVideoArtifact> {
    const durationSec = validateDuration(input.durationSec);
    const apiBase = normalizeDashScopeApiBase(input.config.apiUrl);
    const promptExtend = parsePromptExtend(input.config.apiUrl);
    const taskId = await this.submitTask({
      apiBase,
      apiKey: input.config.apiKey,
      modelName: input.config.modelName,
      prompt: input.prompt,
      durationSec,
      promptExtend,
      ...(input.signal ? { signal: input.signal } : {}),
    });

    const status = await this.waitForTask({
      apiBase,
      apiKey: input.config.apiKey,
      taskId,
      ...(input.signal ? { signal: input.signal } : {}),
    });

    const videoUrl = status.output?.video_url?.trim();
    if (!videoUrl) {
      throw new Error(`Video task "${taskId}" completed without a video URL`);
    }

    const localPath = path.join(input.outputDir, `${input.fileNameStem}.mp4`);
    await this.downloadVideo(videoUrl, localPath, input.signal);

    return {
      taskId,
      status: "SUCCEEDED",
      videoUrl,
      localPath,
    };
  }

  private async submitTask({
    apiBase,
    apiKey,
    modelName,
    prompt,
    durationSec,
    promptExtend,
    signal,
  }: {
    apiBase: string;
    apiKey: string;
    modelName: string;
    prompt: string;
    durationSec: number;
    promptExtend: boolean;
    signal?: AbortSignal;
  }): Promise<string> {
    for (let attempt = 0; attempt < SUBMIT_RETRY_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await sleep(SUBMIT_RETRY_DELAY_MS, signal);
      }

      const response = await fetch(
        `${apiBase}/services/aigc/video-generation/video-synthesis`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-DashScope-Async": "enable",
          },
          ...(signal ? { signal } : {}),
          body: JSON.stringify({
            model: modelName,
            input: {
              prompt,
            },
            parameters: {
              size: DEFAULT_VIDEO_SIZE,
              prompt_extend: promptExtend,
              duration: durationSec,
            },
          }),
        },
      );

      const payload = createTaskResponseSchema.parse(await response.json());

      if (!response.ok || !payload.output?.task_id) {
        const message =
          payload.message ??
          payload.code ??
          "Failed to create video generation task";
        const isAlreadyRunning = message
          .toLowerCase()
          .includes("already running");
        if (isAlreadyRunning && attempt < SUBMIT_RETRY_ATTEMPTS - 1) {
          // A previous task is still active on DashScope. Wait and retry.
          continue;
        }
        throw new Error(`[DashScope ${modelName}] ${message}`);
      }

      return payload.output.task_id;
    }

    throw new Error(
      `[DashScope ${modelName}] Failed to create video generation task: Dashboard still busy after all retry attempts`
    );
  }

  private async waitForTask({
    apiBase,
    apiKey,
    taskId,
    signal,
  }: {
    apiBase: string;
    apiKey: string;
    taskId: string;
    signal?: AbortSignal;
  }): Promise<TaskStatusResponse> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await sleep(POLL_INTERVAL_MS, signal);
      }

      const response = await fetch(`${apiBase}/tasks/${taskId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        ...(signal ? { signal } : {}),
      });

      const payload = taskStatusResponseSchema.parse(await response.json());
      if (!response.ok) {
        throw new Error(
          payload.message ?? payload.code ?? `Failed to fetch task "${taskId}"`,
        );
      }

      const taskStatus = payload.output?.task_status?.trim();
      if (!taskStatus) {
        throw new Error(`Task "${taskId}" returned an empty status`);
      }

      if (!TASK_TERMINAL_STATUSES.has(taskStatus)) {
        continue;
      }

      if (taskStatus !== "SUCCEEDED") {
        const errorCode = payload.code ?? payload.output?.code;
        const errorMessage = payload.message ?? payload.output?.message;
        const detail = [errorCode, errorMessage].filter(Boolean).join(": ");

        throw new Error(
          `[DashScope] Video task "${taskId}" failed with status "${taskStatus}"${detail ? `. Details: ${detail}` : ""}`,
        );
      }

      return payload;
    }

    throw new Error(
      `Video task "${taskId}" timed out while waiting for completion`,
    );
  }

  private async downloadVideo(
    videoUrl: string,
    localPath: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(videoUrl, signal ? { signal } : undefined);
    if (!response.ok) {
      throw new Error(`Failed to download generated video from "${videoUrl}"`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(localPath, buffer);
  }
}

function normalizeDashScopeApiBase(apiUrl: string): string {
  const url = new URL(apiUrl);
  const normalizedPath = url.pathname.replace(/\/$/, "");

  if (normalizedPath.endsWith("/api/v1")) {
    return `${url.origin}/api/v1`;
  }

  if (
    normalizedPath.endsWith(
      "/api/v1/services/aigc/video-generation/video-synthesis",
    )
  ) {
    return `${url.origin}/api/v1`;
  }

  if (normalizedPath.endsWith("/compatible-mode/v1/chat/completions")) {
    return `${url.origin}/api/v1`;
  }

  if (normalizedPath.endsWith("/compatible-mode/v1")) {
    return `${url.origin}/api/v1`;
  }

  if (normalizedPath.endsWith("/v1/chat/completions")) {
    return `${url.origin}/api/v1`;
  }

  if (normalizedPath === "" || normalizedPath === "/") {
    return `${url.origin}/api/v1`;
  }

  throw new Error(`Unsupported video-generation API URL: "${apiUrl}"`);
}

function validateDuration(durationSec: number): number {
  // Convert to integer, rounding to nearest whole number
  const intDuration = Math.round(durationSec);
  
  // Check if the result is a valid integer (handles NaN, Infinity)
  if (!Number.isInteger(intDuration) || !Number.isFinite(durationSec)) {
    throw new Error(
      "Video segment duration must be an integer for the video generation API",
    );
  }

  if (intDuration < 2 || intDuration > 15) {
    throw new Error("Video segment duration must be between 2 and 15 seconds");
  }

  return intDuration;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error("Request aborted"),
      );
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    function handleAbort() {
      clearTimeout(timeout);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Request aborted"),
      );
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
