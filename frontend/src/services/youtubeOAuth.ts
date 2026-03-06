import type { YoutubeOAuthStatus, YoutubeOAuthStatusResponse } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

export function getYoutubeOAuthStartUrl(): string {
  return `${apiBaseUrl}/youtube/oauth/start`
}

export async function fetchYoutubeOAuthStatus(): Promise<YoutubeOAuthStatus> {
  const response = await fetch(`${apiBaseUrl}/youtube/oauth/status`)
  const data = (await response.json()) as YoutubeOAuthStatusResponse

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to load YouTube OAuth status')
  }

  return normalizeYoutubeOAuthStatus(data)
}

export async function refreshYoutubeOAuthConnection(): Promise<YoutubeOAuthStatus> {
  const response = await fetch(`${apiBaseUrl}/youtube/oauth/refresh`, {
    method: 'POST',
  })
  const data = (await response.json()) as YoutubeOAuthStatusResponse

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to refresh YouTube OAuth connection')
  }

  return normalizeYoutubeOAuthStatus(data)
}

function normalizeYoutubeOAuthStatus(data: YoutubeOAuthStatusResponse): YoutubeOAuthStatus {
  return {
    connected: data.connected,
    channelId: data.channelId,
    channelTitle: data.channelTitle,
    scope: data.scope,
    expiresAt: data.expiresAt,
    lastUpdatedAt: data.lastUpdatedAt,
    error: data.error,
  }
}
