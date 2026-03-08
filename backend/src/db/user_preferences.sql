CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    preference_key TEXT NOT NULL UNIQUE,
    preference_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS user_preferences_key_idx ON user_preferences (preference_key);

-- Insert default language preference
INSERT INTO user_preferences (preference_key, preference_value)
VALUES ('audio_language', '{"language": "english"}')
ON CONFLICT (preference_key) DO NOTHING;