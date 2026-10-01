/**
 * AI Marketer campaign jobs — 异步执行，状态持久化到 pipeline_tasks
 * （kind: campaign_research / campaign_strategy / campaign_creatives / campaign_refine，
 *   key: campaign:<id>:<step>）。marketer Agent 无工具：上下文全部在用户消息里，
 *   一次 generate 直接返回成品文本；多步任务（策略 4 文档 / 多创意）在步骤间协作式取消。
 */
import { and, eq, like } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { startTask, updateTask, getTask, isCancelRequested } from './pipeline-tasks.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

export const STRATEGY_DOC_KINDS = [
  { kind: 'persona', title: 'Audience Persona' },
  { kind: 'competition', title: 'Competitive Landscape' },
  { kind: 'positioning', title: 'Positioning & Messaging' },
  { kind: 'channel_plan', title: 'Channel & Content Plan' },
] as const

export const CREATIVE_FORMATS = ['video_30s', 'video_15s', 'ugc_script', 'ad_copy'] as const

export function campaignResearchKey(id: number) { return `campaign:${id}:research` }
export function campaignStrategyKey(id: number) { return `campaign:${id}:strategy` }
export function campaignCreativesKey(id: number) { return `campaign:${id}:creatives` }
export function campaignRefineKey(id: number, docId: number) { return `campaign:${id}:refine:${docId}` }

/** หางานที่กำลังรันของแคมเปญนี้ (มีงานเดียวเสมอ — เราไม่อนุญาตให้รันซ้อน) */
export async function getRunningCampaignJob(campaignId: number): Promise<{ key: string; kind: string } | null> {
  const [row] = await db.select().from(schema.pipelineTasks)
    .where(and(
      like(schema.pipelineTasks.key, `campaign:${campaignId}:%`),
      eq(schema.pipelineTasks.status, 'running'),
    ))
  return row ? { key: row.key, kind: row.kind } : null
}

type CampaignRow = typeof schema.campaigns.$inferSelect

function campaignContext(campaign: CampaignRow): string {
  const parts = [
    `【营销目标】${campaign.goal}`,
    campaign.brandContext ? `【品牌/产品背景】${campaign.brandContext}` : '',
    campaign.platform ? `【主要平台】${campaign.platform}` : '',
  ]
  return parts.filter(Boolean).join('\n')
}

/** campaign.language ('th'|'en'|'zh') → 内容语言设置 ('th'|'en')；缺省按全局设置 */
function campaignLanguage(campaign: CampaignRow): 'th' | 'en' | undefined {
  return campaign.language === 'en' ? 'en' : campaign.language === 'th' ? 'th' : undefined
}

async function runMarketer(campaign: CampaignRow, message: string, opts: { model?: string; configId?: number }): Promise<string> {
  const agent = mastra.getAgent('marketer')
  if (!agent) throw new Error('marketer agent 不可用')
  const requestContext = buildAgentRequestContext({
    episodeId: 0,
    dramaId: 0,
    modelOverride: opts.model || undefined,
    textConfigId: opts.configId || undefined,
    language: campaignLanguage(campaign),
  })
  const result = await agent.generate([{ role: 'user', content: `${campaignContext(campaign)}\n\n${message}` }], {
    maxSteps: 5,
    requestContext,
  })
  const text = (result?.text || '').trim()
  if (!text) throw new Error('AI 返回了空结果')
  return text
}

/** 从 research 文本中拆出「## Highlights」节（bullets），正文与要点分开存 */
function parseHighlights(text: string): { content: string; highlights: string[] } {
  const idx = text.lastIndexOf('## Highlights')
  if (idx === -1) return { content: text.trim(), highlights: [] }
  const content = text.slice(0, idx).trim()
  const highlights = text.slice(idx + '## Highlights'.length)
    .split('\n')
    .map(l => l.replace(/^\s*[•\-*\d.]+\s*/, '').trim())
    .filter(Boolean)
  return { content, highlights }
}

/** 解析多个创意：块间用「===」分隔；每块 HEADLINE: / HOOK: 行 + 其余为脚本。解析失败时整块回退为单个创意 */
function parseCreatives(text: string, formats: string[]): Array<{ format: string; headline: string; hook: string; script: string }> {
  const blocks = text.split(/^\s*===+\s*$/m).map(b => b.trim()).filter(Boolean)
  const out: Array<{ format: string; headline: string; hook: string; script: string }> = []
  for (const block of blocks) {
    const headlineMatch = /^HEADLINE:\s*(.+)$/im.exec(block)
    const hookMatch = /^HOOK:\s*(.+)$/im.exec(block)
    if (!headlineMatch) {
      out.push({ format: formats[out.length % formats.length], headline: block.split('\n')[0].slice(0, 120), hook: '', script: block })
      continue
    }
    const script = block
      .split('\n')
      .filter(l => !/^HEADLINE:/i.test(l) && !/^HOOK:/i.test(l))
      .join('\n')
      .trim()
    out.push({
      format: formats[out.length % formats.length],
      headline: headlineMatch[1].trim(),
      hook: hookMatch ? hookMatch[1].trim() : '',
      script,
    })
  }
  return out
}

function hasAnyContent(campaign: CampaignRow, docsCount = 0, creativesCount = 0): boolean {
  return !!campaign.research || docsCount > 0 || creativesCount > 0
}

async function countDocs(campaignId: number): Promise<number> {
  const rows = await db.select().from(schema.campaignDocs).where(eq(schema.campaignDocs.campaignId, campaignId))
  return rows.length
}

async function countCreatives(campaignId: number): Promise<number> {
  const rows = await db.select().from(schema.campaignCreatives).where(eq(schema.campaignCreatives.campaignId, campaignId))
  return rows.length
}

async function setCampaignStatus(campaignId: number, status: 'draft' | 'running' | 'done' | 'error') {
  await db.update(schema.campaigns).set({ status, updatedAt: now() }).where(eq(schema.campaigns.id, campaignId))
}

function now() { return new Date().toISOString() }

async function reloadCampaign(campaignId: number): Promise<CampaignRow> {
  const [row] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId))
  return row
}

// === Research ===

export async function startResearchJob(campaign: CampaignRow, opts: { model?: string; configId?: number }): Promise<boolean> {
  const key = campaignResearchKey(campaign.id)
  const task = await startTask({ kind: 'campaign_research', key, total: 1 })
  if (!task) return false
  await setCampaignStatus(campaign.id, 'running')
  logTaskStart('Campaign', 'research', { campaignId: campaign.id, model: opts.model || undefined, configId: opts.configId || undefined })
  ;(async () => {
    if (await isCancelRequested(key)) {
      await updateTask(key, { status: 'cancelled', finishedAt: now() })
      await setCampaignStatus(campaign.id, 'draft')
      return
    }
    const text = await runMarketer(campaign,
      '请为本项目生成市场研究简报（research brief）：按「市场概况 / 目标受众画像 / 竞品与内容格局 / 机会点」Markdown 分节输出，最后一节为「## Highlights」用 5 条「• 」要点列出最重要结论。',
      opts)
    const { content, highlights } = parseHighlights(text)
    await db.update(schema.campaigns)
      .set({ research: JSON.stringify({ content, highlights }), updatedAt: now() })
      .where(eq(schema.campaigns.id, campaign.id))
    await updateTask(key, { status: 'done', completed: 1, finishedAt: now() })
    await setCampaignStatus(campaign.id, 'done')
    logTaskSuccess('Campaign', 'research', { campaignId: campaign.id, chars: content.length })
  })().catch(async (err: any) => {
    await updateTask(key, { status: 'error', errorMsg: err?.message || 'research failed', errorCode: err?.errorCode || null, finishedAt: now() })
    await setCampaignStatus(campaign.id, 'error')
    logTaskError('Campaign', 'research', { campaignId: campaign.id, error: err?.message })
  })
  return true
}

// === Strategy（4 docs，逐份生成，步骤间可取消）===

export async function startStrategyJob(campaign: CampaignRow, opts: { model?: string; configId?: number }): Promise<boolean> {
  const key = campaignStrategyKey(campaign.id)
  const task = await startTask({ kind: 'campaign_strategy', key, total: STRATEGY_DOC_KINDS.length })
  if (!task) return false
  await setCampaignStatus(campaign.id, 'running')
  logTaskStart('Campaign', 'strategy', { campaignId: campaign.id })
  ;(async () => {
    const fresh = await reloadCampaign(campaign.id)
    if (!fresh) throw new Error('campaign 不存在')
    let completed = 0
    for (const doc of STRATEGY_DOC_KINDS) {
      if (await isCancelRequested(key)) {
        await updateTask(key, { status: 'cancelled', finishedAt: now() })
        await setCampaignStatus(campaign.id, hasAnyContent(fresh, await countDocs(campaign.id)) ? 'done' : 'draft')
        return
      }
      await updateTask(key, { currentKey: doc.kind })
      const [existing] = await db.select().from(schema.campaignDocs)
        .where(and(eq(schema.campaignDocs.campaignId, campaign.id), eq(schema.campaignDocs.kind, doc.kind)))
      const reference = existing?.content
        ? `\n\n【上一版文档（本次重新生成，可保留其中仍然成立的判断）】\n${existing.content}`
        : ''
      const content = await runMarketer(fresh,
        `请撰写营销策略文档「${doc.title}」（kind=${doc.kind}）：完整成稿，Markdown 分节，观点先行，每条建议可执行。${reference}`,
        opts)
      if (existing) {
        await db.update(schema.campaignDocs)
          .set({ content, version: existing.version + 1, updatedAt: now() })
          .where(eq(schema.campaignDocs.id, existing.id))
      } else {
        await db.insert(schema.campaignDocs).values({
          campaignId: campaign.id,
          kind: doc.kind,
          title: doc.title,
          content,
          version: 1,
          updatedAt: now(),
        })
      }
      completed += 1
      await updateTask(key, { completed, currentKey: doc.kind })
      logTaskProgress('Campaign', `strategy:${doc.kind}`, { campaignId: campaign.id, completed, chars: content.length })
    }
    await updateTask(key, { status: 'done', finishedAt: now() })
    await setCampaignStatus(campaign.id, 'done')
    logTaskSuccess('Campaign', 'strategy', { campaignId: campaign.id, docs: completed })
  })().catch(async (err: any) => {
    await updateTask(key, { status: 'error', errorMsg: err?.message || 'strategy failed', errorCode: err?.errorCode || null, finishedAt: now() })
    await setCampaignStatus(campaign.id, 'error')
    logTaskError('Campaign', 'strategy', { campaignId: campaign.id, error: err?.message })
  })
  return true
}

// === Creatives（N 个，逐个生成，步骤间可取消）===

export async function startCreativesJob(
  campaign: CampaignRow,
  params: { count: number; formats: string[] },
  opts: { model?: string; configId?: number },
): Promise<boolean> {
  const key = campaignCreativesKey(campaign.id)
  const task = await startTask({ kind: 'campaign_creatives', key, total: params.count })
  if (!task) return false
  await setCampaignStatus(campaign.id, 'running')
  logTaskStart('Campaign', 'creatives', { campaignId: campaign.id, count: params.count, formats: params.formats.join(',') })
  ;(async () => {
    const formatList = params.formats.join(' / ')
    const message = `请基于策略生成 ${params.count} 个广告创意（格式：${formatList}；依次各占一个格式，不足时循环使用）。创意之间用单独一行「===」分隔。每个创意第一行「HEADLINE: 」，第二行「HOOK: 」，其后是 3 秒一段的分镜脚本（【0-3s】…），可直接拍摄。`
    const text = await runMarketer(campaign, message, opts)
    const parsed = parseCreatives(text, params.formats)
    let completed = 0
    for (const cr of parsed.slice(0, params.count)) {
      if (await isCancelRequested(key)) break
      await db.insert(schema.campaignCreatives).values({
        campaignId: campaign.id,
        format: cr.format,
        headline: cr.headline,
        hook: cr.hook || null,
        script: cr.script,
        approved: false,
        version: 1,
        createdAt: now(),
        updatedAt: now(),
      })
      completed += 1
      await updateTask(key, { completed, currentKey: cr.format })
    }
    await updateTask(key, { status: 'done', finishedAt: now() })
    await setCampaignStatus(campaign.id, 'done')
    logTaskSuccess('Campaign', 'creatives', { campaignId: campaign.id, creatives: completed })
  })().catch(async (err: any) => {
    await updateTask(key, { status: 'error', errorMsg: err?.message || 'creatives failed', errorCode: err?.errorCode || null, finishedAt: now() })
    await setCampaignStatus(campaign.id, 'error')
    logTaskError('Campaign', 'creatives', { campaignId: campaign.id, error: err?.message })
  })
  return true
}

// === Refine（单文档修订）===

export async function startRefineJob(
  campaign: CampaignRow,
  doc: typeof schema.campaignDocs.$inferSelect,
  instruction: string,
  opts: { model?: string; configId?: number },
): Promise<boolean> {
  const key = campaignRefineKey(campaign.id, doc.id)
  const task = await startTask({ kind: 'campaign_refine', key, total: 1 })
  if (!task) return false
  await setCampaignStatus(campaign.id, 'running')
  logTaskStart('Campaign', `refine:${doc.kind}`, { campaignId: campaign.id, docId: doc.id })
  ;(async () => {
    const content = await runMarketer(campaign,
      `以下是需要修订的营销策略文档「${doc.title}」：\n\n${doc.content}\n\n请按以下修订指令重写并输出修订后的完整文档（保持结构，直接输出全文）：\n${instruction}`,
      opts)
    await db.update(schema.campaignDocs)
      .set({ content, version: doc.version + 1, updatedAt: now() })
      .where(eq(schema.campaignDocs.id, doc.id))
    await updateTask(key, { status: 'done', completed: 1, finishedAt: now() })
    await setCampaignStatus(campaign.id, 'done')
    logTaskSuccess('Campaign', `refine:${doc.kind}`, { campaignId: campaign.id, chars: content.length })
  })().catch(async (err: any) => {
    await updateTask(key, { status: 'error', errorMsg: err?.message || 'refine failed', errorCode: err?.errorCode || null, finishedAt: now() })
    await setCampaignStatus(campaign.id, 'error')
    logTaskError('Campaign', 'refine', { campaignId: campaign.id, docId: doc.id, error: err?.message })
  })
  return true
}

// === 状态查询（contract: GET …-status payload）===

export type CampaignJobStatus = {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled'
  kind?: string
  total?: number
  completed?: number
  failed?: number
  current_key?: string | null
  error_msg?: string | null
  /** รหัสข้อผิดพลาดเสถียร (AppError.errorCode เช่น E_NO_TEXT_MODEL) → frontend แปลผ่าน errors.codes.* */
  error_code?: string | null
  result?: null
}

export async function getJobStatus(key: string, kind: string): Promise<CampaignJobStatus> {
  const row = await getTask(key)
  if (!row) return { status: 'idle', kind }
  return {
    status: row.status,
    kind,
    total: row.total || 0,
    completed: row.completed || 0,
    failed: row.failed || 0,
    current_key: row.status === 'running' ? row.currentKey : null,
    error_msg: row.status === 'error' ? row.errorMsg : null,
    error_code: row.status === 'error' ? row.errorCode : null,
    result: null,
  }
}
