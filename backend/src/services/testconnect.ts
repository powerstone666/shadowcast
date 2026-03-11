import { z } from "zod";

import { DashScopeImageGenerationService } from "../orchestration/tools/dashScopeImageGenerationService.js";
import { DashScopeVideoGenerationService } from "../orchestration/tools/dashScopeVideoGenerationService.js";
import { AgentRuntime } from "../orchestration/runtime/AgentRuntime.js";
import { getNativeSearchExtraBody } from "../orchestration/runtime/nativeSearchSupport.js";
import type { AgentConfigInput } from "./agentConfigService.js";
import { AgentConfigService } from "./agentConfigService.js";
import { PgDbService } from "./dbService.js";
import { YoutubeOAuthService } from "./ytOAuthService.js";

const REQUIRED_ROLE_KEYS = [
  "selector",
  "script-writer",
  "research-expert",
  "strategy-expert",
  "quality-expert",
  "director",
  "cameraman",
  "video-gen",
] as const;

export type ConnectionTestMode = "api_key" | "real_prompt";
export type ConnectionTestRoleKey = (typeof REQUIRED_ROLE_KEYS)[number];

export class TestConnectService {
  private readonly dbService = new PgDbService();
  private readonly youtubeOAuthService = new YoutubeOAuthService();
  private readonly agentConfigService = new AgentConfigService();
  private readonly agentRuntime = new AgentRuntime(this.agentConfigService);
  private readonly videoGenerationService =
    new DashScopeVideoGenerationService();
  private readonly imageGenerationService =
    new DashScopeImageGenerationService();
  private readonly log: (message: string) => void;
  private isRunning = false;

  constructor(log: (message: string) => void) {
    this.log = log;
  }

  async runAllChecks(
    mode: ConnectionTestMode = "api_key",
    roleKey?: ConnectionTestRoleKey,
  ): Promise<void> {
    if (this.isRunning) {
      this.log("connection test already running");
      return;
    }

    this.isRunning = true;
    this.log(`running connection checks (${formatModeLabel(mode, roleKey)})`);

    try {
      const databaseOk = await this.testDatabaseConnection();
      if (!databaseOk) {
        this.log("skipping secrets check because database is unavailable");
      } else {
        await this.testSecretsConfiguration(mode, roleKey);
      }

      if (!roleKey) {
        await this.testYoutubeConnection();
      }
      this.log("connection checks completed");
    } finally {
      this.isRunning = false;
    }
  }

  private async testDatabaseConnection(): Promise<boolean> {
    try {
      const pool = await this.dbService.getPool();
      await pool.query("SELECT 1");
      this.log("database connection: ok");
      return true;
    } catch (error) {
      this.log(`database connection failed: ${toErrorMessage(error)}`);
      return false;
    }
  }

  private async testSecretsConfiguration(
    mode: ConnectionTestMode,
    roleKey?: ConnectionTestRoleKey,
  ): Promise<void> {
    try {
      const configs = await this.agentConfigService.listConfigs();
      const configuredRoleKeys = new Set(
        configs.map((config) => config.roleKey),
      );
      const missingRoleKeys = REQUIRED_ROLE_KEYS.filter(
        (roleKey) => !configuredRoleKeys.has(roleKey),
      );

      const configuredRequiredCount = REQUIRED_ROLE_KEYS.filter((r) =>
        configuredRoleKeys.has(r),
      ).length;
      this.log(
        `secrets configured: ${configuredRequiredCount}/${REQUIRED_ROLE_KEYS.length}`,
      );

      if (missingRoleKeys.length > 0) {
        this.log(`missing model configs: ${missingRoleKeys.join(", ")}`);
      }

      const roleKeysToCheck = roleKey ? [roleKey] : REQUIRED_ROLE_KEYS;

      for (const nextRoleKey of roleKeysToCheck) {
        if (!configuredRoleKeys.has(nextRoleKey)) {
          this.log(`model config missing: ${nextRoleKey}`);
          continue;
        }

        const config = configs.find((entry) => entry.roleKey === nextRoleKey);
        if (!config) {
          continue;
        }

        await this.testConfiguredRoleConnection(config, mode);
      }
    } catch (error) {
      this.log(`secrets check failed: ${toErrorMessage(error)}`);
    }
  }

  private async testConfiguredRoleConnection(
    config: AgentConfigInput,
    mode: ConnectionTestMode,
  ): Promise<void> {
    if (mode === "real_prompt") {
      await this.testRealModelConnection(config);
      return;
    }

    await this.testChatRoleApiKey(config);
  }

  private async testChatRoleApiKey(config: AgentConfigInput): Promise<void> {
    try {
      const modelsEndpoint = normalizeModelsEndpoint(config.apiUrl);
      const response = await fetch(modelsEndpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      });

      if (!response.ok) {
        const details = await readErrorDetails(response);
        throw new Error(
          details ?? `API key check failed with status ${response.status}`,
        );
      }

      this.log(`api key active: ${config.roleKey}`);
    } catch (error) {
      this.log(`api key failed (${config.roleKey}): ${toErrorMessage(error)}`);
    }
  }

  private async testChatRolePrompt(roleKey: string): Promise<void> {
    try {
      await this.agentRuntime.invokeStructuredJson({
        roleKey,
        systemPrompt:
          'You are a connection test agent. Return exactly this JSON object and nothing else: {"ok": true}.',
        userPrompt: "Run a health check response.",
        schema: connectionTestSchema,
      });

      this.log(`prompt check ok: ${roleKey}`);
    } catch (error) {
      this.log(`prompt check failed (${roleKey}): ${toErrorMessage(error)}`);
    }
  }

  private async testSelectorNativeSearchPrompt(
    nativeSearchExtraBody: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.agentRuntime.invokeStructuredJson({
        roleKey: "selector",
        systemPrompt:
          'Use native web search to answer this health check. Return exactly this JSON object and nothing else: {"ok": true}.',
        userPrompt:
          "Search the web for one current headline and confirm native web search capability.",
        schema: connectionTestSchema,
        extraBody: nativeSearchExtraBody,
      });

      this.log("web search ok: selector");
    } catch (error) {
      this.log(`web search failed (selector): ${toErrorMessage(error)}`);
    }
  }

  private async testRealModelConnection(
    config: AgentConfigInput,
  ): Promise<void> {
    if (config.roleKey === "selector") {
      await this.testChatRolePrompt(config.roleKey);

      const selectorNativeSearchExtraBody = getNativeSearchExtraBody(config);
      if (selectorNativeSearchExtraBody) {
        await this.testSelectorNativeSearchPrompt(
          selectorNativeSearchExtraBody,
        );
      } else {
        this.log(
          "web search skipped: selector (native search not supported by configured model)",
        );
      }

      return;
    }

    if (config.roleKey === "cameraman") {
      await this.testChatRolePrompt(config.roleKey);
      return;
    }

    if (config.roleKey === "video-gen") {
      await this.testVideoGenerationPrompt(config);
      return;
    }

    await this.testChatRolePrompt(config.roleKey);
  }

  private async testVideoGenerationPrompt(
    config: AgentConfigInput,
  ): Promise<void> {
    try {
      this.log(
        `video model checking: ${config.roleKey} (submitting 2-sec test clip, waiting for render…)`,
      );
      const result = await this.videoGenerationService.testConnection(config);
      this.log(`prompt check ok: ${config.roleKey} (task ${result.taskId})`);
      if (result.videoUrl) {
        this.log(`video url: ${result.videoUrl}`);
      }
    } catch (error) {
      this.log(
        `prompt check failed (${config.roleKey}): ${toErrorMessage(error)}`,
      );
    }
  }

  private async testImageGenerationPrompt(
    config: AgentConfigInput,
  ): Promise<void> {
    try {
      const result = await this.imageGenerationService.testConnection(config);
      this.log(`prompt check ok: ${config.roleKey} (task ${result.taskId})`);
    } catch (error) {
      this.log(
        `prompt check failed (${config.roleKey}): ${toErrorMessage(error)}`,
      );
    }
  }

  private async testYoutubeConnection(): Promise<void> {
    try {
      const status = await this.youtubeOAuthService.testConnection();

      if (!status.connected) {
        this.log("youtube oauth: not connected");
        return;
      }

      const channelLabel =
        status.channelTitle ?? status.channelId ?? "connected account";
      this.log(`youtube oauth ok: ${channelLabel}`);
    } catch (error) {
      this.log(`youtube oauth check failed: ${toErrorMessage(error)}`);
    }
  }
}

function normalizeModelsEndpoint(apiUrl: string): string {
  const normalizedUrl = new URL(apiUrl.trim());
  const pathname = normalizedUrl.pathname.replace(/\/$/, "");

  if (pathname.endsWith("/chat/completions")) {
    normalizedUrl.pathname =
      pathname.slice(0, -"/chat/completions".length) + "/models";
    normalizedUrl.search = "";
    normalizedUrl.hash = "";
    return normalizedUrl.toString();
  }

  if (pathname.endsWith("/completions")) {
    normalizedUrl.pathname =
      pathname.slice(0, -"/completions".length) + "/models";
    normalizedUrl.search = "";
    normalizedUrl.hash = "";
    return normalizedUrl.toString();
  }

  if (pathname.endsWith("/images/generations")) {
    normalizedUrl.pathname =
      pathname.slice(0, -"/images/generations".length) + "/models";
    normalizedUrl.search = "";
    normalizedUrl.hash = "";
    return normalizedUrl.toString();
  }

  if (pathname.endsWith("/services/aigc/video-generation/video-synthesis")) {
    normalizedUrl.pathname = "/api/v1/models";
    normalizedUrl.search = "";
    normalizedUrl.hash = "";
    return normalizedUrl.toString();
  }

  if (pathname.endsWith("/services/aigc/text2image/image-synthesis")) {
    normalizedUrl.pathname = "/api/v1/models";
    normalizedUrl.search = "";
    normalizedUrl.hash = "";
    return normalizedUrl.toString();
  }

  if (pathname.endsWith("/compatible-mode/v1")) {
    normalizedUrl.pathname = "/compatible-mode/v1/models";
    normalizedUrl.search = "";
    normalizedUrl.hash = "";
    return normalizedUrl.toString();
  }

  if (pathname.endsWith("/api/v1")) {
    normalizedUrl.pathname = "/api/v1/models";
    normalizedUrl.search = "";
    normalizedUrl.hash = "";
    return normalizedUrl.toString();
  }

  normalizedUrl.pathname = `${pathname}/models`;
  normalizedUrl.search = "";
  normalizedUrl.hash = "";
  return normalizedUrl.toString();
}

function formatModeLabel(
  mode: ConnectionTestMode,
  roleKey?: ConnectionTestRoleKey,
): string {
  const baseLabel = mode === "real_prompt" ? "model check" : "api check";
  return roleKey ? `${baseLabel}: ${roleKey}` : baseLabel;
}

async function readErrorDetails(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string } | string;
      message?: string;
      code?: string;
    };

    if (typeof payload.error === "string") {
      return payload.error;
    }

    return payload.error?.message ?? payload.message ?? payload.code ?? null;
  } catch {
    try {
      const text = await response.text();
      return text || null;
    } catch {
      return null;
    }
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

const connectionTestSchema = z.object({
  ok: z.literal(true),
});
