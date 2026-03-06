import type { ApiServiceRecord, GenreRecord, NavigationKey, VideoRecord } from './types'

export const navigationLabels: Record<NavigationKey, string> = {
  overview: 'YouTube Overview',
  dashboard: 'Automation Dashboard',
  'api-configuration': 'API Configuration',
}

export const metricCards = [
  { title: 'Subscribers', value: '128.4K' },
  { title: 'Total Views', value: '4.8M' },
  { title: 'Total Videos Uploaded', value: 326 },
  { title: 'Videos Uploaded (24h)', value: 3 },
  { title: 'Monetization', value: 'Enabled' },
]

export const overviewTrend = [
  { label: 'Mon', views: 18200, subscribers: 121900 },
  { label: 'Tue', views: 21400, subscribers: 122350 },
  { label: 'Wed', views: 19850, subscribers: 123040 },
  { label: 'Thu', views: 26700, subscribers: 124120 },
  { label: 'Fri', views: 28500, subscribers: 125480 },
  { label: 'Sat', views: 32400, subscribers: 126950 },
  { label: 'Sun', views: 36100, subscribers: 128400 },
]

export const overviewTrendSeries = overviewTrend.flatMap((point) => [
  { day: point.label, metric: 'Views', value: point.views },
  { day: point.label, metric: 'Subscribers', value: point.subscribers },
])

export const recentVideos: VideoRecord[] = [
  {
    key: '1',
    thumbnail: 'RS',
    title: 'Why the Roman Senate Still Matters',
    genre: 'History',
    publishTime: 'Mar 6, 2026 12:14',
    views: '41.2K',
    status: 'uploaded',
    runId: 'run_3928',
  },
  {
    key: '2',
    thumbnail: 'AI',
    title: 'The Hidden Economics of AI Chips',
    genre: 'Technology',
    publishTime: 'Mar 6, 2026 08:40',
    views: '18.9K',
    status: 'processing',
    runId: 'run_3927',
  },
  {
    key: '3',
    thumbnail: 'PH',
    title: 'What Stoicism Gets Wrong About Modern Work',
    genre: 'Philosophy',
    publishTime: 'Mar 5, 2026 19:06',
    views: '9.4K',
    status: 'failed',
    runId: 'run_3925',
  },
]

export const performanceMetrics = {
  averageViews7d: '27.4K',
  topGenre: 'History',
  lastUploadTime: '2h ago',
  weeklyGrowthPercent: 78,
}

export const pipelineStages = [
  'planning',
  'topic_search',
  'script_generation',
  'council_review',
  'segment_planning',
  'media_generation',
  'rendering',
  'uploading',
]

export const activeStageIndex = 5

export const initialGenres: GenreRecord[] = [
  { key: 'history', genre: 'History', enabled: true, weight: 84, usedRecently: true },
  { key: 'technology', genre: 'Technology', enabled: true, weight: 73, usedRecently: true },
  { key: 'science', genre: 'Science', enabled: true, weight: 77, usedRecently: true },
  { key: 'philosophy', genre: 'Philosophy', enabled: true, weight: 62, usedRecently: false },
  { key: 'fantasy', genre: 'Fantasy', enabled: true, weight: 58, usedRecently: false },
  { key: 'finance', genre: 'Finance', enabled: false, weight: 35, usedRecently: false },
  { key: 'horror', genre: 'Horror', enabled: false, weight: 41, usedRecently: false },
  { key: 'mystery', genre: 'Mystery', enabled: false, weight: 46, usedRecently: false },
  { key: 'true-crime', genre: 'True Crime', enabled: false, weight: 54, usedRecently: true },
  { key: 'space', genre: 'Space', enabled: false, weight: 52, usedRecently: false },
  { key: 'mythology', genre: 'Mythology', enabled: false, weight: 49, usedRecently: false },
  { key: 'psychology', genre: 'Psychology', enabled: false, weight: 57, usedRecently: true },
  { key: 'biography', genre: 'Biography', enabled: false, weight: 43, usedRecently: false },
  { key: 'cinema', genre: 'Cinema', enabled: false, weight: 45, usedRecently: false },
  { key: 'gaming', genre: 'Gaming', enabled: false, weight: 59, usedRecently: true },
  { key: 'music', genre: 'Music', enabled: false, weight: 48, usedRecently: false },
  { key: 'nature', genre: 'Nature', enabled: false, weight: 44, usedRecently: false },
  { key: 'politics', genre: 'Politics', enabled: false, weight: 51, usedRecently: true },
  { key: 'culture', genre: 'Culture', enabled: false, weight: 39, usedRecently: false },
  { key: 'education', genre: 'Education', enabled: false, weight: 56, usedRecently: true },
]

export const queueRows = [
  { key: 'q1', job: 'run_3928', topic: 'Roman Senate', priority: 'high', status: 'uploading' },
  { key: 'q2', job: 'run_3929', topic: 'Cold War trade routes', priority: 'medium', status: 'script_generation' },
  { key: 'q3', job: 'run_3930', topic: 'How GPUs became geopolitical', priority: 'medium', status: 'planning' },
]

export const liveLogs = [
  '[12:01] genre selected: history',
  '[12:02] trend search completed',
  '[12:03] topic chosen: roman senate',
  '[12:05] script generated',
  '[12:07] council score: 8.2',
  '[12:08] segment planning done',
  '[12:11] render started',
  '[12:14] upload token refreshed',
]

export const apiServices: ApiServiceRecord[] = [
  { key: 'openai', service: 'OpenAI / LLM', status: 'healthy', configured: true, lastCheck: '2 mins ago' },
  { key: 'qwen', service: 'Qwen', status: 'healthy', configured: true, lastCheck: '5 mins ago' },
  { key: 'search', service: 'Search API', status: 'warning', configured: true, lastCheck: '17 mins ago' },
  { key: 'tts', service: 'TTS / Video Generator', status: 'healthy', configured: false, lastCheck: 'Never' },
]

export const pipelineSettingsDefaults = {
  scoreThreshold: 8.2,
  maxRewrites: 3,
  segmentDuration: 45,
  maxConcurrentJobs: 4,
  retryLimit: 2,
  autoResume: true,
}
