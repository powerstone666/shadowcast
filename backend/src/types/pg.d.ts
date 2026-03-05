declare module "pg" {
  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export interface QueryResult<R = QueryResultRow> {
    rows: R[];
    rowCount: number | null;
  }

  export interface PoolConfig {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean | Record<string, unknown>;
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<R = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
    on(event: "error", listener: (error: Error) => void): this;
    end(): Promise<void>;
  }
}
