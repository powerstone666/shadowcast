import type { VideoRecord } from '../../types'
import { mutedLabelClass, sectionTitleClass, surfaceClass } from '../../ui'

const statusClasses: Record<VideoRecord['status'], string> = {
  uploaded: 'bg-[rgba(204,116,64,0.12)] text-[#cc7440]',
  processing: 'bg-[rgba(118,88,70,0.12)] text-[#765846]',
  failed: 'bg-[rgba(255,0,51,0.12)] text-[#ff0033]',
}

function RecentVideosTable({ videos }: { videos: VideoRecord[] }) {
  return (
    <article className={`${surfaceClass} overflow-hidden`}>
      <div className="border-b border-[rgba(88,66,45,0.09)] px-8 py-6">
        <h2 className={sectionTitleClass}>Recent Videos</h2>
      </div>
      <div className="overflow-x-auto px-4 py-4">
        <table className="min-w-full border-separate border-spacing-y-2 text-left">
          <thead>
            <tr className={`${mutedLabelClass} text-left`}>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Genre</th>
              <th className="px-4 py-2">Publish Time</th>
              <th className="px-4 py-2">Views</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Run ID</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.key} className="bg-transparent text-[#34271f]">
                <td className="rounded-l-2xl px-4 py-4 font-medium">{video.title}</td>
                <td className="px-4 py-4">{video.genre}</td>
                <td className="px-4 py-4">{video.publishTime}</td>
                <td className="px-4 py-4">{video.views}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[video.status]}`}>
                    {video.status}
                  </span>
                </td>
                <td className="rounded-r-2xl px-4 py-4 font-mono text-sm">{video.runId}</td>
              </tr>
            ))}
            {videos.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm font-medium text-[#7a7167]">
                  No uploaded videos available for this channel yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </article>
  )
}

export default RecentVideosTable
