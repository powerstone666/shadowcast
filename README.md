# shadowcast
my current pipeline is llm starts->select last 14 days genre posted ->gives to genre selecter see's what genres i ahve used in pool and if user have any preferne -> ddse serach happens to find trendy topics on that area -> feeds to script writer it see's list of topics see's in last 14 days if used any generates script -> goes to counsil of 3 it rates if > thresold pass else rewritten -> goes to director it see's script and divides into equal parts such that none exceeds 15sec thresold calls qwen to genrate script with native audio usses ffmg combines posts


Your Pipeline With ADK
Stage 1 — Genre Decision

ADK agent:

reads 14-day memory

reads genre pool

reads user preference

Output:

selected_genre
reason
confidence
Stage 2 — Topic Discovery

External tool:

DDSE search

ADK agent:

ranks topics

removes duplicates

checks memory

Output:

top_topics[]
Stage 3 — Script Generation

ADK writer agent:

topic → script

Memory check:

recent scripts similarity
Stage 4 — Council Review

3 agents:

critic
editor
viewer

Output:

score
feedback
pass/fail

Rewrite loop handled by backend logic, not ADK.

Stage 5 — Director Agent

ADK splits script into segments:

scene_plan = [
  {segment:1, duration:12s, text:"..."},
  {segment:2, duration:14s, text:"..."},
]
Stage 6 — Execution Workers

Now ADK stops being involved.

Workers handle:

segment → Qwen media generation
audio generation
render
ffmpeg combine

## YouTube OAuth Setup

Backend environment variables required for the real YouTube OAuth flow:

- `YT_CLIENT_ID`
- `YT_CLIENT_SECRET`
- `YT_REDIRECT_URI`
- `FRONTEND_URL`

Recommended local values:

- `YT_REDIRECT_URI=http://localhost:3000/youtube/oauth/callback`
- `FRONTEND_URL=http://localhost:5173`

Frontend API base URL:

- `VITE_API_BASE_URL=http://localhost:3000`

Apply the YouTube OAuth schema before running the flow:

- run the SQL in [`backend/src/db/yt_oauth.sql`](/Users/imran/Desktop/Upskilling/typescript/yt-automation/backend/src/db/yt_oauth.sql)

OAuth endpoints added by the backend:

- `GET /youtube/oauth/start`
- `GET /youtube/oauth/callback`
- `GET /youtube/oauth/status`
- `POST /youtube/oauth/refresh`
- `POST /youtube/oauth/disconnect`
