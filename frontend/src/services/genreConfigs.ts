import type { GenrePool } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

export async function fetchGenrePool(): Promise<GenrePool> {
  const response = await fetch(`${apiBaseUrl}/setup/genres`)
  const data = (await response.json()) as GenrePool & { error?: string }

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to load genre pool')
  }

  return {
    selectedGenres: data.selectedGenres ?? [],
  }
}

export async function saveGenrePool(genrePool: GenrePool): Promise<GenrePool> {
  const response = await fetch(`${apiBaseUrl}/setup/genres`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(genrePool),
  })

  const data = (await response.json()) as GenrePool & { error?: string }

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to save genre pool')
  }

  return {
    selectedGenres: data.selectedGenres ?? [],
  }
}

