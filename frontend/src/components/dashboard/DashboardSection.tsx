import { useEffect, useRef, useState } from 'react'
import { runWorkflow, terminateWorkflow } from '../../services/orchestration'
import { createPipelineSocket } from '../../services/pipelineSocket'
import type { PipelineRealtimeSnapshot, PipelineSocketEvent } from '../../types'
import CurrentPipelineRun from './CurrentPipelineRun'
import GenreSelectionPanel from './GenreSelectionPanel'
import LivePipelineLogs from './LivePipelineLogs'

const RECONNECT_DELAY_MS = 1500
const HEARTBEAT_INTERVAL_MS = 25000

const defaultPipelineState: PipelineRealtimeSnapshot = {
  started: false,
  isRunning: false,
  runOutcome: null,
  activeStageKey: null,
  completedStageKeys: [],
  lastCompletedStageKey: null,
  logs: [],
}

type ConnectionTestSelection =
  | 'api_key|all'
  | 'real_prompt|all'
  | 'real_prompt|selector'
  | 'real_prompt|script-writer'
  | 'real_prompt|research-expert'
  | 'real_prompt|strategy-expert'
  | 'real_prompt|quality-expert'
  | 'real_prompt|director'
  | 'real_prompt|cameraman'
  | 'real_prompt|video-gen'

function DashboardSection() {
  const [pipelineState, setPipelineState] = useState<PipelineRealtimeSnapshot>(defaultPipelineState)
  const [isConnected, setIsConnected] = useState(false)
  const [isStartingWorkflow, setIsStartingWorkflow] = useState(false)
  const [isTerminatingWorkflow, setIsTerminatingWorkflow] = useState(false)
  const [testSelection, setTestSelection] = useState<ConnectionTestSelection>('api_key|all')
  const socketRef = useRef<WebSocket | null>(null)
  const shouldRunConnectionTestRef = useRef(false)
  const reconnectTimerRef = useRef<number | null>(null)
  const heartbeatTimerRef = useRef<number | null>(null)
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    isUnmountedRef.current = false
    connectSocket()

    return () => {
      isUnmountedRef.current = true
      clearReconnectTimer()
      clearHeartbeatTimer()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

  function connectSocket() {
    if (isUnmountedRef.current) {
      return
    }

    clearReconnectTimer()
    clearHeartbeatTimer()
    socketRef.current?.close()

    const socket = createPipelineSocket(handleSocketEvent, () => {
      setIsConnected(true)
      startHeartbeat(socket)
      if (shouldRunConnectionTestRef.current) {
        sendTestConnection(socket, testSelection)
        shouldRunConnectionTestRef.current = false
      }
    }, () => {
      setIsConnected(false)
      clearHeartbeatTimer()
      scheduleReconnect()
    })

    socketRef.current = socket
  }

  function scheduleReconnect() {
    if (isUnmountedRef.current || reconnectTimerRef.current !== null) {
      return
    }

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null
      connectSocket()
    }, RECONNECT_DELAY_MS)
  }

  function clearReconnectTimer() {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }

  function startHeartbeat(socket: WebSocket) {
    clearHeartbeatTimer()

    heartbeatTimerRef.current = window.setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        return
      }

      socket.send(
        JSON.stringify({
          type: 'ping',
        }),
      )
    }, HEARTBEAT_INTERVAL_MS)
  }

  function clearHeartbeatTimer() {
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }

  function handleSocketEvent(event: PipelineSocketEvent) {
    if (event.type === 'snapshot') {
      setPipelineState(event.payload)
    }
  }

  function handleTestConnection() {
    const socket = socketRef.current

    if (!socket || socket.readyState === WebSocket.CLOSED) {
      shouldRunConnectionTestRef.current = true
      connectSocket()
      return
    }

    if (socket.readyState === WebSocket.OPEN) {
      sendTestConnection(socket, testSelection)
      return
    }

    if (socket.readyState === WebSocket.CONNECTING) {
      shouldRunConnectionTestRef.current = true
    }
  }

  async function handleRunWorkflow(note?: string) {
    if (pipelineState.isRunning || isStartingWorkflow) {
      return
    }

    setIsStartingWorkflow(true)
    try {
      await runWorkflow(note)
    } catch {
    } finally {
      setIsStartingWorkflow(false)
    }
  }

  async function handleTerminateWorkflow() {
    if (!pipelineState.isRunning || isTerminatingWorkflow) {
      return
    }

    setIsTerminatingWorkflow(true)
    try {
      await terminateWorkflow()
    } catch {
    } finally {
      setIsTerminatingWorkflow(false)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <CurrentPipelineRun
        pipelineState={pipelineState}
        isStartingWorkflow={isStartingWorkflow}
        isTerminatingWorkflow={isTerminatingWorkflow}
        onRunWorkflow={(note) => {
          void handleRunWorkflow(note)
        }}
        onTerminateWorkflow={() => {
          void handleTerminateWorkflow()
        }}
      />
      <LivePipelineLogs
        pipelineState={pipelineState}
        isConnected={isConnected}
        testSelection={testSelection}
        onTestSelectionChange={setTestSelection}
        onTestConnection={handleTestConnection}
      />
      <GenreSelectionPanel />
    </section>
  )
}

export default DashboardSection

function sendTestConnection(socket: WebSocket, selection: ConnectionTestSelection) {
  const [mode, roleKey] = selection.split('|')

  socket.send(
    JSON.stringify({
      type: 'test_connection',
      mode,
      ...(roleKey && roleKey !== 'all' ? { roleKey } : {}),
    }),
  )
}
