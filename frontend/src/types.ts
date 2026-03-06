export type NavigationKey =
  | 'overview'
  | 'dashboard'
  | 'api-configuration'

export type VideoRecord = {
  key: string
  thumbnail: string
  title: string
  genre: string
  publishTime: string
  views: string
  status: 'uploaded' | 'processing' | 'failed'
  runId: string
}

export type GenreRecord = {
  key: string
  genre: string
  enabled: boolean
  weight: number
  usedRecently: boolean
}

export type ApiServiceRecord = {
  key: string
  service: string
  status: 'healthy' | 'warning'
  configured: boolean
  lastCheck: string
}

export type YoutubeOAuthStatus = {
  connected: boolean
  channelId?: string
  channelTitle?: string
  scope?: string
  expiresAt?: string
  lastUpdatedAt?: string
  error?: string
}

export type YoutubeOAuthStatusResponse = YoutubeOAuthStatus

export type OverviewMetricCard = {
  title: string
  value: string | number
}

export type OverviewTrendPoint = {
  day: string
  metric: 'Views' | 'Subscribers'
  value: number
}

export type OverviewPerformance = {
  averageViews7d: string
  topGenre: string
  lastUploadTime: string
  weeklyGrowthPercent: number
}

export type YoutubeOverviewResponse = {
  connected: boolean
  channelId?: string
  channelTitle?: string
  metricCards?: OverviewMetricCard[]
  audienceGrowth?: {
    views: string
    subscribers: string
    series: OverviewTrendPoint[]
  }
  recentVideos?: VideoRecord[]
  performance?: OverviewPerformance
  error?: string
}
