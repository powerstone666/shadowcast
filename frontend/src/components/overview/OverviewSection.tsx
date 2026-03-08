import { useEffect, useState } from 'react'
import { fetchYoutubeOverview } from '../../services/youtubeOverview'
import type { OverviewPerformance, OverviewTrendPoint, VideoRecord, YoutubeOverviewResponse } from '../../types'
import AudienceGrowth from './AudienceGrowth'
import PerformancePanel from './PerformancePanel'
import RecentVideosTable from './RecentVideosTable'
import { surfaceClass } from '../../ui'

function OverviewSection() {
  const [overview, setOverview] = useState<YoutubeOverviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    void loadOverview()
  }, [])

  async function loadOverview() {
    setIsLoading(true)
    try {
      const nextOverview = await fetchYoutubeOverview()
      setOverview(nextOverview)
    } catch (error) {
      console.error('Failed to fetch YouTube overview:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const metricCards = overview?.metricCards ?? []
  const audienceGrowth = overview?.audienceGrowth ?? {
    views: '0',
    subscribers: '0',
    series: [] as OverviewTrendPoint[],
  }
  const recentVideos = overview?.recentVideos ?? ([] as VideoRecord[])
  const performance = overview?.performance ?? ({
    averageViews7d: '0',
    topGenre: 'Unavailable',
    lastUploadTime: 'Unavailable',
    weeklyGrowthPercent: 0,
  } satisfies OverviewPerformance)

  return (
    <section className="flex flex-col gap-4 md:gap-6 bg-transparent">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {(isLoading ? loadingMetricCards : metricCards).map((metric) => (
          <article key={metric.title} className={`${surfaceClass} px-4 py-4 md:px-6 md:py-6`}>
            <p className="text-xs md:text-sm font-medium text-[#7a7167]">{metric.title}</p>
            <p className="mt-2 md:mt-3 text-xl md:text-[1.65rem] font-semibold tracking-[-0.03em] text-[#22211f]">{metric.value}</p>
          </article>
        ))}
      </div>

      <section className="bg-transparent">
        <AudienceGrowth
          views={audienceGrowth.views}
          subscribers={audienceGrowth.subscribers}
          series={audienceGrowth.series}
        />
      </section>

      <div className="flex flex-col gap-4 md:gap-6">
        <RecentVideosTable videos={recentVideos} />
        <PerformancePanel performance={performance} />
      </div>
    </section>
  )
}

const loadingMetricCards = [
  { title: 'Subscribers', value: 'Loading...' },
  { title: 'Total Views', value: 'Loading...' },
  { title: 'Total Videos Uploaded', value: 'Loading...' },
  { title: 'Videos Uploaded (24h)', value: 'Loading...' },
  { title: 'Channel Status', value: 'Loading...' },
]

export default OverviewSection
