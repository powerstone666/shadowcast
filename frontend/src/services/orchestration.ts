const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

export async function runWorkflow(userPreference?: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/orchestration/run-workflow`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userPreference ? { userPreference } : {}),
  })

  if (response.ok) {
    return
  }

  const payload = await parseErrorPayload(response)
  throw new Error(payload)
}

export async function terminateWorkflow(): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/orchestration/terminate-workflow`, {
    method: 'POST',
  })

  if (response.ok) {
    return
  }

  const payload = await parseErrorPayload(response)
  throw new Error(payload)
}

async function parseErrorPayload(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string }
    return payload.error ?? `Workflow failed with status ${response.status}`
  } catch {
    return `Workflow failed with status ${response.status}`
  }
}
