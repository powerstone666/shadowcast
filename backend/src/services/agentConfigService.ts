import { z } from "zod";

import { PgDbService } from "./dbService.js";

const agentConfigSchema = z.object({
  roleKey: z.string().min(1),
  apiUrl: z.string().min(1),
  apiKey: z.string().min(1),
  modelName: z.string().min(1),
});

export type AgentConfigInput = z.infer<typeof agentConfigSchema>;

type AgentConfigRow = {
  id: number;
  api_url: string;
  api_key: string;
  model_name: string;
  role_key: string;
  created_at: string;
};

export class AgentConfigService {
  private readonly dbService = new PgDbService();

  async getConfig(roleKey: string): Promise<AgentConfigInput | null> {
    const pool = await this.dbService.getPool();
    const result = await pool.query<AgentConfigRow>(
      `
        SELECT id, api_url, api_key, model_name, role_key, created_at
        FROM secrets
        WHERE role_key = $1
        ORDER BY id DESC
        LIMIT 1
      `,
      [roleKey],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      roleKey: row.role_key,
      apiUrl: row.api_url,
      apiKey: row.api_key,
      modelName: row.model_name,
    };
  }

  async listConfigs(): Promise<AgentConfigInput[]> {
    const pool = await this.dbService.getPool();
    const result = await pool.query<AgentConfigRow>(
      `
        SELECT DISTINCT ON (role_key) id, api_url, api_key, model_name, role_key, created_at
        FROM secrets
        ORDER BY role_key ASC, id DESC
      `,
    );

    return result.rows.map((row) => ({
      roleKey: row.role_key,
      apiUrl: row.api_url,
      apiKey: row.api_key,
      modelName: row.model_name,
    }));
  }

  async upsertConfig(input: AgentConfigInput): Promise<AgentConfigInput> {
    const parsedInput = agentConfigSchema.parse(input);
    const pool = await this.dbService.getPool();

    const existingConfigResult = await pool.query<{ id: number }>(
      `
        SELECT id
        FROM secrets
        WHERE role_key = $1
        ORDER BY id DESC
        LIMIT 1
      `,
      [parsedInput.roleKey],
    );

    const existingConfig = existingConfigResult.rows[0];
    const result = existingConfig
      ? await pool.query<AgentConfigRow>(
          `
            UPDATE secrets
            SET api_url = $1,
                api_key = $2,
                model_name = $3
            WHERE id = $4
            RETURNING id, api_url, api_key, model_name, role_key, created_at
          `,
          [
            parsedInput.apiUrl,
            parsedInput.apiKey,
            parsedInput.modelName,
            existingConfig.id,
          ],
        )
      : await pool.query<AgentConfigRow>(
          `
            INSERT INTO secrets (api_url, api_key, model_name, role_key)
            VALUES ($1, $2, $3, $4)
            RETURNING id, api_url, api_key, model_name, role_key, created_at
          `,
          [
            parsedInput.apiUrl,
            parsedInput.apiKey,
            parsedInput.modelName,
            parsedInput.roleKey,
          ],
        );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to persist agent config");
    }

    return {
      roleKey: row.role_key,
      apiUrl: row.api_url,
      apiKey: row.api_key,
      modelName: row.model_name,
    };
  }
}
