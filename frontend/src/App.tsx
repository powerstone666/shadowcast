import { useState } from 'react'
import ApiConfigurationSection from './components/api-configuration/ApiConfigurationSection'
import DashboardSection from './components/dashboard/DashboardSection'
import OverviewSection from './components/overview/OverviewSection'
import type { NavigationKey } from './types'
import { appBackgroundClass, contentWrapClass } from './ui'

const ACTIVE_SECTION_STORAGE_KEY = 'yt-automation-active-section'

const navigationItems: Array<{ key: NavigationKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'api-configuration', label: 'API Configuration' },
]

function App() {
  const [activeKey, setActiveKey] = useState<NavigationKey>(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const section = searchParams.get('section')
    if (section === 'api-configuration') {
      return 'api-configuration'
    }

    const storedSection = window.localStorage.getItem(ACTIVE_SECTION_STORAGE_KEY)
    if (storedSection === 'overview' || storedSection === 'dashboard' || storedSection === 'api-configuration') {
      return storedSection
    }

    return 'overview'
  })

  function handleSectionChange(nextKey: NavigationKey) {
    setActiveKey(nextKey)
    window.localStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, nextKey)
  }

  return (
    <main className={appBackgroundClass}>
      <div className="flex items-center justify-center px-4 pb-2 pt-4 md:px-8 md:pt-6 md:pb-2">
        <div className="w-full max-w-2xl rounded-full border border-[rgba(88,66,45,0.1)] bg-[rgba(255,250,244,0.92)] p-1 shadow-[0_14px_32px_rgba(80,61,44,0.08),inset_0_1px_0_rgba(255,255,255,0.75)] md:p-1.5">
          <nav className="flex items-center justify-between gap-1 md:gap-1.5">
            {navigationItems.map((item) => {
              const isActive = activeKey === item.key

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSectionChange(item.key)}
                  className={`flex-1 rounded-full px-2 py-2.5 text-xs font-semibold tracking-[-0.01em] transition-colors md:min-w-[140px] md:px-4 md:py-3 md:text-base md:font-semibold ${
                    isActive
                      ? 'bg-[#cc7440] text-[#fff7ef]'
                      : 'text-[#765846] hover:bg-[rgba(204,116,64,0.08)]'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>
      <div className={contentWrapClass}>
        {activeKey === 'overview' && <OverviewSection />}
        {activeKey === 'dashboard' && <DashboardSection />}
        {activeKey === 'api-configuration' && <ApiConfigurationSection />}
      </div>
    </main>
  )
}

export default App
