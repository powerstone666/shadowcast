import { z } from "zod";

import { PgDbService } from "./dbService.js";

const audioLanguageSchema = z.object({
  language: z.enum(["english", "hindi"]).default("english"),
});

export type AudioLanguagePreference = z.infer<typeof audioLanguageSchema>;

type UserPreferenceRow = {
  id: number;
  preference_key: string;
  preference_value: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export class UserPreferencesService {
  private readonly dbService = new PgDbService();

  async getAudioLanguage(): Promise<AudioLanguagePreference> {
    const pool = await this.dbService.getPool();
    const result = await pool.query<UserPreferenceRow>(
      `
        SELECT id, preference_key, preference_value, created_at, updated_at
        FROM user_preferences
        WHERE preference_key = 'audio_language'
        LIMIT 1
      `,
    );

    const row = result.rows[0];
    if (!row) {
      return {
        language: "english",
      };
    }

    try {
      return audioLanguageSchema.parse(row.preference_value);
    } catch (error) {
      console.error("Failed to parse audio language preference:", error);
      return {
        language: "english",
      };
    }
  }

  async saveAudioLanguage(language: "english" | "hindi"): Promise<AudioLanguagePreference> {
    const preference: AudioLanguagePreference = { language };
    const parsedPreference = audioLanguageSchema.parse(preference);

    const pool = await this.dbService.getPool();
    const existingRowResult = await pool.query<{ id: number }>(
      `
        SELECT id
        FROM user_preferences
        WHERE preference_key = 'audio_language'
        LIMIT 1
      `,
    );

    const existingRow = existingRowResult.rows[0];
    const result = existingRow
      ? await pool.query<UserPreferenceRow>(
          `
            UPDATE user_preferences
            SET preference_value = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, preference_key, preference_value, created_at, updated_at
          `,
          [JSON.stringify(parsedPreference), existingRow.id],
        )
      : await pool.query<UserPreferenceRow>(
          `
            INSERT INTO user_preferences (preference_key, preference_value)
            VALUES ($1, $2)
            RETURNING id, preference_key, preference_value, created_at, updated_at
          `,
          ["audio_language", JSON.stringify(parsedPreference)],
        );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to persist audio language preference");
    }

    return audioLanguageSchema.parse(row.preference_value);
  }
}