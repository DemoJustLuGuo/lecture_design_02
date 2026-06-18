import axios from 'axios'
import type { ApiResponse } from '../types/api'

const client = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/* ── Response interceptor: unwrap ApiResponse<T> ─────────────── */
client.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse<unknown>

    // Non-standard structure (e.g. raw data) → pass through
    if (body === undefined || body.success === undefined) {
      return response
    }

    // Business-level failure → reject
    if (!body.success) {
      const error = new Error(body.message || '请求失败')
      error.name = 'ApiError'
      return Promise.reject(error)
    }

    // success=true → extract data field so callers get business payload directly
    response.data = body.data
    return response
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      const detail = error.response.data?.detail ?? error.response.data?.message ?? ''
      const message = typeof detail === 'string'
        ? detail
        : detail?.message || (
          status === 502 || status === 503 || status === 504
            ? `后端服务未启动或 /api 代理不可用 (HTTP ${status})`
            : `请求失败 (HTTP ${status})`
        )
      const apiError = new Error(message)
      apiError.name = 'ApiError'
      return Promise.reject(apiError)
    }

    // Timeout or network failure
    const message = error.code === 'ECONNABORTED'
      ? '请求超时，请确认后端服务是否仍在运行。'
      : '网络连接异常，请确认 FastAPI 后端已在 127.0.0.1:8000 启动。'
    const apiError = new Error(message)
    apiError.name = 'ApiError'
    return Promise.reject(apiError)
  },
)

/**
 * unwrap<T> – generic helper that calls an API method and
 * guarantees the return type is T.
 *
 * Usage:
 *   const data = await unwrap<DashboardSummary>(client.get('/dashboard/summary'))
 */
export async function unwrap<T>(promise: Promise<{ data: T }>): Promise<T> {
  const { data } = await promise
  return data
}

export default client
