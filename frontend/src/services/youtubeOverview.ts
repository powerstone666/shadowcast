import type { YoutubeOverviewResponse } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

export async function fetchYoutubeOverview(): Promise<YoutubeOverviewResponse> {
  const response = await fetch(`${apiBaseUrl}/youtube/overview`)
  const data = (await response.json()) as YoutubeOverviewResponse

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to load YouTube overview')
  }

  return data
}

