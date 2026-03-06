import { Pool, type PoolConfig } from "pg";

import { Logger } from "../utils/commonUtils.js";

const SHARED_POOL_OPTIONS: Pick<
  PoolConfig,
  "max" | "min" | "idleTimeoutMillis" | "connectionTimeoutMillis"
> = {
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
    await pool.query("SELECT 1");
    pool.on("error", (error: Error) => {
      this.logger.error("PostgreSQL pool error", { error });
    });

    this.logger.info("PostgreSQL shared pool initialized and verified");
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
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
      this.logger.info("Using DATABASE_URL for PostgreSQL connection");
      const connectionConfig = {
        connectionString: databaseUrl,
        ssl: {
          rejectUnauthorized: false,
        },
        ...SHARED_POOL_OPTIONS,
      };

      return connectionConfig as PoolConfig;
    }

    const password = this.resolvePassword();

    this.logger.info("Using PGHOST/PGPORT environment variables for PostgreSQL connection", {
      host: process.env.PGHOST ?? "",
      port: Number(process.env.PGPORT ?? 6543),
      database: process.env.PGDATABASE ?? "postgres",
      user: process.env.PGUSER ?? "",
    });

    return {
      host: process.env.PGHOST ?? "",
      port: Number(process.env.PGPORT ?? 6543),
      database: process.env.PGDATABASE ?? "postgres",
      user: process.env.PGUSER ?? "",
      ssl: {
        rejectUnauthorized: false,
      },
      password,
      ...SHARED_POOL_OPTIONS,
    };
  }

  private resolvePassword(): string {
    return process.env.PGPASSWORD ?? "";
  }
}
