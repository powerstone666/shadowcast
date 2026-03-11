import { z } from "zod";

import { PgDbService } from "./dbService.js";

const publishedContentSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  genre: z.string().trim().min(1),
  youtubeVideoId: z.string().optional(),
  viewCount: z.number().optional(),
  publishedAt: z.string().optional(),
});

export type PublishedContentInput = z.infer<typeof publishedContentSchema>;

export class ContentMetadataService {
  private readonly dbService = new PgDbService();

  async savePublishedContent(input: PublishedContentInput): Promise<void> {
    const parsedInput = publishedContentSchema.parse(input);
    const pool = await this.dbService.getPool();

    await pool.query(
      `
        INSERT INTO content (
          title,
          summary,
          genre,
          youtube_video_id,
          view_count,
          published_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        parsedInput.title,
        parsedInput.summary,
        parsedInput.genre,
        parsedInput.youtubeVideoId || null,
        parsedInput.viewCount || 0,
        parsedInput.publishedAt || null,
      ],
    );
  }

  async updateContentWithYouTubeData(
    title: string,
    youtubeVideoId: string,
    viewCount: number,
    publishedAt: string
  ): Promise<void> {
    const pool = await this.dbService.getPool();
    
    await pool.query(
      `
        UPDATE content
        SET youtube_video_id = $1,
            view_count = $2,
            published_at = $3
        WHERE title = $4
        AND (youtube_video_id IS NULL OR youtube_video_id != $1)
      `,
      [youtubeVideoId, viewCount, publishedAt, title]
    );
  }
}
