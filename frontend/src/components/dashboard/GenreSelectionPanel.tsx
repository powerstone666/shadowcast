import { useState } from 'react'
import { initialGenres } from '../../data'
import type { GenreRecord } from '../../types'
import { mutedLabelClass, sectionTitleClass, surfaceClass } from '../../ui'

type StackType = 'selected' | 'pool'

const genreIcons: Record<string, string> = {
  History: '🏺',
  Technology: '💻',
  Science: '🔬',
  Philosophy: '🧠',
  Fantasy: '🐉',
  Finance: '💹',
  Horror: '🩸',
  Mystery: '🕵️',
  'True Crime': '🔍',
  Space: '🚀',
  Mythology: '⚡',
  Psychology: '🫀',
  Biography: '📖',
  Cinema: '🎬',
  Gaming: '🎮',
  Music: '🎵',
  Nature: '🌿',
  Politics: '🏛️',
  Culture: '🎭',
  Education: '🎓',
}

function GenreSelectionPanel() {
  const [genres, setGenres] = useState(initialGenres)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [activeDropZone, setActiveDropZone] = useState<StackType | null>(null)

  const selectedGenres = genres.filter((genre) => genre.enabled)
  const genrePool = genres.filter((genre) => !genre.enabled)

  const moveGenre = (genreKey: string, destination: StackType) => {
    setGenres((currentGenres) =>
      currentGenres.map((genre) =>
        genre.key === genreKey
          ? {
              ...genre,
              enabled: destination === 'selected',
            }
          : genre,
      ),
    )
  }

  return (
    <article className={`${surfaceClass} overflow-hidden`}>
      <div className="border-b border-[rgba(88,66,45,0.09)] px-8 py-6">
        <h2 className={sectionTitleClass}>Genre Selection Panel</h2>
      </div>
      <div className="flex flex-col gap-6 px-6 py-6">
        <GenreStack
          title="Selected Genres"
          description="Drag active genres here."
          genres={selectedGenres}
          stackType="selected"
          activeDropZone={activeDropZone}
          draggingKey={draggingKey}
          onDragStart={setDraggingKey}
          onDragEnd={() => {
            setDraggingKey(null)
            setActiveDropZone(null)
          }}
          onDragEnter={setActiveDropZone}
          onDrop={(genreKey) => {
            moveGenre(genreKey, 'selected')
            setDraggingKey(null)
            setActiveDropZone(null)
          }}
          emptyMessage="Drag genres here to activate them."
        />

        <GenreStack
          title="Genre Pool"
          description="All available genres. Drag a genre up to enable it."
          genres={genrePool}
          stackType="pool"
          activeDropZone={activeDropZone}
          draggingKey={draggingKey}
          onDragStart={setDraggingKey}
          onDragEnd={() => {
            setDraggingKey(null)
            setActiveDropZone(null)
          }}
          onDragEnter={setActiveDropZone}
          onDrop={(genreKey) => {
            moveGenre(genreKey, 'pool')
            setDraggingKey(null)
            setActiveDropZone(null)
          }}
          emptyMessage="All genres are currently active."
        />
      </div>
    </article>
  )
}

function GenreStack({
  title,
  description,
  genres,
  stackType,
  activeDropZone,
  draggingKey,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
  emptyMessage,
}: {
  title: string
  description: string
  genres: GenreRecord[]
  stackType: StackType
  activeDropZone: StackType | null
  draggingKey: string | null
  onDragStart: (genreKey: string) => void
  onDragEnd: () => void
  onDragEnter: (stack: StackType | null) => void
  onDrop: (genreKey: string) => void
  emptyMessage: string
}) {
  const isActive = activeDropZone === stackType

  return (
    <section
      className={`rounded-3xl border border-dashed px-5 py-5 transition-colors ${
        isActive ? 'border-[#cc7440] bg-[rgba(204,116,64,0.06)]' : 'border-[rgba(88,66,45,0.12)] bg-transparent'
      }`}
      onDragOver={(event) => {
        event.preventDefault()
        onDragEnter(stackType)
      }}
      onDragEnter={() => onDragEnter(stackType)}
      onDragLeave={() => onDragEnter(null)}
      onDrop={(event) => {
        event.preventDefault()
        const genreKey = event.dataTransfer.getData('text/genre-key')
        if (genreKey) {
          onDrop(genreKey)
        }
      }}
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#765846]">{title}</h3>
        <p className={`${mutedLabelClass} mt-1 max-w-2xl`}>{description}</p>
      </div>

      {genres.length === 0 ? (
        <div className="rounded-2xl border border-[rgba(88,66,45,0.08)] bg-[rgba(255,248,239,0.55)] px-4 py-4 text-sm text-[#7a7167]">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {genres.map((genre) => (
            <button
              key={genre.key}
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/genre-key', genre.key)
                onDragStart(genre.key)
              }}
              onDragEnd={onDragEnd}
              className={`border border-[rgba(88,66,45,0.12)] bg-transparent px-3 py-2 font-mono text-sm text-[#5a4a3d] transition-opacity ${
                draggingKey === genre.key ? 'opacity-50' : 'opacity-100'
              }`}
            >
              <span className="inline-flex items-center gap-2 font-sans">
                <span aria-hidden="true">{genreIcons[genre.genre] ?? '•'}</span>
                <span>{genre.genre}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default GenreSelectionPanel
