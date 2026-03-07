CREATE TABLE IF NOT EXISTS yt_oauth (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    channel_id TEXT,
    channel_title TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_type TEXT DEFAULT 'Bearer',
    scope TEXT,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
