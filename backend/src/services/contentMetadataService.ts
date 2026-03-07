import { z } from "zod";

import { PgDbService } from "./dbService.js";

const publishedContentSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  genre: z.string().trim().min(1),
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
          genre
        )
        VALUES ($1, $2, $3)
      `,
      [
        parsedInput.title,
        parsedInput.summary,
        parsedInput.genre,
      ],
    );
  }
}
