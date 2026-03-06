import { randomBytes } from "node:crypto";

import { PgDbService } from "./dbService.js";
import { Logger } from "../utils/commonUtils.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_CHANNELS_URL =
  "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.upload",
].join(" ");

type TokenExchangeResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type ChannelStatisticsResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
    };
    statistics?: {
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
    };
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
};

type PlaylistItemsResponse = {
  items?: Array<{
    contentDetails?: {
      videoId?: string;
      videoPublishedAt?: string;
    };
  }>;
};

type VideosListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      publishedAt?: string;
      categoryId?: string;
    };
    statistics?: {
      viewCount?: string;
    };
    status?: {
      privacyStatus?: string;
      uploadStatus?: string;
    };
  }>;
};

type ChannelsListResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
    };
  }>;
};

type YtOauthRow = {
  id: number;
  channel_id: string | null;
  channel_title: string | null;
  access_token: string;
  refresh_token: string;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
};

export type YoutubeOAuthStatus = {
  connected: boolean;
  channelId?: string;
  channelTitle?: string;
  scope?: string;
  expiresAt?: string;
  lastUpdatedAt?: string;
  error?: string;
};

type StoredTokens = {
  channelId?: string;
  channelTitle?: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope?: string;
  expiresAt?: string;
};

type YouTubeRequestOptions = {
  retryOnUnauthorized?: boolean;
};

export type YoutubeOverviewResponse = {
  connected: boolean;
  channelId?: string;
  channelTitle?: string;
  metricCards: Array<{ title: string; value: string | number }>;
  audienceGrowth: {
    views: string;
    subscribers: string;
    series: Array<{ day: string; metric: "Views" | "Subscribers"; value: number }>;
  };
  recentVideos: Array<{
    key: string;
    thumbnail: string;
    title: string;
    genre: string;
    publishTime: string;
    views: string;
    status: "uploaded" | "processing" | "failed";
    runId: string;
  }>;
  performance: {
    averageViews7d: string;
    topGenre: string;
    lastUploadTime: string;
    weeklyGrowthPercent: number;
  };
};

export class YoutubeOAuthService {
  private readonly logger = new Logger("youtube-oauth-service");
  private readonly dbService = new PgDbService();

  generateState(): string {
    return randomBytes(24).toString("hex");
  }

  buildAuthorizationUrl(state: string): string {
    const clientId = this.getRequiredEnv("YT_CLIENT_ID");
    const redirectUri = this.getRequiredEnv("YT_REDIRECT_URI");

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", YOUTUBE_SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);
    return authUrl.toString();
  }

  async exchangeCode(code: string): Promise<YoutubeOAuthStatus> {
    const existingConnection = await this.getActiveRow();
    const tokenData = await this.exchangeCodeForTokens(code);
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token ?? existingConnection?.refresh_token;

    if (!accessToken || !refreshToken) {
      throw new Error("OAuth token response missing access_token or refresh_token");
    }

    const channelProfile = await this.fetchChannelProfile(accessToken);
    const expiresAt = this.toExpiryIso(tokenData.expires_in);

    await this.saveConnection({
      ...(channelProfile.channelId ? { channelId: channelProfile.channelId } : {}),
      ...(channelProfile.channelTitle ? { channelTitle: channelProfile.channelTitle } : {}),
      accessToken,
      refreshToken,
      tokenType: tokenData.token_type ?? "Bearer",
      scope: tokenData.scope ?? YOUTUBE_SCOPES,
      ...(expiresAt ? { expiresAt } : {}),
    });

    this.logger.info("YouTube OAuth connection stored", {
      channelId: channelProfile.channelId,
      channelTitle: channelProfile.channelTitle,
    });

    return this.getStatus();
  }

  async getStatus(): Promise<YoutubeOAuthStatus> {
    const row = await this.getActiveRow();

    if (!row) {
      return {
        connected: false,
      };
    }

    return this.toStatus(row);
  }

  async refreshConnection(): Promise<YoutubeOAuthStatus> {
    const currentConnection = await this.getActiveRow();

    if (!currentConnection) {
      throw new Error("YouTube OAuth connection not found");
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.getRequiredEnv("YT_CLIENT_ID"),
        client_secret: this.getRequiredEnv("YT_CLIENT_SECRET"),
        refresh_token: currentConnection.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = (await tokenResponse.json()) as TokenExchangeResponse;
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? "Failed to refresh YouTube OAuth token");
    }

    const expiresAt = this.toExpiryIso(tokenData.expires_in);

    const pool = await this.dbService.getPool();
    await pool.query(
      `
        UPDATE yt_oauth
        SET access_token = $1,
            token_type = $2,
            scope = $3,
            expires_at = $4,
            updated_at = NOW()
        WHERE id = $5
      `,
      [
        tokenData.access_token,
        tokenData.token_type ?? currentConnection.token_type ?? "Bearer",
        tokenData.scope ?? currentConnection.scope,
        expiresAt,
        currentConnection.id,
      ],
    );

    this.logger.info("YouTube OAuth token refreshed", {
      channelId: currentConnection.channel_id,
    });

    return this.getStatus();
  }

  async disconnect(): Promise<void> {
    const pool = await this.dbService.getPool();
    await pool.query(
      `
        UPDATE yt_oauth
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE is_active = TRUE
      `,
    );
  }

  async getOverview(): Promise<YoutubeOverviewResponse> {
    const currentConnection = await this.getActiveRow();
    if (!currentConnection) {
      throw new Error("YouTube OAuth connection not found");
    }

    const channelData = await this.fetchJsonWithAuth<ChannelStatisticsResponse>(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true",
    );
    const channel = channelData.items?.[0];

    if (!channel?.id || !channel.contentDetails?.relatedPlaylists?.uploads) {
      throw new Error("Unable to load YouTube channel details");
    }

    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
    const playlistData = await this.fetchJsonWithAuth<PlaylistItemsResponse>(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${encodeURIComponent(
        uploadsPlaylistId,
      )}&maxResults=7`,
    );

    const videoIds = (playlistData.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((videoId): videoId is string => Boolean(videoId));

    const videosData =
      videoIds.length > 0
        ? await this.fetchJsonWithAuth<VideosListResponse>(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id=${encodeURIComponent(
              videoIds.join(","),
            )}`,
          )
        : { items: [] };

    const sortedVideos = [...(videosData.items ?? [])].sort((left, right) => {
      const leftTime = left.snippet?.publishedAt ? new Date(left.snippet.publishedAt).getTime() : 0;
      const rightTime = right.snippet?.publishedAt ? new Date(right.snippet.publishedAt).getTime() : 0;
      return leftTime - rightTime;
    });

    const currentSubscribers = parseCount(channel.statistics?.subscriberCount);
    const totalViews = parseCount(channel.statistics?.viewCount);
    const totalVideosUploaded = parseCount(channel.statistics?.videoCount);
    const videosUploaded24h = sortedVideos.filter((video) => {
      const publishedAt = video.snippet?.publishedAt;
      if (!publishedAt) {
        return false;
      }

      return Date.now() - new Date(publishedAt).getTime() <= 24 * 60 * 60 * 1000;
    }).length;

    const recentVideos = [...sortedVideos]
      .reverse()
      .map((video) => {
        const title = video.snippet?.title ?? "Untitled video";
        const publishedAt = video.snippet?.publishedAt;

        return {
          key: video.id ?? title,
          thumbnail: toInitials(title),
          title,
          genre: mapCategoryToGenre(video.snippet?.categoryId),
          publishTime: publishedAt ? formatAbsoluteDate(publishedAt) : "Unavailable",
          views: formatCompactCount(parseCount(video.statistics?.viewCount)),
          status: mapUploadStatus(video.status?.uploadStatus, video.status?.privacyStatus),
          runId: video.id ?? "Unavailable",
        };
      });

    const audienceSeries = sortedVideos.flatMap((video) => {
      const publishedAt = video.snippet?.publishedAt;
      const viewCount = parseCount(video.statistics?.viewCount);
      const dayLabel = publishedAt ? formatDayLabel(publishedAt) : "N/A";

      return [
        { day: dayLabel, metric: "Views" as const, value: viewCount },
        { day: dayLabel, metric: "Subscribers" as const, value: currentSubscribers },
      ];
    });

    const averageViews = calculateAverage(sortedVideos.map((video) => parseCount(video.statistics?.viewCount)));
    const topGenre = deriveTopGenre(sortedVideos);
    const mostRecentVideo = recentVideos[0];
    const latestViews = parseCount(sortedVideos[sortedVideos.length - 1]?.statistics?.viewCount);
    const earliestViews = parseCount(sortedVideos[0]?.statistics?.viewCount);
    const weeklyGrowthPercent =
      earliestViews > 0 ? Math.max(0, Math.round(((latestViews - earliestViews) / earliestViews) * 100)) : 0;

    return {
      connected: true,
      ...(channel.id ? { channelId: channel.id } : {}),
      ...(channel.snippet?.title ? { channelTitle: channel.snippet.title } : {}),
      metricCards: [
        { title: "Subscribers", value: formatCompactCount(currentSubscribers) },
        { title: "Total Views", value: formatCompactCount(totalViews) },
        { title: "Total Videos Uploaded", value: totalVideosUploaded },
        { title: "Videos Uploaded (24h)", value: videosUploaded24h },
        { title: "Channel Status", value: "Connected" },
      ],
      audienceGrowth: {
        views: formatCompactCount(latestViews),
        subscribers: formatCompactCount(currentSubscribers),
        series: audienceSeries,
      },
      recentVideos,
      performance: {
        averageViews7d: formatCompactCount(averageViews),
        topGenre,
        lastUploadTime: mostRecentVideo?.publishTime ?? "Unavailable",
        weeklyGrowthPercent,
      },
    };
  }

  buildFrontendRedirect(params: Record<string, string | undefined>): string {
    const frontendUrl = new URL(this.getRequiredEnv("FRONTEND_URL"));

    for (const [key, value] of Object.entries(params)) {
      if (value) {
        frontendUrl.searchParams.set(key, value);
      }
    }

    return frontendUrl.toString();
  }

  private async exchangeCodeForTokens(code: string): Promise<TokenExchangeResponse> {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: this.getRequiredEnv("YT_CLIENT_ID"),
        client_secret: this.getRequiredEnv("YT_CLIENT_SECRET"),
        redirect_uri: this.getRequiredEnv("YT_REDIRECT_URI"),
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenResponse.json()) as TokenExchangeResponse;
    if (!tokenResponse.ok) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? "Failed to exchange YouTube OAuth code");
    }

    return tokenData;
  }

  private async fetchJsonWithAuth<T>(
    url: string,
    options: YouTubeRequestOptions = {},
  ): Promise<T> {
    const token = await this.getUsableAccessToken(options.retryOnUnauthorized ?? true);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401 && options.retryOnUnauthorized !== false) {
      await this.refreshConnection();
      return this.fetchJsonWithAuth<T>(url, { retryOnUnauthorized: false });
    }

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`YouTube API request failed: ${response.status} ${details}`);
    }

    return (await response.json()) as T;
  }

  private async fetchChannelProfile(accessToken: string): Promise<{
    channelId?: string;
    channelTitle?: string;
  }> {
    const channelResponse = await fetch(YOUTUBE_CHANNELS_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!channelResponse.ok) {
      const details = await channelResponse.text();
      this.logger.warn("Failed to fetch YouTube channel profile", { details });
      return {};
    }

    const data = (await channelResponse.json()) as ChannelsListResponse;
    const firstChannel = data.items?.[0];

    return {
      ...(firstChannel?.id ? { channelId: firstChannel.id } : {}),
      ...(firstChannel?.snippet?.title ? { channelTitle: firstChannel.snippet.title } : {}),
    };
  }

  private async saveConnection(tokens: StoredTokens): Promise<void> {
    const pool = await this.dbService.getPool();

    await pool.query("BEGIN");
    try {
      await pool.query(
        `
          UPDATE yt_oauth
          SET is_active = FALSE,
              updated_at = NOW()
          WHERE is_active = TRUE
        `,
      );

      await pool.query(
        `
          INSERT INTO yt_oauth (
            channel_id,
            channel_title,
            access_token,
            refresh_token,
            token_type,
            scope,
            expires_at,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        `,
        [
          tokens.channelId ?? null,
          tokens.channelTitle ?? null,
          tokens.accessToken,
          tokens.refreshToken,
          tokens.tokenType,
          tokens.scope ?? null,
          tokens.expiresAt ?? null,
        ],
      );

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }

  private async getActiveRow(): Promise<YtOauthRow | null> {
    const pool = await this.dbService.getPool();
    const result = await pool.query<YtOauthRow>(
      `
        SELECT id,
               channel_id,
               channel_title,
               access_token,
               refresh_token,
               token_type,
               scope,
               expires_at,
               created_at,
               updated_at,
               is_active
        FROM yt_oauth
        WHERE is_active = TRUE
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
    );

    return result.rows[0] ?? null;
  }

  private async getUsableAccessToken(allowRefresh: boolean): Promise<string> {
    const currentConnection = await this.getActiveRow();
    if (!currentConnection) {
      throw new Error("YouTube OAuth connection not found");
    }

    if (allowRefresh && currentConnection.expires_at) {
      const expiresAt = new Date(currentConnection.expires_at).getTime();
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000) {
        const refreshedStatus = await this.refreshConnection();
        const refreshedConnection = await this.getActiveRow();
        if (!refreshedConnection) {
          throw new Error("YouTube OAuth connection not found after refresh");
        }

        if (!refreshedStatus.connected) {
          throw new Error("YouTube OAuth connection refresh failed");
        }

        return refreshedConnection.access_token;
      }
    }

    return currentConnection.access_token;
  }

  private toStatus(row: YtOauthRow): YoutubeOAuthStatus {
    return {
      connected: true,
      ...(row.channel_id ? { channelId: row.channel_id } : {}),
      ...(row.channel_title ? { channelTitle: row.channel_title } : {}),
      ...(row.scope ? { scope: row.scope } : {}),
      ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
      lastUpdatedAt: row.updated_at,
    };
  }

  private toExpiryIso(expiresIn?: number): string | undefined {
    if (!expiresIn) {
      return undefined;
    }

    return new Date(Date.now() + expiresIn * 1000).toISOString();
  }

  private getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  }
}

function parseCount(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function formatCompactCount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatAbsoluteDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDayLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  }).format(new Date(value));
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function mapUploadStatus(
  uploadStatus: string | undefined,
  privacyStatus: string | undefined,
): "uploaded" | "processing" | "failed" {
  if (uploadStatus === "rejected" || uploadStatus === "failed" || uploadStatus === "deleted") {
    return "failed";
  }

  if (uploadStatus && uploadStatus !== "processed") {
    return "processing";
  }

  if (privacyStatus === "private" || privacyStatus === "unlisted") {
    return "uploaded";
  }

  return "uploaded";
}

function toInitials(title: string): string {
  const words = title
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean)
    .slice(0, 2);

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || "YT";
}

function mapCategoryToGenre(categoryId: string | undefined): string {
  const categoryMap: Record<string, string> = {
    "1": "Film",
    "2": "Autos",
    "10": "Music",
    "15": "Pets",
    "17": "Sports",
    "19": "Travel",
    "20": "Gaming",
    "22": "People",
    "23": "Comedy",
    "24": "Entertainment",
    "25": "News",
    "26": "Howto",
    "27": "Education",
    "28": "Science",
  };

  return categoryMap[categoryId ?? ""] ?? "General";
}

function deriveTopGenre(
  videos: Array<{
    snippet?: {
      categoryId?: string;
    };
  }>,
): string {
  const counts = new Map<string, number>();

  for (const video of videos) {
    const genre = mapCategoryToGenre(video.snippet?.categoryId);
    counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }

  let topGenre = "Unavailable";
  let topCount = 0;

  for (const [genre, count] of counts.entries()) {
    if (count > topCount) {
      topGenre = genre;
      topCount = count;
    }
  }

  return topGenre;
}
