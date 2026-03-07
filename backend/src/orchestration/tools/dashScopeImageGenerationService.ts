import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import type { AgentConfigInput } from "../../services/agentConfigService.js";
import { workflowCacheService } from "../../services/workflowCacheService.js";

const DEFAULT_IMAGE_SIZE = "720*1280";
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 30;
const TASK_TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"]);

const createTaskResponseSchema = z.object({
  request_id: z.string().optional(),
  code: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  output: z
    .object({
      task_id: z.string().min(1),
      task_status: z.string().min(1),
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
      result_url: z.string().optional(),
      image_url: z.string().optional(),
      results: z
        .array(
          z.object({
            url: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

type TaskStatusResponse = z.infer<typeof taskStatusResponseSchema>;

export type GeneratedImageArtifact = {
  taskId: string;
  status: "SUCCEEDED";
  imageUrl: string;
  localPath: string;
};

type GenerateThumbnailInput = {
  config: AgentConfigInput;
  prompt: string;
  outputDir: string;
  fileNameStem: string;
  signal?: AbortSignal;
};

export class DashScopeImageGenerationService {
  async createOutputDirectory(): Promise<string> {
    await workflowCacheService.init();
    return workflowCacheService.getTempDir();
  }

  async testConnection(config: AgentConfigInput): Promise<{ taskId: string }> {
    const apiBase = normalizeDashScopeApiBase(config.apiUrl);
    const taskId = await this.submitTask({
      apiBase,
      apiKey: config.apiKey,
      modelName: config.modelName,
      prompt: "A clean high-contrast YouTube thumbnail with bold subject focus.",
    });

    return { taskId };
  }

  async generateThumbnail(input: GenerateThumbnailInput): Promise<GeneratedImageArtifact> {
    const apiBase = normalizeDashScopeApiBase(input.config.apiUrl);
    const taskId = await this.submitTask({
      apiBase,
      apiKey: input.config.apiKey,
      modelName: input.config.modelName,
      prompt: input.prompt,
      ...(input.signal ? { signal: input.signal } : {}),
    });

    const status = await this.waitForTask({
      apiBase,
      apiKey: input.config.apiKey,
      taskId,
      ...(input.signal ? { signal: input.signal } : {}),
    });

    const imageUrl = pickImageUrl(status);
    if (!imageUrl) {
      throw new Error(`Thumbnail task "${taskId}" completed without an image URL`);
    }

    const localPath = path.join(input.outputDir, `${input.fileNameStem}.png`);
    await this.downloadImage(imageUrl, localPath, input.signal);

    return {
      taskId,
      status: "SUCCEEDED",
      imageUrl,
      localPath,
    };
  }

  private async submitTask({
    apiBase,
    apiKey,
    modelName,
    prompt,
    signal,
  }: {
    apiBase: string;
    apiKey: string;
    modelName: string;
    prompt: string;
    signal?: AbortSignal;
  }): Promise<string> {
    const response = await fetch(`${apiBase}/services/aigc/text2image/image-synthesis`, {
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
          size: DEFAULT_IMAGE_SIZE,
        },
      }),
    });

    const payload = createTaskResponseSchema.parse(await response.json());
    if (!response.ok || !payload.output?.task_id) {
      throw new Error(payload.message ?? payload.code ?? "Failed to create thumbnail task");
    }

    return payload.output.task_id;
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
        throw new Error(payload.message ?? payload.code ?? `Failed to fetch task "${taskId}"`);
      }

      const taskStatus = payload.output?.task_status?.trim();
      if (!taskStatus) {
        throw new Error(`Task "${taskId}" returned an empty status`);
      }

      if (!TASK_TERMINAL_STATUSES.has(taskStatus)) {
        continue;
      }

      if (taskStatus !== "SUCCEEDED") {
        throw new Error(
          payload.message ?? `Thumbnail task "${taskId}" ended with status "${taskStatus}"`,
        );
      }

      return payload;
    }

    throw new Error(`Thumbnail task "${taskId}" timed out while waiting for completion`);
  }

  private async downloadImage(
    imageUrl: string,
    localPath: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(imageUrl, signal ? { signal } : undefined);
    if (!response.ok) {
      throw new Error(`Failed to download generated thumbnail from "${imageUrl}"`);
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

  if (normalizedPath.endsWith("/services/aigc/text2image/image-synthesis")) {
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

  throw new Error(`Unsupported image-generation API URL: "${apiUrl}"`);
}

function pickImageUrl(payload: TaskStatusResponse): string | undefined {
  return (
    payload.output?.results?.[0]?.url?.trim() ||
    payload.output?.result_url?.trim() ||
    payload.output?.image_url?.trim()
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error("Request aborted"));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    function handleAbort() {
      clearTimeout(timeout);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Request aborted"));
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
