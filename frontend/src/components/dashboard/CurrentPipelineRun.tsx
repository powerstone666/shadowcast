import { activeStageIndex, pipelineStages } from '../../data'
import { sectionTitleClass, surfaceClass } from '../../ui'

function CurrentPipelineRun() {
  return (
    <article className={`${surfaceClass} px-8 py-7`}>
      <h2 className={sectionTitleClass}>Current Pipeline Run</h2>
      <div className="mt-6 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        {pipelineStages.map((stage, index) => {
          const state = index < activeStageIndex ? 'complete' : index === activeStageIndex ? 'active' : 'idle'

          return (
            <div key={stage} className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                  state === 'complete'
                    ? 'border-[#cc7440] bg-[#cc7440] text-[#fff7ef]'
                    : state === 'active'
                      ? 'border-[#cc7440] bg-[rgba(204,116,64,0.12)] text-[#cc7440]'
                      : 'border-[rgba(88,66,45,0.14)] bg-[rgba(255,255,255,0.5)] text-[#8c7c70]'
                }`}
              >
                {index + 1}
              </div>
              <span className="text-sm font-medium capitalize text-[#5a4a3d]">{stage.replaceAll('_', ' ')}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-6">
        <div className="h-3 overflow-hidden rounded-full bg-[rgba(88,66,45,0.08)]">
          <div className="h-full w-[72%] rounded-full bg-[#cc7440]" />
        </div>
        <p className="mt-3 text-sm text-[#7a7167]">Active stage: media_generation</p>
      </div>
    </article>
  )
}

export default CurrentPipelineRun
