import { useEffect, useState } from 'react'
import { initialGenres } from '../../data'
import { fetchGenrePool, saveGenrePool } from '../../services/genreConfigs'
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
  const [lastSavedGenres, setLastSavedGenres] = useState(initialGenres)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [activeDropZone, setActiveDropZone] = useState<StackType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    void loadGenrePool()
  }, [])

  const selectedGenres = genres.filter((genre) => genre.enabled)
  const genrePool = genres.filter((genre) => !genre.enabled)

  async function loadGenrePool() {
    setIsLoading(true)
    try {
      const storedGenrePool = await fetchGenrePool()
      const selectedGenreSet = new Set(storedGenrePool.selectedGenres)
      setGenres((currentGenres) =>
        currentGenres.map((genre) => ({
          ...genre,
          enabled: selectedGenreSet.has(genre.genre),
        })),
      )
      setLastSavedGenres((currentGenres) =>
        currentGenres.map((genre) => ({
          ...genre,
          enabled: selectedGenreSet.has(genre.genre),
        })),
      )
    } catch {
    } finally {
      setIsLoading(false)
    }
  }

  async function moveGenre(genreKey: string, destination: StackType) {
    const nextGenres = genres.map((genre) =>
        genre.key === genreKey
          ? {
              ...genre,
              enabled: destination === 'selected',
            }
          : genre,
      )

    setGenres(nextGenres)
  }

  async function handleSaveGenres() {
    const currentGenresSnapshot = genres.map((genre) => ({ ...genre }))
    setIsSaving(true)
    try {
      const nextSelectedGenres = currentGenresSnapshot
        .filter((genre) => genre.enabled)
        .map((genre) => genre.genre)

      const savedGenrePool = await saveGenrePool({
        selectedGenres: nextSelectedGenres,
      })
      const savedGenreSet = new Set(savedGenrePool.selectedGenres)
      const syncedGenres = currentGenresSnapshot.map((genre) => ({
        ...genre,
        enabled: savedGenreSet.has(genre.genre),
      }))

      setGenres(syncedGenres)
      setLastSavedGenres(syncedGenres)
    } catch {
      setGenres(lastSavedGenres.map((genre) => ({ ...genre })))
    } finally {
      setIsSaving(false)
    }
  }

  const hasPendingChanges = genres.some((genre, index) => genre.enabled !== lastSavedGenres[index]?.enabled)

  return (
    <article className={`${surfaceClass} overflow-hidden`}>
      <div className="flex items-center justify-between gap-4 border-b border-[rgba(88,66,45,0.09)] px-8 py-6">
        <h2 className={sectionTitleClass}>Genre Selection Panel</h2>
        <button
          type="button"
          onClick={() => {
            void handleSaveGenres()
          }}
          disabled={isLoading || isSaving || !hasPendingChanges}
          className="rounded-full bg-[#cc7440] px-5 py-3 text-sm font-semibold text-[#fff7ef] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Update Genres'}
        </button>
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
            void moveGenre(genreKey, 'selected')
            setDraggingKey(null)
            setActiveDropZone(null)
          }}
          emptyMessage={isLoading ? 'Loading genres...' : 'Drag genres here to activate them.'}
          disabled={isLoading || isSaving}
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
            void moveGenre(genreKey, 'pool')
            setDraggingKey(null)
            setActiveDropZone(null)
          }}
          emptyMessage={isLoading ? 'Loading genres...' : 'All genres are currently active.'}
          disabled={isLoading || isSaving}
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
  disabled,
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
  disabled: boolean
}) {
  const isActive = activeDropZone === stackType

  return (
    <section
      className={`rounded-3xl border border-dashed px-5 py-5 transition-colors ${
        isActive ? 'border-[#cc7440] bg-[rgba(204,116,64,0.06)]' : 'border-[rgba(88,66,45,0.12)] bg-transparent'
      }`}
      onDragOver={(event) => {
        if (disabled) {
          return
        }
        event.preventDefault()
        onDragEnter(stackType)
      }}
      onDragEnter={() => {
        if (!disabled) {
          onDragEnter(stackType)
        }
      }}
      onDragLeave={() => {
        if (!disabled) {
          onDragEnter(null)
        }
      }}
      onDrop={(event) => {
        if (disabled) {
          return
        }
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
              draggable={!disabled}
              onDragStart={(event) => {
                if (disabled) {
                  return
                }
                event.dataTransfer.setData('text/genre-key', genre.key)
                onDragStart(genre.key)
              }}
              onDragEnd={onDragEnd}
              className={`border border-[rgba(88,66,45,0.12)] bg-transparent px-3 py-2 font-mono text-sm text-[#5a4a3d] transition-opacity ${
                draggingKey === genre.key ? 'opacity-50' : 'opacity-100'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
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
