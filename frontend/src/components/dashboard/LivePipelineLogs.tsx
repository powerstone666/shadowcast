import { liveLogs } from '../../data'
import { sectionTitleClass, surfaceClass } from '../../ui'

function LivePipelineLogs() {
  return (
    <article className={`${surfaceClass} overflow-hidden`}>
      <div className="flex items-center justify-between gap-4 border-b border-[rgba(88,66,45,0.09)] px-8 py-6">
        <h2 className={sectionTitleClass}>Live Pipeline Logs</h2>
        <button
          type="button"
          className="rounded-full bg-[#cc7440] px-5 py-3 text-sm font-semibold text-[#fff7ef]"
        >
          Test Connection
        </button>
      </div>
      <div className="px-6 py-6">
        <div className="max-h-[420px] overflow-auto rounded-3xl border border-[rgba(88,66,45,0.08)] bg-transparent px-5 py-5 font-mono text-sm leading-7 text-[#765846]">
          {liveLogs.map((logLine) => (
            <div key={logLine}>{logLine}</div>
          ))}
        </div>
      </div>
    </article>
  )
}

export default LivePipelineLogs
