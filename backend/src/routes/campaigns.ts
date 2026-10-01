/**
 * AI Marketer — /api/v1/campaigns 路由（contract 见 docs/ai-marketer/PLAN.md section 4）
 */
import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, AppError } from '../utils/response.js'
import { cancelTask } from '../services/pipeline-tasks.js'
import {
  CREATIVE_FORMATS,
  campaignResearchKey, campaignStrategyKey, campaignCreativesKey, campaignRefineKey,
  getRunningCampaignJob, getJobStatus,
  startResearchJob, startStrategyJob, startCreativesJob, startRefineJob,
} from '../services/campaigns.js'

const E = {
  NOT_FOUND: 'E_CAMPAIGN_NOT_FOUND',
  JOB_RUNNING: 'E_CAMPAIGN_JOB_RUNNING',
  EMPTY_GOAL: 'E_CAMPAIGN_EMPTY_GOAL',
  NO_RESEARCH: 'E_CAMPAIGN_NO_RESEARCH',
  NO_DOCS: 'E_CAMPAIGN_NO_DOCS',
  EMPTY_INSTRUCTION: 'E_CAMPAIGN_EMPTY_INSTRUCTION',
}

type CampaignRow = typeof schema.campaigns.$inferSelect

function now() { return new Date().toISOString() }

function parseResearch(row: CampaignRow): { content: string; highlights: string[] } | null {
  if (!row.research) return null
  try {
    const parsed = JSON.parse(row.research)
    if (parsed && typeof parsed.content === 'string') {
      return { content: parsed.content, highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [] }
    }
    // 旧格式：直接存文本
    return { content: String(parsed), highlights: [] }
  } catch {
    return { content: row.research, highlights: [] }
  }
}

/** contract 的 Campaign 对象（research 解析为对象，stage 按数据派生） */
function toCampaignJson(row: CampaignRow, docsCount: number, creativesCount: number, hasApproved: boolean) {
  const stage = hasApproved ? 'review'
    : creativesCount > 0 ? 'creatives'
    : docsCount > 0 ? 'strategy'
    : row.research ? 'research'
    : 'goal'
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    brand_context: row.brandContext,
    platform: row.platform,
    language: row.language,
    status: row.status,
    stage,
    research: parseResearch(row),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

async function loadCampaignBundle(id: number) {
  const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id))
  if (!row) return null
  const docs = await db.select().from(schema.campaignDocs)
    .where(eq(schema.campaignDocs.campaignId, id))
    .orderBy(schema.campaignDocs.id)
  const creatives = await db.select().from(schema.campaignCreatives)
    .where(eq(schema.campaignCreatives.campaignId, id))
    .orderBy(schema.campaignCreatives.id)
  return {
    campaign: toCampaignJson(row, docs.length, creatives.length, creatives.some(c => c.approved)),
    docs: docs.map(d => ({
      id: d.id, campaign_id: d.campaignId, kind: d.kind, title: d.title,
      content: d.content, version: d.version, updated_at: d.updatedAt,
    })),
    creatives: creatives.map(cr => ({
      id: cr.id, campaign_id: cr.campaignId, format: cr.format, headline: cr.headline,
      hook: cr.hook, script: cr.script, approved: !!cr.approved, version: cr.version,
      created_at: cr.createdAt, updated_at: cr.updatedAt,
    })),
  }
}

/** 启动任意 job 前的统一检查：同 campaign 已有 running job → 409 */
async function ensureNoRunningJob(campaignId: number) {
  const running = await getRunningCampaignJob(campaignId)
  if (running) throw new AppError('มีงาน AI ของแคมเปญนี้กำลังรันอยู่ รอจนเสร็จหรือยกเลิกก่อน', E.JOB_RUNNING)
}

async function getRawCampaign(id: number): Promise<CampaignRow> {
  const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id))
  if (!row) throw new AppError('ไม่พบแคมเปญนี้ (อาจถูกลบไปแล้ว)', E.NOT_FOUND)
  return row
}

/**
 * ครอบ handler เพื่อแปลง AppError → สถานะ + errorCode ที่ถูกต้อง
 * (global errorHandler ทุก throw เป็น 500 — ตาม convention ของ repo ต้อง catch ที่ route,
 *  เช่น routes/agent.ts)
 */
function guard(fn: (c: any) => any) {
  return async (c: any) => {
    try {
      return await fn(c)
    } catch (err: any) {
      if (err instanceof AppError) {
        const status = err.errorCode === E.NOT_FOUND ? 404
          : err.errorCode === E.JOB_RUNNING ? 409
          : 400
        return c.json({ code: status, message: err.message, errorCode: err.errorCode }, status)
      }
      throw err
    }
  }
}

const app = new Hono()

// === List / Create ===

app.get('/', guard(async (c) => {
  const rows = await db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.updatedAt))
  const items = []
  for (const row of rows) {
    const docsCount = (await db.select().from(schema.campaignDocs).where(eq(schema.campaignDocs.campaignId, row.id))).length
    const creatives = await db.select({ approved: schema.campaignCreatives.approved })
      .from(schema.campaignCreatives).where(eq(schema.campaignCreatives.campaignId, row.id))
    items.push(toCampaignJson(row, docsCount, creatives.length, creatives.some(cr => cr.approved)))
  }
  return success(c, { items })
}))

app.post('/', guard(async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const goal = String(body?.goal || '').trim()
  if (!goal) throw new AppError('กรุณาใส่เป้าหมายการตลาด', E.EMPTY_GOAL)
  const ts = now()
  const [row] = await db.insert(schema.campaigns).values({
    title: body?.title ? String(body.title).trim() : null,
    goal,
    brandContext: body?.brand_context ? String(body.brand_context).trim() : null,
    platform: body?.platform ? String(body.platform) : null,
    language: body?.language ? String(body.language) : null,
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
  }).returning()
  return created(c, toCampaignJson(row, 0, 0, false))
}))

// === Detail / Update / Delete ===

app.get('/:id', guard(async (c) => {
  const id = Number(c.req.param('id'))
  const bundle = await loadCampaignBundle(id)
  if (!bundle) throw new AppError('ไม่พบแคมเปญนี้ (อาจถูกลบไปแล้ว)', E.NOT_FOUND)
  return success(c, bundle)
}))

app.put('/:id', guard(async (c) => {
  const id = Number(c.req.param('id'))
  await getRawCampaign(id)
  const body = await c.req.json().catch(() => ({}))
  const patch: Record<string, any> = { updatedAt: now() }
  if (body?.title !== undefined) patch.title = body.title ? String(body.title).trim() : null
  if (body?.goal !== undefined) {
    const goal = String(body.goal || '').trim()
    if (!goal) throw new AppError('กรุณาใส่เป้าหมายการตลาด', E.EMPTY_GOAL)
    patch.goal = goal
  }
  if (body?.brand_context !== undefined) patch.brandContext = body.brand_context ? String(body.brand_context).trim() : null
  if (body?.platform !== undefined) patch.platform = body.platform ? String(body.platform) : null
  if (body?.language !== undefined) patch.language = body.language ? String(body.language) : null
  await db.update(schema.campaigns).set(patch).where(eq(schema.campaigns.id, id))
  return success(c, (await loadCampaignBundle(id))!.campaign)
}))

app.delete('/:id', guard(async (c) => {
  const id = Number(c.req.param('id'))
  await getRawCampaign(id)
  await db.delete(schema.campaignDocs).where(eq(schema.campaignDocs.campaignId, id))
  await db.delete(schema.campaignCreatives).where(eq(schema.campaignCreatives.campaignId, id))
  await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id))
  return success(c, { deleted: true })
}))

// === Research ===

app.post('/:id/research', guard(async (c) => {
  const id = Number(c.req.param('id'))
  const campaign = await getRawCampaign(id)
  if (!campaign.goal?.trim()) throw new AppError('กรุณาใส่เป้าหมายการตลาด', E.EMPTY_GOAL)
  await ensureNoRunningJob(id)
  const body = await c.req.json().catch(() => ({}))
  const ok = await startResearchJob(campaign, { model: body?.model || undefined, configId: body?.config_id || undefined })
  if (!ok) throw new AppError('มีงาน AI ของแคมเปญนี้กำลังรันอยู่ รอจนเสร็จหรือยกเลิกก่อน', E.JOB_RUNNING)
  return success(c, (await loadCampaignBundle(id))!.campaign)
}))

app.get('/:id/research-status', guard(async (c) => {
  const id = Number(c.req.param('id'))
  await getRawCampaign(id)
  return success(c, await getJobStatus(campaignResearchKey(id), 'campaign_research'))
}))

app.post('/:id/research/cancel', guard(async (c) => {
  const id = Number(c.req.param('id'))
  await getRawCampaign(id)
  return success(c, { cancelled: await cancelTask(campaignResearchKey(id)) })
}))

// === Strategy ===

app.post('/:id/strategy', guard(async (c) => {
  const id = Number(c.req.param('id'))
  const campaign = await getRawCampaign(id)
  if (!campaign.research) throw new AppError('ต้องวิจัยตลาดก่อนจึงจะสร้างกลยุทธ์ได้', E.NO_RESEARCH)
  await ensureNoRunningJob(id)
  const body = await c.req.json().catch(() => ({}))
  const ok = await startStrategyJob(campaign, { model: body?.model || undefined, configId: body?.config_id || undefined })
  if (!ok) throw new AppError('มีงาน AI ของแคมเปญนี้กำลังรันอยู่ รอจนเสร็จหรือยกเลิกก่อน', E.JOB_RUNNING)
  return success(c, (await loadCampaignBundle(id))!.campaign)
}))

app.get('/:id/strategy-status', guard(async (c) => {
  const id = Number(c.req.param('id'))
  await getRawCampaign(id)
  return success(c, await getJobStatus(campaignStrategyKey(id), 'campaign_strategy'))
}))

app.post('/:id/strategy/cancel', guard(async (c) => {
  const id = Number(c.req.param('id'))
  await getRawCampaign(id)
  return success(c, { cancelled: await cancelTask(campaignStrategyKey(id)) })
}))

// === Docs ===

app.get('/:id/docs', guard(async (c) => {
  const id = Number(c.req.param('id'))
  const bundle = await loadCampaignBundle(id)
  if (!bundle) throw new AppError('ไม่พบแคมเปญนี้ (อาจถูกลบไปแล้ว)', E.NOT_FOUND)
  return success(c, { items: bundle.docs })
}))

app.put('/:id/docs/:docId', guard(async (c) => {
  const id = Number(c.req.param('id'))
  const docId = Number(c.req.param('docId'))
  const [doc] = await db.select().from(schema.campaignDocs)
    .where(and(eq(schema.campaignDocs.id, docId), eq(schema.campaignDocs.campaignId, id)))
  if (!doc) throw new AppError('ไม่พบเอกสารนี้', E.NOT_FOUND)
  const body = await c.req.json().catch(() => ({}))
  const patch: Record<string, any> = { updatedAt: now() }
  if (body?.title !== undefined && String(body.title).trim()) patch.title = String(body.title).trim()
  if (body?.content !== undefined) patch.content = String(body.content ?? '')
  await db.update(schema.campaignDocs).set(patch).where(eq(schema.campaignDocs.id, docId))
  const [updated] = await db.select().from(schema.campaignDocs).where(eq(schema.campaignDocs.id, docId))
  return success(c, {
    id: updated.id, campaign_id: updated.campaignId, kind: updated.kind, title: updated.title,
    content: updated.content, version: updated.version, updated_at: updated.updatedAt,
  })
}))

app.post('/:id/docs/:docId/refine', guard(async (c) => {
  const id = Number(c.req.param('id'))
  const campaign = await getRawCampaign(id)
  const docId = Number(c.req.param('docId'))
  const [doc] = await db.select().from(schema.campaignDocs)
    .where(and(eq(schema.campaignDocs.id, docId), eq(schema.campaignDocs.campaignId, id)))
  if (!doc) throw new AppError('ไม่พบเอกสารนี้', E.NOT_FOUND)
  const body = await c.req.json().catch(() => ({}))
  const instruction = String(body?.instruction || '').trim()
  if (!instruction) throw new AppError('กรุณาบอก AI ว่าต้องการปรับอะไรก่อน', E.EMPTY_INSTRUCTION)
  await ensureNoRunningJob(id)
  const ok = await startRefineJob(campaign, doc, instruction, { model: body?.model || undefined, configId: body?.config_id || undefined })
  if (!ok) throw new AppError('มีงาน AI ของแคมเปญนี้กำลังรันอยู่ รอจนเสร็จหรือยกเลิกก่อน', E.JOB_RUNNING)
  return success(c, { started: true, doc_id: docId })
}))

app.get('/:id/docs/:docId/refine-status', guard(async (c) => {
  const id = Number(c.req.param('id'))
  const docId = Number(c.req.param('docId'))
  await getRawCampaign(id)
  return success(c, await getJobStatus(campaignRefineKey(id, docId), 'campaign_refine'))
}))

app.post('/:id/docs/:docId/refine/cancel', guard(async (c) => {
  const id = Number(c.req.param('id'))
  await getRawCampaign(id)
  return success(c, { cancelled: await cancelTask(campaignRefineKey(id, Number(c.req.param('docId')))) })
}))

// === Creatives ===

app.post('/:id/creatives', guard(async (c) => {
  const id = Number(c.req.param('id'))
  const campaign = await getRawCampaign(id)
  const docs = await db.select().from(schema.campaignDocs).where(eq(schema.campaignDocs.campaignId, id))
  if (!docs.length) throw new AppError('ต้องสร้างเอกสารกลยุทธ์ก่อนจึงจะสร้างครีเอทีฟได้', E.NO_DOCS)
  await ensureNoRunningJob(id)
  const body = await c.req.json().catch(() => ({}))
  const count = Math.min(5, Math.max(1, Number(body?.count) || 3))
  const requested: string[] = Array.isArray(body?.formats) ? body.formats.map(String) : []
  const formats = requested.filter(f => (CREATIVE_FORMATS as readonly string[]).includes(f))
  const ok = await startCreativesJob(campaign, { count, formats: formats.length ? formats : [...CREATIVE_FORMATS] },
    { model: body?.model || undefined, configId: body?.config_id || undefined })
  if (!ok) throw new AppError('มีงาน AI ของแคมเปญนี้กำลังรันอยู่ รอจนเสร็จหรือยกเลิกก่อน', E.JOB_RUNNING)
  return success(c, (await loadCampaignBundle(id))!.campaign)
}))

app.get('/:id/creatives/generate-status', guard(async (c) => {
  const id = Number(c.req.param('id'))
  await getRawCampaign(id)
  return success(c, await getJobStatus(campaignCreativesKey(id), 'campaign_creatives'))
}))

app.post('/:id/creatives/generate/cancel', guard(async (c) => {
  const id = Number(c.req.param('id'))
  await getRawCampaign(id)
  return success(c, { cancelled: await cancelTask(campaignCreativesKey(id)) })
}))

app.get('/:id/creatives', guard(async (c) => {
  const id = Number(c.req.param('id'))
  const bundle = await loadCampaignBundle(id)
  if (!bundle) throw new AppError('ไม่พบแคมเปญนี้ (อาจถูกลบไปแล้ว)', E.NOT_FOUND)
  return success(c, { items: bundle.creatives })
}))

app.put('/creatives/:creativeId', guard(async (c) => {
  const creativeId = Number(c.req.param('creativeId'))
  const [cr] = await db.select().from(schema.campaignCreatives).where(eq(schema.campaignCreatives.id, creativeId))
  if (!cr) throw new AppError('ไม่พบครีเอทีฟนี้', E.NOT_FOUND)
  const body = await c.req.json().catch(() => ({}))
  const patch: Record<string, any> = { updatedAt: now() }
  if (body?.headline !== undefined) patch.headline = String(body.headline)
  if (body?.hook !== undefined) patch.hook = body.hook ? String(body.hook) : null
  if (body?.script !== undefined) patch.script = String(body.script ?? '')
  if (body?.approved !== undefined) patch.approved = !!body.approved
  await db.update(schema.campaignCreatives).set(patch).where(eq(schema.campaignCreatives.id, creativeId))
  const [updated] = await db.select().from(schema.campaignCreatives).where(eq(schema.campaignCreatives.id, creativeId))
  return success(c, {
    id: updated.id, campaign_id: updated.campaignId, format: updated.format, headline: updated.headline,
    hook: updated.hook, script: updated.script, approved: !!updated.approved, version: updated.version,
    created_at: updated.createdAt, updated_at: updated.updatedAt,
  })
}))

app.delete('/creatives/:creativeId', guard(async (c) => {
  const creativeId = Number(c.req.param('creativeId'))
  const [cr] = await db.select().from(schema.campaignCreatives).where(eq(schema.campaignCreatives.id, creativeId))
  if (!cr) throw new AppError('ไม่พบครีเอทีฟนี้', E.NOT_FOUND)
  await db.delete(schema.campaignCreatives).where(eq(schema.campaignCreatives.id, creativeId))
  return success(c, { deleted: true })
}))

export default app
