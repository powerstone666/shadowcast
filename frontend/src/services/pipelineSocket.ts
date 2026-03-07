import type { PipelineSocketEvent } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

export function getPipelineSocketUrl(): string {
  const url = new URL(apiBaseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/pipeline'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function createPipelineSocket(
  onEvent: (event: PipelineSocketEvent) => void,
  onOpen?: () => void,
  onClose?: () => void,
): WebSocket {
  const socket = new WebSocket(getPipelineSocketUrl())

  socket.addEventListener('open', () => {
    onOpen?.()
  })

  socket.addEventListener('close', () => {
    onClose?.()
  })

  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data) as PipelineSocketEvent
      onEvent(payload)
    } catch {
      // Ignore malformed websocket payloads.
    }
  })

  return socket
}
