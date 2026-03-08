import { useEffect, useState } from 'react'
import { fetchAgentConfigs, saveAgentConfig } from '../../services/agentConfigs'
import { fetchYoutubeOAuthStatus, getYoutubeOAuthStartUrl } from '../../services/youtubeOAuth'
import { fetchAudioLanguagePreference, saveAudioLanguagePreference } from '../../services/userPreferences'
import type { AgentRoleConfig, YoutubeOAuthStatus, AudioLanguagePreference } from '../../types'
import { mutedLabelClass, sectionTitleClass, surfaceClass } from '../../ui'

const baseInputClass =
  'w-full rounded-2xl border border-[rgba(118,88,70,0.14)] bg-white px-4 py-3 text-[#2b2019] outline-none placeholder:text-[#a09589] text-sm md:text-base'

const councilExperts = [
  { id: 'research-expert', label: 'Research Expert' },
  { id: 'strategy-expert', label: 'Strategy Expert' },
  { id: 'quality-expert', label: 'Quality Expert' },
]

const defaultRoleConfigs: Record<string, AgentRoleConfig> = {
  selector: { roleKey: 'selector', apiUrl: '', apiKey: '', modelName: '' },
  'script-writer': { roleKey: 'script-writer', apiUrl: '', apiKey: '', modelName: '' },
  'research-expert': { roleKey: 'research-expert', apiUrl: '', apiKey: '', modelName: '' },
  'strategy-expert': { roleKey: 'strategy-expert', apiUrl: '', apiKey: '', modelName: '' },
  'quality-expert': { roleKey: 'quality-expert', apiUrl: '', apiKey: '', modelName: '' },
  director: { roleKey: 'director', apiUrl: '', apiKey: '', modelName: '' },
  cameraman: { roleKey: 'cameraman', apiUrl: '', apiKey: '', modelName: '' },
  'video-gen': { roleKey: 'video-gen', apiUrl: '', apiKey: '', modelName: '' },
}

function ApiConfigurationSection() {
  const [oauthStatus, setOauthStatus] = useState<YoutubeOAuthStatus>({ connected: false })
  const [isLoadingOauthStatus, setIsLoadingOauthStatus] = useState(true)
  const [isRefreshingOauth, setIsRefreshingOauth] = useState(false)
  const [agentConfigs, setAgentConfigs] = useState<Record<string, AgentRoleConfig>>(defaultRoleConfigs)
  const [activeSaveKey, setActiveSaveKey] = useState<string | null>(null)
  const [isLoadingAgentConfigs, setIsLoadingAgentConfigs] = useState(true)
  const [successToast, setSuccessToast] = useState<string | null>(null)
  const [audioLanguage, setAudioLanguage] = useState<AudioLanguagePreference>({ language: 'english' })
  const [isLoadingAudioLanguage, setIsLoadingAudioLanguage] = useState(true)
  const [isSavingAudioLanguage, setIsSavingAudioLanguage] = useState(false)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const oauthResult = searchParams.get('yt_oauth')
    const oauthResultMessage = searchParams.get('message')

    if (oauthResult || oauthResultMessage || searchParams.get('section')) {
      searchParams.delete('yt_oauth')
      searchParams.delete('message')
      searchParams.delete('section')

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', nextUrl)
    }

    void loadOauthStatus()
    void loadAgentConfigs()
    void loadAudioLanguage()
  }, [])

  useEffect(() => {
    if (!successToast) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessToast(null)
    }, 2500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [successToast])

  async function loadOauthStatus() {
    setIsLoadingOauthStatus(true)
    try {
      const nextStatus = await fetchYoutubeOAuthStatus()
      setOauthStatus(nextStatus)
    } catch {
    } finally {
      setIsLoadingOauthStatus(false)
    }
  }

  async function handleRefreshOauth() {
    setIsRefreshingOauth(true)

    try {
      const nextStatus = await fetchYoutubeOAuthStatus()
      setOauthStatus(nextStatus)
    } catch {
    } finally {
      setIsRefreshingOauth(false)
    }
  }

  async function loadAgentConfigs() {
    setIsLoadingAgentConfigs(true)
    try {
      const configs = await fetchAgentConfigs()
      setAgentConfigs((currentConfigs) => {
        const nextConfigs = { ...currentConfigs }
        for (const config of configs) {
          nextConfigs[config.roleKey] = config
        }
        return nextConfigs
      })
    } catch {
    } finally {
      setIsLoadingAgentConfigs(false)
    }
  }

  async function loadAudioLanguage() {
    setIsLoadingAudioLanguage(true)
    try {
      const languagePref = await fetchAudioLanguagePreference()
      setAudioLanguage(languagePref)
    } catch {
    } finally {
      setIsLoadingAudioLanguage(false)
    }
  }

  async function handleSaveAudioLanguage(language: 'english' | 'hindi') {
    setIsSavingAudioLanguage(true)
    try {
      const savedPref = await saveAudioLanguagePreference(language)
      setAudioLanguage(savedPref)
      setSuccessToast(`Audio language updated to ${language}`)
    } catch {
    } finally {
      setIsSavingAudioLanguage(false)
    }
  }

  function updateRoleConfig(roleKey: string, field: keyof Omit<AgentRoleConfig, 'roleKey'>, value: string) {
    setAgentConfigs((currentConfigs) => ({
      ...currentConfigs,
      [roleKey]: {
        ...(currentConfigs[roleKey] ?? defaultRoleConfigs[roleKey]),
        roleKey,
        [field]: value,
      },
    }))
  }

  async function handleSaveRoleConfig(roleKey: string) {
    const config = agentConfigs[roleKey]
    if (!config || !config.apiUrl || !config.apiKey || !config.modelName) {
      return
    }

    setActiveSaveKey(roleKey)
    try {
      const savedConfig = await saveAgentConfig(config)
      setAgentConfigs((currentConfigs) => ({
        ...currentConfigs,
        [roleKey]: savedConfig,
      }))
      setSuccessToast(`${formatRoleLabel(roleKey)} updated successfully`)
    } catch {
    } finally {
      setActiveSaveKey(null)
    }
  }

  const oauthDetails = [
    ['Connection', isLoadingOauthStatus ? 'Loading...' : oauthStatus.connected ? 'Connected' : 'Not connected'],
    ['Channel', formatChannelLabel(oauthStatus, isLoadingOauthStatus)],
    ['Scope', isLoadingOauthStatus ? 'Loading...' : oauthStatus.scope ?? 'Awaiting consent'],
    ['Token Expiry', formatIsoLabel(oauthStatus.expiresAt, isLoadingOauthStatus)],
    ['Last Sync', formatIsoLabel(oauthStatus.lastUpdatedAt, isLoadingOauthStatus)],
  ] as const

  return (
    <section className="flex flex-col gap-6">
      {successToast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-[rgba(204,116,64,0.2)] bg-[#fffaf5] px-5 py-4 text-sm font-medium text-[#765846] shadow-[0_20px_45px_rgba(82,58,43,0.12)]">
          {successToast}
        </div>
      ) : null}

      <article className={`${surfaceClass} overflow-hidden`}>
        <div className="border-b border-[rgba(88,66,45,0.09)] px-4 py-4 md:px-8 md:py-6">
          <h2 className={`${sectionTitleClass} text-2xl md:text-[2rem]`}>Connect OAuth</h2>
        </div>
        <div className="grid gap-3 px-4 py-4 md:gap-4 md:px-8 md:py-8 md:grid-cols-3">
          {isLoadingOauthStatus
            ? Array.from({ length: 5 }, (_, index) => <InfoCardSkeleton key={`oauth-skeleton-${index}`} />)
            : oauthDetails.map(([label, value]) => (
                <div key={label} className="rounded-xl md:rounded-2xl border border-[rgba(118,88,70,0.1)] bg-white px-4 py-3 md:px-5 md:py-4">
                  <p className={`${mutedLabelClass} text-xs md:text-sm`}>{label}</p>
                  <p className="mt-1 md:mt-2 text-sm md:text-base font-medium text-[#765846] break-words">{value}</p>
                </div>
              ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 px-4 pb-4 md:px-8 md:pb-8">
          <button
            type="button"
            onClick={() => {
              window.location.href = getYoutubeOAuthStartUrl()
            }}
            className="rounded-full bg-[#cc7440] px-4 py-3 md:px-5 md:py-3 font-semibold text-[#fff7ef] text-sm md:text-base min-h-[44px]"
          >
            Update OAuth
          </button>
          <button
            type="button"
            onClick={() => {
              void handleRefreshOauth()
            }}
            disabled={isRefreshingOauth || isLoadingOauthStatus}
            className="rounded-full border border-[rgba(118,88,70,0.12)] bg-white px-4 py-3 md:px-5 md:py-3 font-semibold text-[#765846] text-sm md:text-base min-h-[44px]"
          >
            {isRefreshingOauth ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>
      </article>

      <article className={`${surfaceClass} overflow-hidden`}>
        <div className="border-b border-[rgba(88,66,45,0.09)] px-4 py-4 md:px-8 md:py-6">
          <h2 className={`${sectionTitleClass} text-2xl md:text-[2rem]`}>Audio Language</h2>
          <p className={`${mutedLabelClass} mt-2 max-w-3xl text-sm md:text-base`}>
            Select the audio language for generated videos. Default is English.
          </p>
        </div>
        <div className="px-4 py-4 md:px-8 md:py-8">
          <div className="rounded-xl md:rounded-2xl border border-[rgba(118,88,70,0.1)] bg-white px-4 py-4 md:px-5 md:py-5">
            {isLoadingAudioLanguage ? (
              <div className="flex items-center justify-between">
                <div className="h-6 w-32 animate-pulse rounded bg-[rgba(118,88,70,0.12)]" />
                <div className="h-10 w-32 animate-pulse rounded-full bg-[rgba(118,88,70,0.12)]" />
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm md:text-base font-medium text-[#765846]">Current Language</p>
                  <p className={`${mutedLabelClass} mt-1`}>
                    {audioLanguage.language === 'english' ? 'English' : 'Hindi'}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveAudioLanguage('english')
                    }}
                    disabled={isSavingAudioLanguage || audioLanguage.language === 'english'}
                    className="rounded-full border border-[rgba(118,88,70,0.12)] bg-white px-4 py-3 md:px-5 md:py-3 font-semibold text-[#765846] disabled:cursor-not-allowed disabled:opacity-60 text-sm md:text-base min-h-[44px] flex-1 sm:flex-none"
                  >
                    {isSavingAudioLanguage && audioLanguage.language === 'english' ? 'Saving...' : 'Set English'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveAudioLanguage('hindi')
                    }}
                    disabled={isSavingAudioLanguage || audioLanguage.language === 'hindi'}
                    className="rounded-full bg-[#cc7440] px-4 py-3 md:px-5 md:py-3 font-semibold text-[#fff7ef] disabled:cursor-not-allowed disabled:opacity-60 text-sm md:text-base min-h-[44px] flex-1 sm:flex-none"
                  >
                    {isSavingAudioLanguage && audioLanguage.language === 'hindi' ? 'Saving...' : 'Set Hindi'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </article>

      <RoleConfigCard
        title="Selector"
        roleKey="selector"
        config={agentConfigs.selector}
        isLoading={isLoadingAgentConfigs}
        isSaving={activeSaveKey === 'selector'}
        onChange={updateRoleConfig}
        onSave={handleSaveRoleConfig}
      />
      <RoleConfigCard
        title="Script Writer"
        roleKey="script-writer"
        config={agentConfigs['script-writer']}
        isLoading={isLoadingAgentConfigs}
        isSaving={activeSaveKey === 'script-writer'}
        onChange={updateRoleConfig}
        onSave={handleSaveRoleConfig}
      />

      <article className={`${surfaceClass} overflow-hidden`}>
        <div className="border-b border-[rgba(88,66,45,0.09)] px-4 py-4 md:px-8 md:py-6">
          <h2 className={`${sectionTitleClass} text-2xl md:text-[2rem]`}>Council Of Experts</h2>
        </div>
        <div className="grid gap-4 px-4 py-4 md:px-8 md:py-8">
          {councilExperts.map((expert) => (
            <RoleConfigFields
              key={expert.id}
              title={expert.label}
              roleKey={expert.id}
              config={agentConfigs[expert.id]}
              isLoading={isLoadingAgentConfigs}
              isSaving={activeSaveKey === expert.id}
              onChange={updateRoleConfig}
              onSave={handleSaveRoleConfig}
            />
          ))}
        </div>
      </article>

      <RoleConfigCard
        title="Director"
        roleKey="director"
        config={agentConfigs.director}
        isLoading={isLoadingAgentConfigs}
        isSaving={activeSaveKey === 'director'}
        onChange={updateRoleConfig}
        onSave={handleSaveRoleConfig}
      />

      <RoleConfigCard
        title="Cameraman"
        roleKey="cameraman"
        config={agentConfigs.cameraman}
        isLoading={isLoadingAgentConfigs}
        isSaving={activeSaveKey === 'cameraman'}
        onChange={updateRoleConfig}
        onSave={handleSaveRoleConfig}
        note="Cameraman (e.g. Qwen) writes video prompts for each segment. It handles text planning only — Video Gen runs the actual clip generation."
      />

      <RoleConfigCard
        title="Video Gen"
        roleKey="video-gen"
        config={agentConfigs['video-gen']}
        isLoading={isLoadingAgentConfigs}
        isSaving={activeSaveKey === 'video-gen'}
        onChange={updateRoleConfig}
        onSave={handleSaveRoleConfig}
        note="WanX / video-generation model used for all clip generation calls. Cameraman handles prompt planning; this model renders the actual video clips."
      />
    </section>
  )
}

function formatRoleLabel(roleKey: string): string {
  return roleKey
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatChannelLabel(status: YoutubeOAuthStatus, isLoading: boolean): string {
  if (isLoading) {
    return 'Loading...'
  }

  if (status.channelTitle && status.channelId) {
    return `${status.channelTitle} (${status.channelId})`
  }

  if (status.channelTitle) {
    return status.channelTitle
  }

  if (status.channelId) {
    return status.channelId
  }

  return 'Connect your YouTube account'
}

function formatIsoLabel(value: string | undefined, isLoading: boolean): string {
  if (isLoading) {
    return 'Loading...'
  }

  if (!value) {
    return 'Unavailable'
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleString()
}

function RoleConfigCard({
  title,
  roleKey,
  note,
  config,
  isLoading,
  isSaving,
  onChange,
  onSave,
}: {
  title: string
  roleKey: string
  note?: string
  config: AgentRoleConfig
  isLoading: boolean
  isSaving: boolean
  onChange: (roleKey: string, field: keyof Omit<AgentRoleConfig, 'roleKey'>, value: string) => void
  onSave: (roleKey: string) => void
}) {
  return (
    <article className={`${surfaceClass} overflow-hidden`}>
      <div className="border-b border-[rgba(88,66,45,0.09)] px-4 py-4 md:px-8 md:py-6">
        <h2 className={`${sectionTitleClass} text-2xl md:text-[2rem]`}>{title}</h2>
        {note ? <p className={`${mutedLabelClass} mt-2 max-w-3xl text-sm md:text-base`}>{note}</p> : null}
      </div>
      <div className="px-4 py-4 md:px-8 md:py-8">
        <RoleConfigFields
          roleKey={roleKey}
          config={config}
          isLoading={isLoading}
          isSaving={isSaving}
          onChange={onChange}
          onSave={onSave}
        />
        <div className="mt-5">
          <UpdateButton
            label={isSaving ? 'Saving...' : `Update ${title}`}
            onClick={() => {
              void onSave(roleKey)
            }}
            disabled={isSaving || isLoading}
          />
        </div>
      </div>
    </article>
  )
}

function RoleConfigFields({
  title,
  roleKey,
  config,
  isLoading,
  isSaving,
  onChange,
  onSave,
}: {
  title?: string
  roleKey: string
  config: AgentRoleConfig
  isLoading: boolean
  isSaving: boolean
  onChange: (roleKey: string, field: keyof Omit<AgentRoleConfig, 'roleKey'>, value: string) => void
  onSave: (roleKey: string) => void
}) {
  return (
    <div className="rounded-xl md:rounded-2xl border border-[rgba(118,88,70,0.1)] bg-white px-4 py-4 md:px-5 md:py-5">
      {title ? <h3 className="text-base md:text-lg font-semibold text-[#765846]">{title}</h3> : null}
      {isLoading ? (
        <div className={`grid gap-3 md:gap-4 ${title ? 'mt-3 md:mt-4' : ''} md:grid-cols-3`}>
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
      ) : (
        <div className={`grid gap-3 md:gap-4 ${title ? 'mt-3 md:mt-4' : ''} md:grid-cols-3`}>
          <ConfigField
            label="API URL"
            placeholder="https://api.provider.com/v1"
            value={config.apiUrl}
            onChange={(value) => {
              onChange(roleKey, 'apiUrl', value)
            }}
          />
          <ConfigField
            label="Key"
            placeholder="sk-..."
            type="password"
            value={config.apiKey}
            onChange={(value) => {
              onChange(roleKey, 'apiKey', value)
            }}
          />
          <ConfigField
            label="Model Name"
            placeholder="model-name"
            value={config.modelName}
            onChange={(value) => {
              onChange(roleKey, 'modelName', value)
            }}
          />
        </div>
      )}
      {title ? (
        <div className="mt-4 md:mt-5">
          <UpdateButton
            label={isSaving ? 'Saving...' : `Update ${title}`}
            onClick={() => {
              void onSave(roleKey)
            }}
            disabled={isSaving || isLoading}
          />
        </div>
      ) : null}
    </div>
  )
}

function UpdateButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-[#cc7440] px-4 py-3 md:px-5 md:py-3 font-semibold text-[#fff7ef] disabled:cursor-not-allowed disabled:opacity-60 text-sm md:text-base min-h-[44px]"
    >
      {label}
    </button>
  )
}

function ConfigField({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'password'
}) {
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'

  return (
    <label className="block">
      <span className={mutedLabelClass}>{label}</span>
      <div className="relative mt-2">
        <input
          type={isPassword && !revealed ? 'password' : 'text'}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          className={`${baseInputClass} pr-10`}
        />
        {isPassword && (
          <button
            type="button"
            aria-label={revealed ? 'Hide' : 'Show'}
            onClick={() => setRevealed((v) => !v)}
            className="absolute inset-y-0 right-3 flex items-center text-[#a09589] hover:text-[#765846]"
          >
            {revealed ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                <path d="M10.748 13.93l2.523 2.523a10.003 10.003 0 0 1-8.954-3.293 1.652 1.652 0 0 1 0-1.185 9.98 9.98 0 0 1 1.67-2.604l2.007 2.007A4.002 4.002 0 0 0 10.748 13.93Z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </label>
  )
}

function InfoCardSkeleton() {
  return (
    <div className="rounded-2xl border border-[rgba(118,88,70,0.1)] bg-white px-5 py-4">
      <div className="h-4 w-24 animate-pulse rounded bg-[rgba(118,88,70,0.10)]" />
      <div className="mt-3 h-5 w-40 animate-pulse rounded bg-[rgba(118,88,70,0.16)]" />
    </div>
  )
}

function FieldSkeleton() {
  return (
    <div className="block">
      <div className="h-4 w-20 animate-pulse rounded bg-[rgba(118,88,70,0.10)]" />
      <div className="mt-2 h-[50px] w-full animate-pulse rounded-2xl bg-[rgba(118,88,70,0.12)]" />
    </div>
  )
}

export default ApiConfigurationSection
