import { PgDbService } from "./dbService.js";

export type TopViewedContent = {
  id: number;
  title: string;
  summary: string;
  genre: string;
  viewCount: number;
  youtubeVideoId: string | null;
  publishedAt: string | null;
  createdAt: string;
};

type ContentRow = {
  id: number;
  title: string;
  summary: string;
  genre: string;
  view_count: number;
  youtube_video_id: string | null;
  published_at: string | null;
  created_at: string;
};

export class ViewAnalyticsService {
  private readonly dbService = new PgDbService();

  async getTopViewedContent(limit: number = 5): Promise<TopViewedContent[]> {
    const pool = await this.dbService.getPool();
    const result = await pool.query<ContentRow>(
      `
        SELECT id, title, summary, genre, view_count, youtube_video_id, published_at, created_at
        FROM content
        WHERE youtube_video_id IS NOT NULL AND view_count > 0
        ORDER BY view_count DESC
        LIMIT $1
      `,
      [limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      genre: row.genre,
      viewCount: row.view_count,
      youtubeVideoId: row.youtube_video_id,
      publishedAt: row.published_at,
      createdAt: row.created_at,
    }));
  }

  async updateViewCount(youtubeVideoId: string, viewCount: number): Promise<void> {
    const pool = await this.dbService.getPool();
    await pool.query(
      `
        UPDATE content
        SET view_count = $1
        WHERE youtube_video_id = $2
      `,
      [viewCount, youtubeVideoId],
    );
  }

  async getContentByYoutubeVideoId(youtubeVideoId: string): Promise<TopViewedContent | null> {
    const pool = await this.dbService.getPool();
    const result = await pool.query<ContentRow>(
      `
        SELECT id, title, summary, genre, view_count, youtube_video_id, published_at, created_at
        FROM content
        WHERE youtube_video_id = $1
        LIMIT 1
      `,
      [youtubeVideoId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      genre: row.genre,
      viewCount: row.view_count,
      youtubeVideoId: row.youtube_video_id,
      publishedAt: row.published_at,
      createdAt: row.created_at,
    };
  }

  async getTopGenresByViews(limit: number = 3): Promise<Array<{ genre: string; totalViews: number; videoCount: number }>> {
    const pool = await this.dbService.getPool();
    const result = await pool.query<{
      genre: string;
      total_views: number;
      video_count: number;
    }>(
      `
        SELECT 
          genre,
          SUM(view_count) as total_views,
          COUNT(*) as video_count
        FROM content
        WHERE view_count > 0
        GROUP BY genre
        ORDER BY total_views DESC
        LIMIT $1
      `,
      [limit],
    );

    return result.rows.map((row) => ({
      genre: row.genre,
      totalViews: row.total_views,
      videoCount: row.video_count,
    }));
  }
}