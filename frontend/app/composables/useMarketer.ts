/**
 * AI Marketer — campaign API client + async job polling.
 *
 * ทุก endpoint path รวมอยู่ในไฟล์นี้ตาม docs/ai-marketer/PLAN.md section 4
 * (backend: /api/v1/campaigns, response envelope { code, data, message } ผ่าน useApi)
 */
import { api } from './useApi'

/** สถานะงาน async จาก pipeline_tasks (research/strategy/creatives/refine) */
export interface MarketerJobStatus {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  kind?: string
  total?: number
  completed?: number
  failed?: number
  current_key?: string | null
  error_msg?: string | null
  error_code?: string | null
  result?: any
}

export const campaignAPI = {
  list: () => api.get<{ items: any[] }>('/campaigns'),
  create: (data: { title?: string; goal: string; brand_context?: string; platform?: string; language?: string }) =>
    api.post('/campaigns', data),
  get: (id: number) => api.get(`/campaigns/${id}`),
  update: (id: number, data: any) => api.put(`/campaigns/${id}`, data),
  del: (id: number) => api.del(`/campaigns/${id}`),

  research: (id: number, model?: string, configId?: number) =>
    api.post(`/campaigns/${id}/research`, { model: model || undefined, config_id: configId || undefined }),
  researchStatus: (id: number) => api.get<MarketerJobStatus>(`/campaigns/${id}/research-status`),
  cancelResearch: (id: number) => api.post(`/campaigns/${id}/research/cancel`, {}),

  strategy: (id: number, model?: string, configId?: number) =>
    api.post(`/campaigns/${id}/strategy`, { model: model || undefined, config_id: configId || undefined }),
  strategyStatus: (id: number) => api.get<MarketerJobStatus>(`/campaigns/${id}/strategy-status`),
  cancelStrategy: (id: number) => api.post(`/campaigns/${id}/strategy/cancel`, {}),

  docs: (id: number) => api.get<{ items: any[] }>(`/campaigns/${id}/docs`),
  updateDoc: (id: number, docId: number, data: { title?: string; content?: string }) =>
    api.put(`/campaigns/${id}/docs/${docId}`, data),
  refineDoc: (id: number, docId: number, instruction: string, model?: string, configId?: number) =>
    api.post(`/campaigns/${id}/docs/${docId}/refine`, { instruction, model: model || undefined, config_id: configId || undefined }),
  refineStatus: (id: number, docId: number) => api.get<MarketerJobStatus>(`/campaigns/${id}/docs/${docId}/refine-status`),
  cancelRefine: (id: number, docId: number) => api.post(`/campaigns/${id}/docs/${docId}/refine/cancel`, {}),

  generateCreatives: (id: number, opts: { count?: number; formats?: string[]; model?: string; configId?: number } = {}) =>
    api.post(`/campaigns/${id}/creatives`, {
      count: opts.count || undefined,
      formats: opts.formats?.length ? opts.formats : undefined,
      model: opts.model || undefined,
      config_id: opts.configId || undefined,
    }),
  generateStatus: (id: number) => api.get<MarketerJobStatus>(`/campaigns/${id}/creatives/generate-status`),
  cancelGenerate: (id: number) => api.post(`/campaigns/${id}/creatives/generate/cancel`, {}),

  creatives: (id: number) => api.get<{ items: any[] }>(`/campaigns/${id}/creatives`),
  updateCreative: (creativeId: number, data: { headline?: string; hook?: string; script?: string; approved?: boolean }) =>
    api.put(`/campaigns/creatives/${creativeId}`, data),
  delCreative: (creativeId: number) => api.del(`/campaigns/creatives/${creativeId}`),
}

export interface PollHandle { stopped: boolean }

/**
 * โพลสถานะงานจนจบ (done/error/cancelled) หรือจนกว่าผู้เรียกจะ stop()
 * - onUpdate เรียกทุก tick ทั้งตอน running และตอนจบ
 * - network error ต่อเนื่องเกิน maxConsecutiveErrors ครั้งจึง throw (เน็ตกระตุกไม่พังงาน)
 */
export async function pollJob(
  fetchStatus: () => Promise<MarketerJobStatus>,
  opts: { intervalMs?: number; onUpdate?: (s: MarketerJobStatus) => void; handle?: PollHandle; maxConsecutiveErrors?: number } = {},
): Promise<MarketerJobStatus> {
  const intervalMs = opts.intervalMs ?? 2000
  const maxErrors = opts.maxConsecutiveErrors ?? 5
  let consecutiveErrors = 0
  for (;;) {
    if (opts.handle?.stopped) {
      return { status: 'cancelled' }
    }
    let status: MarketerJobStatus
    try {
      status = await fetchStatus()
      consecutiveErrors = 0
    } catch (err) {
      consecutiveErrors += 1
      if (consecutiveErrors >= maxErrors) throw err
      await sleep(intervalMs)
      continue
    }
    opts.onUpdate?.(status)
    if (status.status !== 'running') return status
    await sleep(intervalMs)
  }
}

export function stopPolling(handle: PollHandle | null | undefined) {
  if (handle) handle.stopped = true
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// === Text model options (แบบเดียวกับ episode.vue — ใช้กับ ModelSelect และส่ง model/config_id) ===

export function configModels(cfg: any): string[] {
  const raw = cfg?.model
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  try {
    const m = JSON.parse(raw)
    return Array.isArray(m) ? m.filter(Boolean) : [m].filter(Boolean)
  } catch {
    return [raw].filter(Boolean)
  }
}

export function collectTextModelOptions(cfgs: any[]) {
  const seen = new Set()
  const out: { key: string; model: string; provider: string; configId: number; configName: string }[] = []
  const sorted = [...(cfgs || [])].filter((c) => c.is_active).sort((a, b) => (b.priority || 0) - (a.priority || 0))
  for (const c of sorted) {
    for (const m of configModels(c)) {
      const key = `${c.provider}/${m}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, model: m, provider: c.provider, configId: c.id, configName: c.name || c.provider })
    }
  }
  return out
}

export function ownerConfigId(options: { key: string; configId: number }[], key: string) {
  return key ? (options.find((o) => o.key === key)?.configId || undefined) : undefined
}

/** key รูปแบบ 'provider/model' → ส่งเฉพาะชื่อโมเดล (แบบเดียวกับ bareModelName ใน episode.vue) */
export function bareModelName(key: string) {
  if (!key) return ''
  const i = key.indexOf('/')
  return i >= 0 ? key.slice(i + 1) : key
}
