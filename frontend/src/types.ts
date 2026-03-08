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

export type AgentRoleConfig = {
  roleKey: string
  apiUrl: string
  apiKey: string
  modelName: string
}

export type GenrePool = {
  selectedGenres: string[]
}

export type PipelineStage = {
  key: PipelineStageKey
  label: string
}

export type PipelineStageKey =
  | 'genre_selection'
  | 'script_generation'
  | 'council_review'
  | 'director_plan'
  | 'video_generation'
  | 'youtube_publish'

export type PipelineLogEntry = {
  id: string
  timestamp: string
  message: string
}

export type PipelineRealtimeSnapshot = {
  started: boolean
  isRunning: boolean
  runOutcome: 'completed' | 'failed' | 'terminated' | null
  activeStageKey: PipelineStageKey | null
  completedStageKeys: PipelineStageKey[]
  lastCompletedStageKey: PipelineStageKey | null
  logs: PipelineLogEntry[]
}

export type PipelineSocketEvent =
  | { type: 'snapshot'; payload: PipelineRealtimeSnapshot }
  | { type: 'pong'; payload: { timestamp: string } }
