import { PgDbService } from "./dbService.js";

export type RecentContentItem = {
  id: number;
  title: string;
  summary: string;
  genre: string;
  createdAt: string;
};

type ContentRow = {
  id: number;
  title: string;
  summary: string;
  genre: string;
  created_at: string;
};

export class ContentMemoryService {
  private readonly dbService = new PgDbService();

  async getRecentContent(days: number): Promise<RecentContentItem[]> {
    const pool = await this.dbService.getPool();
    const result = await pool.query<ContentRow>(
      `
        SELECT id, title, summary, genre, created_at
        FROM content
        WHERE created_at >= NOW() - ($1::text || ' days')::interval
        ORDER BY created_at DESC
      `,
      [String(days)],
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      genre: row.genre,
      createdAt: row.created_at,
    }));
  }
}

