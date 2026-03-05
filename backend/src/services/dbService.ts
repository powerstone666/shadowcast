import { Pool, type PoolConfig } from "pg";

import { Logger } from "../utils/commonUtils.js";

const SUPABASE_POOL_CONFIG: Omit<PoolConfig, "password"> = {
  host: process.env.PG_HOST ?? "",
  port: Number(process.env.PG_PORT ?? 6543),
  database: process.env.PG_DATABASE ?? "postgres",
  user: process.env.PG_USER ?? "",
  ssl: {
    rejectUnauthorized: false,
  },
  max: 14,
  min: 0,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
};

export class PgDbService {
  private static sharedPool: Pool | null = null;
  private readonly logger = new Logger("pg-db-service");

  async getPool(): Promise<Pool> {
    if (PgDbService.sharedPool) {
      return PgDbService.sharedPool;
    }

    const pool = new Pool(this.buildConnectionConfig());
    pool.on("error", (error: Error) => {
      this.logger.error("PostgreSQL pool error", { error });
    });

    this.logger.info("PostgreSQL shared pool initialized");
    PgDbService.sharedPool = pool;
    return pool;
  }

  async closePool(): Promise<void> {
    if (PgDbService.sharedPool) {
      await PgDbService.sharedPool.end();
      PgDbService.sharedPool = null;
    }
  }

  private buildConnectionConfig(): PoolConfig {
    const password = this.resolvePassword();

    return {
      ...SUPABASE_POOL_CONFIG,
      password,
    };
  }

  private resolvePassword(): string {
    return process.env.PG_PASSWORD ?? "";
  }
}
