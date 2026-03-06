import type { OverviewPerformance } from '../../types'
import { mutedLabelClass, sectionTitleClass, surfaceClass, valueClass } from '../../ui'

function PerformancePanel({ performance }: { performance: OverviewPerformance }) {
  return (
    <article className={`${surfaceClass} px-8 py-8`}>
      <h2 className={sectionTitleClass}>Performance Panel</h2>
      <div className="mt-6 flex flex-col gap-6">
        <div>
          <p className={mutedLabelClass}>Avg Views (7 days)</p>
          <p className={getPerformanceValueClass(performance.averageViews7d)}>{performance.averageViews7d}</p>
        </div>
        <div>
          <p className={mutedLabelClass}>Top Performing Genre</p>
          <p className={getPerformanceValueClass(performance.topGenre)}>{performance.topGenre}</p>
        </div>
        <div>
          <p className={mutedLabelClass}>Last Upload Time</p>
          <p className={getPerformanceValueClass(performance.lastUploadTime)}>{performance.lastUploadTime}</p>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className={mutedLabelClass}>Weekly growth</p>
            <span className="text-sm font-semibold text-[#765846]">{performance.weeklyGrowthPercent}%</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[rgba(118,88,70,0.10)]">
            <div
              className="h-full rounded-full bg-[#cc7440]"
              style={{ width: `${Math.min(100, Math.max(0, performance.weeklyGrowthPercent))}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  )
}

function getPerformanceValueClass(value: string): string {
  if (value === 'Unavailable') {
    return 'mt-2 text-base font-medium text-[#7a7167]'
  }

  return valueClass
}

export default PerformancePanel
