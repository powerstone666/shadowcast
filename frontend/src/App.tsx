import { useState } from 'react'
import ApiConfigurationSection from './components/api-configuration/ApiConfigurationSection'
import DashboardSection from './components/dashboard/DashboardSection'
import OverviewSection from './components/overview/OverviewSection'
import type { NavigationKey } from './types'
import { appBackgroundClass, contentWrapClass } from './ui'

const navigationItems: Array<{ key: NavigationKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'api-configuration', label: 'API Configuration' },
]

function App() {
  const [activeKey, setActiveKey] = useState<NavigationKey>(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const section = searchParams.get('section')
    return section === 'api-configuration' ? 'api-configuration' : 'overview'
  })

  return (
    <main className={appBackgroundClass}>
      <div className="flex items-center justify-center px-8 pb-2 pt-6 max-md:px-5">
        <div className="rounded-full border border-[rgba(88,66,45,0.1)] bg-[rgba(255,250,244,0.92)] p-1.5 shadow-[0_14px_32px_rgba(80,61,44,0.08),inset_0_1px_0_rgba(255,255,255,0.75)]">
          <nav className="flex items-center gap-1.5">
            {navigationItems.map((item) => {
              const isActive = activeKey === item.key

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveKey(item.key)}
                  className={`min-w-[176px] rounded-full px-7 py-3.5 text-base font-semibold tracking-[-0.01em] transition-colors max-md:min-w-0 max-md:px-5 max-md:py-3 ${
                    isActive
                      ? 'bg-[#cc7440] text-[#fff7ef]'
                      : 'text-[#765846] hover:bg-[rgba(204,116,64,0.08)]'
                  }`}
                >
                  {item.label}
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
