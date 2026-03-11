import type { ApiServiceRecord, GenreRecord, NavigationKey, PipelineStage, VideoRecord } from './types'

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

export const pipelineStages: PipelineStage[] = [
  { key: 'genre_selection', label: 'Genre Selection' },
  { key: 'script_generation', label: 'Script Generation' },
  { key: 'council_review', label: 'Council Review' },
  { key: 'director_plan', label: 'Director Plan' },
  { key: 'cameraman_plan', label: 'Cameraman Plan' },
  { key: 'video_generation', label: 'Video Generation' },
  { key: 'youtube_publish', label: 'YouTube Publish' },
]

export const initialGenres: GenreRecord[] = [
  { key: 'mythology', genre: 'Mythology', enabled: true, weight: 90, usedRecently: false },
  { key: 'horror', genre: 'Horror', enabled: true, weight: 88, usedRecently: false },
  { key: 'supernatural', genre: 'Supernatural', enabled: true, weight: 85, usedRecently: false },
  { key: 'fantasy', genre: 'Fantasy', enabled: true, weight: 82, usedRecently: false },
  { key: 'geopolitics', genre: 'Geopolitics', enabled: true, weight: 80, usedRecently: false },
  { key: 'technology', genre: 'Technology', enabled: true, weight: 78, usedRecently: false },
  { key: 'science', genre: 'Science', enabled: true, weight: 76, usedRecently: false },
  { key: 'sports', genre: 'Sports', enabled: true, weight: 74, usedRecently: false },
  { key: 'biography', genre: 'Biography', enabled: true, weight: 72, usedRecently: false },
  { key: 'history', genre: 'History', enabled: true, weight: 70, usedRecently: false },
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
