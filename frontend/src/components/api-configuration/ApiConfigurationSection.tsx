import { useEffect, useState } from 'react'
import { fetchYoutubeOAuthStatus, getYoutubeOAuthStartUrl } from '../../services/youtubeOAuth'
import type { YoutubeOAuthStatus } from '../../types'
import { mutedLabelClass, sectionTitleClass, surfaceClass } from '../../ui'

const baseInputClass =
  'w-full rounded-2xl border border-[rgba(118,88,70,0.14)] bg-white px-4 py-3 text-[#2b2019] outline-none placeholder:text-[#a09589]'

const councilExperts = [
  { id: 'research', label: 'Research Expert' },
  { id: 'strategy', label: 'Strategy Expert' },
  { id: 'quality', label: 'Quality Expert' },
]

function ApiConfigurationSection() {
  const [oauthStatus, setOauthStatus] = useState<YoutubeOAuthStatus>({ connected: false })
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [isLoadingOauthStatus, setIsLoadingOauthStatus] = useState(true)
  const [isRefreshingOauth, setIsRefreshingOauth] = useState(false)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const oauthResult = searchParams.get('yt_oauth')
    const oauthResultMessage = searchParams.get('message')

    if (oauthResult === 'error') {
      setOauthError(oauthResultMessage ?? 'YouTube OAuth failed.')
    }

    if (oauthResult || oauthResultMessage || searchParams.get('section')) {
      searchParams.delete('yt_oauth')
      searchParams.delete('message')
      searchParams.delete('section')

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', nextUrl)
    }

    void loadOauthStatus()
  }, [])

  async function loadOauthStatus() {
    setIsLoadingOauthStatus(true)
    try {
      const nextStatus = await fetchYoutubeOAuthStatus()
      setOauthStatus(nextStatus)
      if (!nextStatus.error) {
        setOauthError(null)
      }
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : 'Failed to load YouTube OAuth status.')
    } finally {
      setIsLoadingOauthStatus(false)
    }
  }

  async function handleRefreshOauth() {
    setIsRefreshingOauth(true)

    try {
      const nextStatus = await fetchYoutubeOAuthStatus()
      setOauthStatus(nextStatus)
      setOauthError(null)
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : 'Failed to refresh YouTube OAuth status.')
    } finally {
      setIsRefreshingOauth(false)
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
      <article className={`${surfaceClass} overflow-hidden`}>
        <div className="border-b border-[rgba(88,66,45,0.09)] px-8 py-6">
          <h2 className={sectionTitleClass}>Connect OAuth</h2>
        </div>
        <div className="grid gap-4 px-8 py-8 md:grid-cols-3">
          {oauthDetails.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[rgba(118,88,70,0.1)] bg-white px-5 py-4">
              <p className={mutedLabelClass}>{label}</p>
              <p className="mt-2 text-base font-medium text-[#765846]">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 px-8 pb-8">
          <button
            type="button"
            onClick={() => {
              window.location.href = getYoutubeOAuthStartUrl()
            }}
            className="rounded-full bg-[#cc7440] px-5 py-3 font-semibold text-[#fff7ef]"
          >
            Update OAuth
          </button>
          <button
            type="button"
            onClick={() => {
              void handleRefreshOauth()
            }}
            disabled={isRefreshingOauth || isLoadingOauthStatus}
            className="rounded-full border border-[rgba(118,88,70,0.12)] bg-white px-5 py-3 font-semibold text-[#765846]"
          >
            {isRefreshingOauth ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>
        {oauthError ? <StatusBanner tone="error" message={oauthError} /> : null}
      </article>

      <RoleConfigCard title="Selector" />
      <RoleConfigCard title="Script Writer" />

      <article className={`${surfaceClass} overflow-hidden`}>
        <div className="border-b border-[rgba(88,66,45,0.09)] px-8 py-6">
          <h2 className={sectionTitleClass}>Council Of Experts</h2>
        </div>
        <div className="grid gap-4 px-8 py-8">
          {councilExperts.map((expert) => (
            <RoleConfigFields key={expert.id} title={expert.label} />
          ))}
        </div>
      </article>

      <RoleConfigCard title="Director" />

      <RoleConfigCard
        title="Cameraman"
        note="Use only models with native audio and video generation capabilities."
      />

      <RoleConfigCard
        title="Thumbnail Gen"
        note="Use image-capable models here. Set the model name to an image generation model."
      />
    </section>
  )
}

function StatusBanner({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  const toneClass = tone === 'error'
    ? 'border-[rgba(176,87,87,0.18)] bg-[rgba(255,241,241,0.95)] text-[#a94c4c]'
    : 'border-[rgba(84,118,90,0.16)] bg-[rgba(233,244,234,0.92)] text-[#54765a]'

  return (
    <div className={`mx-8 mb-8 rounded-2xl border px-5 py-4 text-sm font-medium ${toneClass}`}>
      {message}
    </div>
  )
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

function RoleConfigCard({ title, note }: { title: string; note?: string }) {
  return (
    <article className={`${surfaceClass} overflow-hidden`}>
      <div className="border-b border-[rgba(88,66,45,0.09)] px-8 py-6">
        <h2 className={sectionTitleClass}>{title}</h2>
        {note ? <p className={`${mutedLabelClass} mt-2 max-w-3xl`}>{note}</p> : null}
      </div>
      <div className="px-8 py-8">
        <RoleConfigFields />
        <div className="mt-5">
          <UpdateButton label={`Update ${title}`} />
        </div>
      </div>
    </article>
  )
}

function RoleConfigFields({ title }: { title?: string }) {
  return (
    <div className="rounded-2xl border border-[rgba(118,88,70,0.1)] bg-white px-5 py-5">
      {title ? <h3 className="text-lg font-semibold text-[#765846]">{title}</h3> : null}
      <div className={`grid gap-4 ${title ? 'mt-4' : ''} md:grid-cols-3`}>
        <ConfigField label="API URL" placeholder="https://api.provider.com/v1" />
        <ConfigField label="Key" placeholder="sk-..." type="password" />
        <ConfigField label="Model Name" placeholder="model-name" />
      </div>
      {title ? (
        <div className="mt-5">
          <UpdateButton label={`Update ${title}`} />
        </div>
      ) : null}
    </div>
  )
}

function UpdateButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="rounded-full bg-[#cc7440] px-5 py-3 font-semibold text-[#fff7ef]"
    >
      {label}
    </button>
  )
}

function ConfigField({
  label,
  placeholder,
  type = 'text',
}: {
  label: string
  placeholder: string
  type?: 'text' | 'password'
}) {
  return (
    <label className="block">
      <span className={mutedLabelClass}>{label}</span>
      <input type={type} placeholder={placeholder} className={`${baseInputClass} mt-2`} />
    </label>
  )
}

export default ApiConfigurationSection
