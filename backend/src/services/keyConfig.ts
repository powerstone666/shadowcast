import { Logger } from "../utils/commonUtils.js";
import { PgDbService } from "./dbService.js";

export interface AgentKeys {
  agent_url: string;
  agent_api: string;
  agent_model: string;
}

export interface YtCredentials {
  channel_id?: string;
  access_token: string;
  refresh_token: string;
  token_type?: string;
  scope?: string;
  expires_at?: string | null;
}

interface SecretRow {
  id: number;
  key: string;
  value: string;
  created_at: string;
}

interface YtOauthRow {
  id: number;
  channel_id: string | null;
  access_token: string;
  refresh_token: string;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export class KeyConfigService {
  private readonly logger = new Logger("key-config-service");
  private readonly dbService = new PgDbService();

  async insertKeys(keys: AgentKeys): Promise<void> {
    const pool = await this.dbService.getPool();

    await pool.query("BEGIN");
    try {
      await pool.query("INSERT INTO secrets (key, value) VALUES ($1, $2)", [
        "agent_url",
        keys.agent_url,
      ]);
      await pool.query("INSERT INTO secrets (key, value) VALUES ($1, $2)", [
        "agent_api",
        keys.agent_api,
      ]);
      await pool.query("INSERT INTO secrets (key, value) VALUES ($1, $2)", [
        "agent_model",
        keys.agent_model,
      ]);

      await pool.query("COMMIT");
      this.logger.info("Agent keys inserted into secrets table");
    } catch (error) {
      await pool.query("ROLLBACK");
      this.logger.error("Failed to insert agent keys", { error });
      throw error;
    }
  }

  async getKeys(): Promise<AgentKeys> {
    const pool = await this.dbService.getPool();

    const result = await pool.query<SecretRow>(
      `
        SELECT id, key, value, created_at
        FROM secrets
        WHERE key IN ('agent_url', 'agent_api', 'agent_model')
        ORDER BY id DESC
      `,
    );

    const latestByKey = new Map<string, string>();
    for (const row of result.rows) {
      if (!latestByKey.has(row.key)) {
        latestByKey.set(row.key, row.value);
      }
    }

    const agentUrl = latestByKey.get("agent_url");
    const agentApi = latestByKey.get("agent_api");
    const agentModel = latestByKey.get("agent_model");

    if (!agentUrl || !agentApi || !agentModel) {
      throw new Error("Missing one or more keys in secrets table");
    }

    return {
      agent_url: agentUrl,
      agent_api: agentApi,
      agent_model: agentModel,
    };
  }

  async setYtCredentials(credentials: YtCredentials): Promise<void> {
    const pool = await this.dbService.getPool();

    await pool.query(
      `
        INSERT INTO yt_oauth (
          channel_id,
          access_token,
          refresh_token,
          token_type,
          scope,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        credentials.channel_id ?? null,
        credentials.access_token,
        credentials.refresh_token,
        credentials.token_type ?? "Bearer",
        credentials.scope ?? null,
        credentials.expires_at ?? null,
      ],
    );
  }

  async getYtCredentials(channelId?: string): Promise<YtCredentials> {
    const pool = await this.dbService.getPool();

    const result = channelId
      ? await pool.query<YtOauthRow>(
          `
            SELECT id, channel_id, access_token, refresh_token, token_type, scope, expires_at, created_at, updated_at
            FROM yt_oauth
            WHERE channel_id = $1
            ORDER BY id DESC
            LIMIT 1
          `,
          [channelId],
        )
      : await pool.query<YtOauthRow>(
          `
            SELECT id, channel_id, access_token, refresh_token, token_type, scope, expires_at, created_at, updated_at
            FROM yt_oauth
            ORDER BY id DESC
            LIMIT 1
          `,
        );

    const row = result.rows[0];
    if (!row) {
      throw new Error("YouTube OAuth credentials not found");
    }

    const credentials: YtCredentials = {
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      token_type: row.token_type ?? "Bearer",
      expires_at: row.expires_at,
    };

    if (row.channel_id !== null) {
      credentials.channel_id = row.channel_id;
    }

    if (row.scope !== null) {
      credentials.scope = row.scope;
    }

    return credentials;
  }
}
