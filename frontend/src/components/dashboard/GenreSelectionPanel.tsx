import { useEffect, useState, useRef } from 'react'
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
  const [touchDragging, setTouchDragging] = useState<string | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; key: string } | null>(null)

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

  const handleTouchStart = (e: React.TouchEvent, genreKey: string) => {
    if (disabled) return
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, key: genreKey }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || disabled) return
    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x)
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y)
    
    // Start dragging after minimal movement
    if ((deltaX > 5 || deltaY > 5) && !touchDragging) {
      setTouchDragging(touchStartRef.current.key)
      setDraggingKey(touchStartRef.current.key)
    }
  }

  const handleTouchEnd = (stackType?: StackType) => {
    if (touchDragging && stackType) {
      void moveGenre(touchDragging, stackType)
    }
    setTouchDragging(null)
    setDraggingKey(null)
    setActiveDropZone(null)
    touchStartRef.current = null
  }

  const handleGenreClick = (genreKey: string, currentEnabled: boolean) => {
    // On mobile, treat click as toggle between selected/pool
    if (window.innerWidth <= 768) {
      void moveGenre(genreKey, currentEnabled ? 'pool' : 'selected')
    }
  }

  const disabled = isLoading || isSaving

  return (
    <article className={`${surfaceClass} overflow-hidden`}>
      <div className="flex flex-col gap-4 border-b border-[rgba(88,66,45,0.09)] px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8">
        <h2 className={`${sectionTitleClass} text-2xl md:text-[2rem]`}>Genre Selection Panel</h2>
        <button
          type="button"
          onClick={() => {
            void handleSaveGenres()
          }}
          disabled={disabled || !hasPendingChanges}
          className="rounded-full bg-[#cc7440] px-6 py-4 text-base font-semibold text-[#fff7ef] disabled:cursor-not-allowed disabled:opacity-60 md:px-5 md:py-3 md:text-sm"
        >
          {isSaving ? 'Saving...' : 'Update Genres'}
        </button>
      </div>
      <div className="flex flex-col gap-6 px-4 py-6 md:px-6">
        <GenreStack
          title="Selected Genres"
          description={window.innerWidth <= 768 ? "Tap genres to move between lists" : "Drag active genres here."}
          genres={selectedGenres}
          stackType="selected"
          activeDropZone={activeDropZone}
          draggingKey={draggingKey}
          touchDragging={touchDragging}
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
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onGenreClick={handleGenreClick}
          emptyMessage={isLoading ? 'Loading genres...' : 'Drag or tap genres here to activate them.'}
          disabled={disabled}
        />

        <GenreStack
          title="Genre Pool"
          description={window.innerWidth <= 768 ? "Tap genres to move between lists" : "All available genres. Drag a genre up to enable it."}
          genres={genrePool}
          stackType="pool"
          activeDropZone={activeDropZone}
          draggingKey={draggingKey}
          touchDragging={touchDragging}
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
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onGenreClick={handleGenreClick}
          emptyMessage={isLoading ? 'Loading genres...' : 'All genres are currently active.'}
          disabled={disabled}
        />

        <div className="mt-4 rounded-2xl border border-[rgba(88,66,45,0.08)] bg-[rgba(255,248,239,0.55)] px-4 py-3 text-sm text-[#7a7167] md:hidden">
          <p className="font-medium">Mobile Tips:</p>
          <ul className="mt-1 list-disc pl-4">
            <li>Tap any genre to move it between lists</li>
            <li>Or touch & hold to drag (on supported devices)</li>
          </ul>
        </div>
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
  touchDragging,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onGenreClick,
  emptyMessage,
  disabled,
}: {
  title: string
  description: string
  genres: GenreRecord[]
  stackType: StackType
  activeDropZone: StackType | null
  draggingKey: string | null
  touchDragging: string | null
  onDragStart: (genreKey: string) => void
  onDragEnd: () => void
  onDragEnter: (stack: StackType | null) => void
  onDrop: (genreKey: string) => void
  onTouchStart: (e: React.TouchEvent, genreKey: string) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (stackType?: StackType) => void
  onGenreClick: (genreKey: string, currentEnabled: boolean) => void
  emptyMessage: string
  disabled: boolean
}) {
  const isActive = activeDropZone === stackType

  return (
    <section
      className={`rounded-3xl border border-dashed px-4 py-4 transition-colors md:px-5 md:py-5 ${
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
      onTouchMove={onTouchMove}
      onTouchEnd={() => onTouchEnd(stackType)}
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#765846] md:text-lg">{title}</h3>
        <p className={`${mutedLabelClass} mt-1 max-w-2xl text-sm`}>{description}</p>
      </div>

      {genres.length === 0 ? (
        <div className="rounded-2xl border border-[rgba(88,66,45,0.08)] bg-[rgba(255,248,239,0.55)] px-4 py-4 text-sm text-[#7a7167]">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 md:gap-3">
          {genres.map((genre) => (
            <button
              key={genre.key}
              type="button"
              draggable={!disabled && window.innerWidth > 768}
              onDragStart={(event) => {
                if (disabled) {
                  return
                }
                event.dataTransfer.setData('text/genre-key', genre.key)
                onDragStart(genre.key)
              }}
              onDragEnd={onDragEnd}
              onTouchStart={(e) => onTouchStart(e, genre.key)}
              onClick={() => onGenreClick(genre.key, genre.enabled)}
              className={`min-h-[44px] min-w-[44px] border border-[rgba(88,66,45,0.12)] bg-transparent px-3 py-2 font-mono text-sm text-[#5a4a3d] transition-all active:scale-95 ${
                draggingKey === genre.key || touchDragging === genre.key ? 'opacity-50 scale-95' : 'opacity-100 scale-100'
              } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-grab active:cursor-grabbing'}`}
              style={{ touchAction: 'pan-y' }}
            >
              <span className="inline-flex items-center gap-2 font-sans">
                <span aria-hidden="true" className="text-base">{genreIcons[genre.genre] ?? '•'}</span>
                <span className="text-sm md:text-sm">{genre.genre}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default GenreSelectionPanel
