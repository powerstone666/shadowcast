import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadPrompt(promptFileName: string, currentModuleUrl: string): string {
  const promptUrl = new URL(`../prompts/${promptFileName}`, currentModuleUrl);
  const promptPath = fileURLToPath(promptUrl);

  if (existsSync(promptPath)) {
    return readFileSync(promptPath, "utf-8").trim();
  }

  const sourcePromptPath = promptPath.replace(
    `${path.sep}dist${path.sep}orchestration${path.sep}prompts${path.sep}`,
    `${path.sep}src${path.sep}orchestration${path.sep}prompts${path.sep}`,
  );

  if (existsSync(sourcePromptPath)) {
    return readFileSync(sourcePromptPath, "utf-8").trim();
  }

  throw new Error(`Prompt file not found: ${promptFileName}`);
}
