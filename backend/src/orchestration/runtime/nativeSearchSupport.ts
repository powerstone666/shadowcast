import type { AgentConfigInput } from "../../services/agentConfigService.js";

export function getNativeSearchExtraBody(
  config: AgentConfigInput | null | undefined,
): Record<string, unknown> | null {
  if (!config) {
    return null;
  }

  const normalizedApiUrl = config.apiUrl.toLowerCase();
  const normalizedModelName = config.modelName.toLowerCase();

  if (
    normalizedApiUrl.includes("groq.com") &&
    (normalizedModelName === "groq/compound" ||
      normalizedModelName === "compound" ||
      normalizedModelName === "groq/compound-mini" ||
      normalizedModelName === "compound-mini")
  ) {
    return {
      compound_custom: {
        tools: {
          enabled_tools: ["web_search"],
        },
      },
    };
  }

  return null;
}
