import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PipelineRealtimeSnapshot } from '../../types'
import { sectionTitleClass, surfaceClass } from '../../ui'

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

const testOptions: Array<{ value: ConnectionTestSelection; label: string }> = [
  { value: 'api_key|all', label: 'API Check' },
  { value: 'real_prompt|all', label: 'Model Check' },
  { value: 'real_prompt|selector', label: 'Model Check: Selector' },
  { value: 'real_prompt|script-writer', label: 'Model Check: Script Writer' },
  { value: 'real_prompt|research-expert', label: 'Model Check: Research Expert' },
  { value: 'real_prompt|strategy-expert', label: 'Model Check: Strategy Expert' },
  { value: 'real_prompt|quality-expert', label: 'Model Check: Quality Expert' },
  { value: 'real_prompt|director', label: 'Model Check: Director' },
  { value: 'real_prompt|cameraman', label: 'Model Check: Cameraman' },
  { value: 'real_prompt|video-gen', label: 'Model Check: Video Gen' },
]

function LivePipelineLogs({
  pipelineState,
  isConnected,
  testSelection,
  onTestSelectionChange,
  onTestConnection,
}: {
  pipelineState: PipelineRealtimeSnapshot
  isConnected: boolean
  testSelection: ConnectionTestSelection
  onTestSelectionChange: (value: ConnectionTestSelection) => void
  onTestConnection: () => void
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const dropdownMenuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0, width: 220 })

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      const clickedTrigger = dropdownRef.current?.contains(target)
      const clickedMenu = dropdownMenuRef.current?.contains(target)

      if (!clickedTrigger && !clickedMenu) {
        setIsDropdownOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
    }
  }, [])

  useEffect(() => {
    if (!isDropdownOpen) {
      return
    }

    function updateDropdownPosition() {
      const triggerElement = triggerRef.current
      if (!triggerElement) {
        return
      }

      const rect = triggerElement.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 10,
        right: window.innerWidth - rect.right,
        width: rect.width,
      })
    }

    updateDropdownPosition()
    window.addEventListener('resize', updateDropdownPosition)
    window.addEventListener('scroll', updateDropdownPosition, true)

    return () => {
      window.removeEventListener('resize', updateDropdownPosition)
      window.removeEventListener('scroll', updateDropdownPosition, true)
    }
  }, [isDropdownOpen])

  return (
    <article className={surfaceClass}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-[rgba(88,66,45,0.09)] px-4 py-4 md:px-8 md:py-6">
        <h2 className={`${sectionTitleClass} text-2xl md:text-[2rem]`}>Live Pipeline Logs</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={onTestConnection}
            className="rounded-full bg-[#cc7440] px-4 py-3 text-sm font-semibold text-[#fff7ef] min-h-[44px]"
          >
            {isConnected ? 'Test Connection' : 'Test Connection'}
          </button>
          <div ref={dropdownRef} className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => {
                setIsDropdownOpen((currentValue) => !currentValue)
              }}
              className="flex min-w-full sm:min-w-[220px] items-center justify-between rounded-full border border-[rgba(118,88,70,0.14)] bg-white px-4 py-3 text-sm font-medium text-[#765846] shadow-[0_10px_24px_rgba(82,58,43,0.06)] min-h-[44px]"
            >
              <span className="truncate text-xs sm:text-sm">{formatTestSelectionLabel(testSelection)}</span>
              <span
                className={`text-[#8b6a56] transition-transform ml-2 ${isDropdownOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              >
                ˅
              </span>
            </button>

            {isDropdownOpen ? (
              createPortal(
                <div
                  ref={dropdownMenuRef}
                  className="fixed z-[9999] max-h-[320px] overflow-y-auto rounded-2xl md:rounded-3xl border border-[rgba(118,88,70,0.14)] bg-white shadow-[0_20px_40px_rgba(82,58,43,0.14)]"
                  style={{
                    top: dropdownPosition.top,
                    right: dropdownPosition.right,
                    minWidth: Math.max(dropdownPosition.width, 200),
                    maxWidth: 'calc(100vw - 2rem)',
                  }}
                >
                  {testOptions.map((option) => {
                    const isActive = option.value === testSelection

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onTestSelectionChange(option.value)
                          setIsDropdownOpen(false)
                        }}
                        className={`flex w-full items-center justify-between px-4 py-3 md:px-5 md:py-4 text-left text-xs sm:text-sm font-medium ${
                          isActive
                            ? 'bg-[rgba(204,116,64,0.1)] text-[#cc7440]'
                            : 'text-[#765846] hover:bg-[rgba(118,88,70,0.05)]'
                        }`}
                      >
                        <span className="truncate">{option.label}</span>
                        {isActive ? <span className="text-[#cc7440] ml-2">•</span> : null}
                      </button>
                    )
                  })}
                </div>,
                document.body,
              )
            ) : null}
          </div>
        </div>
      </div>
      <div className="px-3 py-4 md:px-6 md:py-6">
        <div className="max-h-[320px] md:max-h-[420px] overflow-auto rounded-xl md:rounded-3xl border border-[rgba(88,66,45,0.08)] bg-transparent px-3 py-3 md:px-5 md:py-5 font-mono text-xs md:text-sm leading-6 md:leading-7 text-[#765846]">
          {pipelineState.logs.length > 0 ? (
            pipelineState.logs.map((logLine) => (
              <div key={logLine.id} className="break-words">
                <span className="text-[#8b6a56]">[{formatLogTime(logLine.timestamp)}]</span> {logLine.message}
              </div>
            ))
          ) : (
            <div>No pipeline activity yet.</div>
          )}
        </div>
      </div>
    </article>
  )
}

function formatTestSelectionLabel(value: ConnectionTestSelection): string {
  return testOptions.find((option) => option.value === value)?.label ?? 'API Check'
}

function formatLogTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default LivePipelineLogs
