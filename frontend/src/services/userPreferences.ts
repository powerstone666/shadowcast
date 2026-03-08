import type { AudioLanguagePreference } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

export async function fetchAudioLanguagePreference(): Promise<AudioLanguagePreference> {
  const response = await fetch(`${apiBaseUrl}/setup/audio-language`)
  const data = (await response.json()) as AudioLanguagePreference & { error?: string }

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to load audio language preference')
  }

  return {
    language: data.language ?? 'english',
  }
}

export async function saveAudioLanguagePreference(language: 'english' | 'hindi'): Promise<AudioLanguagePreference> {
  const response = await fetch(`${apiBaseUrl}/setup/audio-language`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ language }),
  })

  const data = (await response.json()) as AudioLanguagePreference & { error?: string }

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to save audio language preference')
  }

  return data
}