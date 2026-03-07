import { z } from "zod";

import { PgDbService } from "./dbService.js";

const genrePoolSchema = z.object({
  selectedGenres: z.array(z.string().min(1)).default([]),
});

export type GenrePool = z.infer<typeof genrePoolSchema>;

type GenreRow = {
  id: number;
  genre_pool: GenrePool;
  created_at: string;
};

export class GenreConfigService {
  private readonly dbService = new PgDbService();

  async getGenrePool(): Promise<GenrePool> {
    const pool = await this.dbService.getPool();
    const result = await pool.query<GenreRow>(
      `
        SELECT id, genre_pool, created_at
        FROM genre
        ORDER BY id DESC
        LIMIT 1
      `,
    );

    const row = result.rows[0];
    if (!row) {
      return {
        selectedGenres: [],
      };
    }

    return genrePoolSchema.parse(row.genre_pool);
  }

  async saveGenrePool(input: GenrePool): Promise<GenrePool> {
    const parsedPool = genrePoolSchema.parse({
      selectedGenres: Array.from(new Set(input.selectedGenres.map((genre) => genre.trim()).filter(Boolean))),
    });

    const pool = await this.dbService.getPool();
    const existingRowResult = await pool.query<{ id: number }>(
      `
        SELECT id
        FROM genre
        ORDER BY id DESC
        LIMIT 1
      `,
    );

    const existingRow = existingRowResult.rows[0];
    const result = existingRow
      ? await pool.query<GenreRow>(
          `
            UPDATE genre
            SET genre_pool = $1
            WHERE id = $2
            RETURNING id, genre_pool, created_at
          `,
          [JSON.stringify(parsedPool), existingRow.id],
        )
      : await pool.query<GenreRow>(
          `
            INSERT INTO genre (genre_pool)
            VALUES ($1)
            RETURNING id, genre_pool, created_at
          `,
          [JSON.stringify(parsedPool)],
        );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to persist genre pool");
    }

    return genrePoolSchema.parse(row.genre_pool);
  }
}

