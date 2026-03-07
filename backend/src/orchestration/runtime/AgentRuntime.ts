import { z, type ZodType } from "zod";

import { ConflictError } from "../errors.js";
import {
  AgentConfigService,
  type AgentConfigInput,
} from "../../services/agentConfigService.js";
import { Logger } from "../../utils/commonUtils.js";

const chatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z
          .object({
            content: z.union([
              z.string(),
              z.array(
                z.object({
                  type: z.string().optional(),
                  text: z.string().optional(),
                }),
              ),
            ]).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  error: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
});

type ChatCompletionResponse = z.infer<typeof chatCompletionResponseSchema>;

type StructuredInvocation<T> = {
  roleKey: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  extraBody?: Record<string, unknown>;
  signal?: AbortSignal;
};

export class AgentRuntime {
  private readonly logger = new Logger("agent-runtime");

  constructor(private readonly agentConfigService = new AgentConfigService()) {}

  async getConfig(roleKey: string): Promise<AgentConfigInput | null> {
    return this.agentConfigService.getConfig(roleKey);
  }

  async invokeStructuredJson<T>({
    roleKey,
    systemPrompt,
    userPrompt,
    schema,
    extraBody,
    signal,
  }: StructuredInvocation<T>): Promise<T> {
    const config = await this.getConfig(roleKey);
    if (!config) {
      throw new ConflictError(`Model config for role "${roleKey}" is not configured`);
    }

    const endpoint = normalizeChatEndpoint(config.apiUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      ...(signal ? { signal } : {}),
      body: JSON.stringify({
        model: config.modelName,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\nReturn valid JSON only.`,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        ...(extraBody ?? {}),
      }),
    });

    const rawPayload = await response.text();
    const payload = parseChatCompletionResponse(rawPayload);

    if (!response.ok) {
      const message = payload?.error?.message ?? `Model call failed with status ${response.status}`;
      this.logger.error("Model invocation failed", {
        endpoint,
        model: config.modelName,
        message,
      });
      throw new Error(message);
    }

    if (!payload) {
      throw new Error(`Model "${config.modelName}" returned an invalid response payload`);
    }

    const textContent = extractTextContent(payload);
    if (!textContent.trim()) {
      throw new Error(`Model "${config.modelName}" returned an empty response`);
    }

    const parsedJson = parseJsonPayload(textContent);
    return schema.parse(parsedJson);
  }
}

function normalizeChatEndpoint(apiUrl: string): string {
  const trimmedUrl = apiUrl.replace(/\/$/, "");
  return trimmedUrl.endsWith("/chat/completions")
    ? trimmedUrl
    : `${trimmedUrl}/chat/completions`;
}

function parseChatCompletionResponse(rawPayload: string): ChatCompletionResponse | null {
  try {
    return chatCompletionResponseSchema.parse(JSON.parse(rawPayload));
  } catch {
    return null;
  }
}

function extractTextContent(payload: ChatCompletionResponse | null): string {
  const rawContent = payload?.choices?.[0]?.message?.content;
  if (typeof rawContent === "string") {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    return rawContent.map((part) => part.text ?? "").join("\n");
  }

  return "";
}

function parseJsonPayload(content: string): unknown {
  const normalizedContent = content.trim();
  const codeFenceMatch = normalizedContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = codeFenceMatch?.[1] ?? normalizedContent;
  return JSON.parse(candidate);
}
