import { Line } from '@ant-design/plots'
import type { OverviewTrendPoint } from '../../types'
import { mutedLabelClass, surfaceClass } from '../../ui'

function AudienceGrowth({
  views,
  subscribers,
  series,
}: {
  views: string
  subscribers: string
  series: OverviewTrendPoint[]
}) {
  const lineConfig = {
    data: series,
    xField: 'day',
    yField: 'value',
    colorField: 'metric',
    shapeField: 'smooth',
    axis: {
      x: {
        title: false,
        labelFill: '#765846',
        line: true,
        lineStroke: 'rgba(118,88,70,0.15)',
        tick: false,
      },
      y: {
        title: false,
        labelFill: '#765846',
        grid: true,
        gridStroke: 'rgba(118,88,70,0.10)',
      },
    },
    scale: {
      color: {
        range: ['#ff0033', '#765846'],
      },
    },
    style: {
      lineWidth: 4,
    },
    point: {
      size: 4,
      shape: 'circle',
      style: {
        lineWidth: 3,
        stroke: '#efeeea',
      },
    },
    legend: {
      position: 'top',
      itemLabelFill: '#765846',
      marker: 'circle',
    },
    tooltip: {
      title: (datum: { day: string }) => datum.day,
    },
    theme: {
      viewStyle: {
        backgroundFill: 'transparent',
      },
      plotCfg: {
        backgroundFill: 'transparent',
      },
    },
    height: 420,
    autoFit: true,
  } as const

  return (
    <section className={`${surfaceClass} px-4 py-4`}>
      <div className="px-2 py-3">
        <h2 className="font-[Iowan_Old_Style,Palatino_Linotype,Book_Antiqua,Georgia,serif] text-[2rem] font-semibold tracking-[-0.02em] text-[#765846]">
          Audience Growth
        </h2>
      </div>
      <div className="mt-4 flex flex-wrap gap-8 px-2">
        <div>
          <p className={mutedLabelClass}>Views</p>
          <p className="font-[Iowan_Old_Style,Palatino_Linotype,Book_Antiqua,Georgia,serif] text-[2rem] font-semibold leading-[1.1] text-[#765846]">
            {views}
          </p>
        </div>
        <div>
          <p className={mutedLabelClass}>Subscribers</p>
          <p className="font-[Iowan_Old_Style,Palatino_Linotype,Book_Antiqua,Georgia,serif] text-[2rem] font-semibold leading-[1.1] text-[#765846]">
            {subscribers}
          </p>
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-3xl px-2 py-2">
        {series.length > 0 ? (
          <Line {...lineConfig} />
        ) : (
          <div className="flex h-[420px] items-center justify-center text-sm font-medium text-[#765846]">
            No audience data available yet.
          </div>
        )}
      </div>
    </section>
  )
}

export default AudienceGrowth
