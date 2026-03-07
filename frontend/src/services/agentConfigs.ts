import type { AgentRoleConfig } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

export async function fetchAgentConfigs(): Promise<AgentRoleConfig[]> {
  const response = await fetch(`${apiBaseUrl}/setup/agent-configs`)
  const data = (await response.json()) as {
    configs?: AgentRoleConfig[]
    error?: string
  }

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to load agent configs')
  }

  return data.configs ?? []
}

export async function saveAgentConfig(config: AgentRoleConfig): Promise<AgentRoleConfig> {
  const response = await fetch(`${apiBaseUrl}/setup/agent-configs/${config.roleKey}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
    }),
  })

  const data = (await response.json()) as {
    config?: AgentRoleConfig
    error?: string
  }

  if (!response.ok || !data.config) {
    throw new Error(data.error ?? 'Failed to save agent config')
  }

  return data.config
}

