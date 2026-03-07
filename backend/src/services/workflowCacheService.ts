import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Defines the path: backend/temp
const TEMP_DIR = path.resolve(__dirname, "../../temp");

export class WorkflowCacheService {
  async init(): Promise<void> {
    await mkdir(TEMP_DIR, { recursive: true });
  }

  async getCachedResult<T>(stepName: string): Promise<T | null> {
    try {
      const filePath = path.join(TEMP_DIR, `${stepName}.json`);
      const data = await readFile(filePath, "utf-8");
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  async saveResult<T>(stepName: string, data: T): Promise<void> {
    await this.init();
    const filePath = path.join(TEMP_DIR, `${stepName}.json`);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  getTempDir(): string {
    return TEMP_DIR;
  }

  async cleanCache(): Promise<void> {
    try {
      await rm(TEMP_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

export const workflowCacheService = new WorkflowCacheService();
