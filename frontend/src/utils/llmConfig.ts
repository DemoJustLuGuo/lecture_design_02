export const LLM_CONFIG_STORAGE_KEY = 'lesson_design_llm_config'

export interface LlmConfigForm {
  base_url: string
  api_key: string
  model: string
  timeout_seconds: number
}

export function defaultLlmConfig(): LlmConfigForm {
  return {
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    model: 'gpt-4o-mini',
    timeout_seconds: 20,
  }
}

export function normalizeLlmConfig(config: Partial<LlmConfigForm>): LlmConfigForm {
  const defaults = defaultLlmConfig()
  return {
    base_url: (config.base_url || defaults.base_url).trim(),
    api_key: (config.api_key || '').trim(),
    model: (config.model || defaults.model).trim(),
    timeout_seconds: Math.max(1, Math.min(Number(config.timeout_seconds || defaults.timeout_seconds), 60)),
  }
}

export function loadStoredLlmConfig(): LlmConfigForm {
  if (typeof window === 'undefined') return defaultLlmConfig()
  try {
    const raw = window.localStorage.getItem(LLM_CONFIG_STORAGE_KEY)
    if (!raw) return defaultLlmConfig()
    return normalizeLlmConfig(JSON.parse(raw) as Partial<LlmConfigForm>)
  } catch {
    return defaultLlmConfig()
  }
}

export function saveLlmConfig(config: LlmConfigForm) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LLM_CONFIG_STORAGE_KEY, JSON.stringify(normalizeLlmConfig(config)))
}

export async function loadLocalLlmConfig(): Promise<Partial<LlmConfigForm> | null> {
  const response = await fetch('/llm-config.local.json', { cache: 'no-store' })
  if (!response.ok) return null
  return response.json() as Promise<Partial<LlmConfigForm>>
}
