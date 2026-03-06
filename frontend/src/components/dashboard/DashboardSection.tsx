import CurrentPipelineRun from './CurrentPipelineRun'
import GenreSelectionPanel from './GenreSelectionPanel'
import LivePipelineLogs from './LivePipelineLogs'

function DashboardSection() {
  return (
    <section className="flex flex-col gap-6">
      <CurrentPipelineRun />
      <LivePipelineLogs />
      <GenreSelectionPanel />
    </section>
  )
}

export default DashboardSection
