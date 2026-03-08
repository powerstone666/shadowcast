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
      <div className="border-b border-[rgba(88,66,45,0.09)] px-4 py-4 md:px-8 md:py-6">
        <h2 className={`${sectionTitleClass} text-2xl md:text-[2rem]`}>Recent Videos</h2>
      </div>
      <div className="overflow-x-auto px-2 py-2 md:px-4 md:py-4">
        <table className="min-w-full border-separate border-spacing-y-1 md:border-spacing-y-2 text-left">
          <thead>
            <tr className={`${mutedLabelClass} text-left text-xs md:text-sm`}>
              <th className="px-2 py-1 md:px-4 md:py-2">Title</th>
              <th className="px-2 py-1 md:px-4 md:py-2 hidden sm:table-cell">Genre</th>
              <th className="px-2 py-1 md:px-4 md:py-2 hidden md:table-cell">Publish Time</th>
              <th className="px-2 py-1 md:px-4 md:py-2">Views</th>
              <th className="px-2 py-1 md:px-4 md:py-2">Status</th>
              <th className="px-2 py-1 md:px-4 md:py-2 hidden lg:table-cell">Run ID</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.key} className="bg-transparent text-[#34271f] text-xs md:text-sm">
                <td className="rounded-l-2xl px-2 py-2 md:px-4 md:py-4 font-medium truncate max-w-[120px] md:max-w-none">{video.title}</td>
                <td className="px-2 py-2 md:px-4 md:py-4 hidden sm:table-cell">{video.genre}</td>
                <td className="px-2 py-2 md:px-4 md:py-4 hidden md:table-cell">{video.publishTime}</td>
                <td className="px-2 py-2 md:px-4 md:py-4">{video.views}</td>
                <td className="px-2 py-2 md:px-4 md:py-4">
                  <span className={`rounded-full px-2 py-0.5 md:px-3 md:py-1 text-xs font-semibold ${statusClasses[video.status]}`}>
                    {video.status}
                  </span>
                </td>
                <td className="rounded-r-2xl px-2 py-2 md:px-4 md:py-4 font-mono text-xs md:text-sm hidden lg:table-cell truncate max-w-[80px] md:max-w-none">{video.runId}</td>
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
      <div className="px-4 py-3 text-xs text-[#7a7167] border-t border-[rgba(88,66,45,0.05)] md:hidden">
        <p className="font-medium">Mobile View:</p>
        <p className="mt-1">Swipe left/right to see more columns. Some columns hidden on small screens.</p>
      </div>
    </article>
  )
}

export default RecentVideosTable
