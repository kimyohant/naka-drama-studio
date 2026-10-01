<template>
  <div class="studio" v-if="campaign">
    <!-- ===== Topbar ===== -->
    <header class="mk-topbar">
      <div class="mk-topbar-main">
        <button class="back-btn" @click="navigateTo('/marketer')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ t('marketer.work.back') }}
        </button>
        <div class="mk-identity">
          <h1 class="mk-c-title truncate">{{ campaign.title || t('marketer.create.untitled') }}</h1>
          <div class="mk-meta-row">
            <span class="tag" :class="statusTagClass">{{ statusLabelText }}</span>
            <span v-if="campaign.platform" class="tag tag-accent">{{ platformLabel(campaign.platform) }}</span>
            <span class="mk-stage-inline">{{ currentStageLabel }}</span>
          </div>
        </div>
      </div>
      <div class="mk-topbar-side">
        <ModelSelect
          v-if="textModelOptions.length"
          v-model="textModel"
          :label="t('common.serviceType.text')"
          :options="textModelOptions"
          :default-label="t('marketer.work.defaultModel')"
          :show-config="textModelMultiCfg"
        />
        <button class="btn" @click="refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          {{ t('common.refresh') }}
        </button>
      </div>
    </header>

    <div class="studio-body">
      <!-- ===== LEFT SIDEBAR : stage pipeline ===== -->
      <aside class="mk-sidebar">
        <nav class="mk-stages">
          <button
            v-for="(s, i) in stages"
            :key="s.id"
            :class="['mk-stage', { active: stage === s.id, done: stageDone(s.id) }]"
            @click="stage = s.id"
          >
            <span class="mk-stage-state">
              <svg v-if="stageDone(s.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else-if="stage === s.id" class="mk-stage-pulse" />
              <span v-else class="mk-stage-num">{{ i + 1 }}</span>
            </span>
            <span class="mk-stage-copy">
              <span class="mk-stage-label">{{ s.label }}</span>
              <span class="mk-stage-sub">{{ s.sub }}</span>
            </span>
          </button>
        </nav>

        <!-- Progress rail (แบบเดียวกับ episode.vue sidebar-progress) -->
        <div class="mk-rail">
          <div class="mk-rail-head">
            <span class="mk-rail-title">{{ currentStageLabel }}</span>
            <span class="mk-rail-count">{{ stageIdx + 1 }}/{{ stages.length }}</span>
          </div>
          <div class="mk-rail-track">
            <button
              v-for="(s, i) in stages"
              :key="s.id"
              type="button"
              :class="['mk-rail-seg', { done: i < stageIdx || stageDone(s.id), current: i === stageIdx }]"
              :title="s.label"
              @click="stage = s.id"
            ><span class="mk-rail-fill" /></button>
          </div>
        </div>
      </aside>

      <!-- ===== MAIN ===== -->
      <main class="mk-main">

        <!-- ========== 1 GOAL ========== -->
        <section v-if="stage === 'goal'" class="panel">
          <div class="panel-head">
            <h2 class="panel-title">{{ t('marketer.goal.title') }}</h2>
            <p class="panel-desc">{{ t('marketer.goal.desc') }}</p>
          </div>
          <div class="goal-form">
            <label class="mk-field">
              <span class="mk-field-label">{{ t('marketer.create.titleField') }}</span>
              <input v-model.trim="edit.title" class="input" :placeholder="t('marketer.create.titlePlaceholder')" />
            </label>
            <label class="mk-field">
              <span class="mk-field-label">{{ t('marketer.create.goal') }} <span class="mk-required">*</span></span>
              <textarea v-model="edit.goal" class="textarea" rows="4" :placeholder="t('marketer.create.goalPlaceholder')"></textarea>
            </label>
            <label class="mk-field">
              <span class="mk-field-label">{{ t('marketer.create.brandContext') }}</span>
              <textarea v-model="edit.brand_context" class="textarea" rows="5" :placeholder="t('marketer.create.brandPlaceholder')"></textarea>
            </label>
            <div class="mk-field-row">
              <label class="mk-field">
                <span class="mk-field-label">{{ t('marketer.create.platform') }}</span>
                <BaseSelect v-model="edit.platform" :options="platformOptions" :searchable="false" />
              </label>
              <label class="mk-field">
                <span class="mk-field-label">{{ t('marketer.create.language') }}</span>
                <BaseSelect v-model="edit.language" :options="languageOptions" :searchable="false" />
              </label>
            </div>
            <div class="goal-actions">
              <button class="btn" :disabled="saving" @click="saveGoal">
                <Loader2 v-if="saving" :size="13" class="animate-spin" />
                {{ t('common.save') }}
              </button>
              <button
                class="btn btn-primary"
                :disabled="anyJobRunning || !edit.goal.trim() || saving"
                :title="anyJobRunning ? t('marketer.job.busy') : undefined"
                @click="startResearch"
              >
                <Loader2 v-if="jobs.research.status === 'running'" :size="13" class="animate-spin" />
                <Sparkles v-else :size="13" :stroke-width="2" />
                {{ t('marketer.goal.startResearch') }}
              </button>
            </div>
          </div>
        </section>

        <!-- ========== 2 RESEARCH ========== -->
        <section v-else-if="stage === 'research'" class="panel">
          <div class="panel-head">
            <h2 class="panel-title">{{ t('marketer.research.title') }}</h2>
            <p class="panel-desc">{{ t('marketer.research.desc') }}</p>
          </div>

          <div v-if="jobs.research.status === 'running'" class="job-running">
            <Loader2 :size="16" class="animate-spin" />
            <span>{{ t('marketer.research.running') }}</span>
            <button class="btn btn-sm" @click="cancelJob('research')">{{ t('marketer.job.cancel') }}</button>
          </div>

          <template v-else>
            <div v-if="campaign.research?.content" class="doc-view-wrap">
              <div class="doc-view-toolbar">
                <span class="doc-version">{{ t('marketer.research.brief') }}</span>
                <button class="btn btn-sm" :disabled="anyJobRunning" @click="startResearch">
                  <Sparkles :size="12" :stroke-width="2" />
                  {{ t('marketer.research.regenerate') }}
                </button>
              </div>
              <div class="doc-view" role="article">{{ campaign.research.content }}</div>
              <ul v-if="campaign.research.highlights?.length" class="research-highlights">
                <li v-for="(h, i) in campaign.research.highlights" :key="i">{{ h }}</li>
              </ul>
            </div>
            <div v-else class="step-empty">
              <Search :size="24" :stroke-width="1.5" />
              <p class="empty-note">{{ t('marketer.research.empty') }}</p>
              <button class="btn btn-primary" :disabled="anyJobRunning || !campaign.goal" @click="startResearch">
                <Sparkles :size="13" :stroke-width="2" />
                {{ t('marketer.goal.startResearch') }}
              </button>
            </div>
            <div class="stage-next">
              <button class="btn btn-primary" :disabled="!campaign.research?.content" @click="stage = 'strategy'">
                {{ t('marketer.research.next') }}
                <ArrowRight :size="13" :stroke-width="2" />
              </button>
            </div>
          </template>
        </section>

        <!-- ========== 3 STRATEGY (4 docs) ========== -->
        <section v-else-if="stage === 'strategy'" class="panel">
          <div class="panel-head">
            <h2 class="panel-title">{{ t('marketer.strategy.title') }}</h2>
            <p class="panel-desc">{{ t('marketer.strategy.desc') }}</p>
          </div>

          <div v-if="jobs.strategy.status === 'running'" class="job-running">
            <Loader2 :size="16" class="animate-spin" />
            <span>{{ t('marketer.strategy.progress', { done: jobs.strategy.completed, total: jobs.strategy.total || 4 }) }}</span>
            <span v-if="jobs.strategy.current_key" class="tag tag-accent">{{ docKindLabel(jobs.strategy.current_key) }}</span>
            <button class="btn btn-sm" @click="cancelJob('strategy')">{{ t('marketer.job.cancel') }}</button>
          </div>

          <template v-else>
            <div v-if="!docs.length" class="step-empty">
              <FileText :size="24" :stroke-width="1.5" />
              <p class="empty-note">{{ t('marketer.strategy.empty') }}</p>
              <button class="btn btn-primary" :disabled="!campaign.research?.content" @click="startStrategy">
                <Sparkles :size="13" :stroke-width="2" />
                {{ t('marketer.strategy.generateAll') }}
              </button>
              <p v-if="!campaign.research?.content" class="empty-guard">{{ t('marketer.strategy.needResearch') }}</p>
            </div>

            <template v-else>
              <div class="doc-grid">
                <button
                  v-for="d in docs"
                  :key="d.id"
                  type="button"
                  :class="['doc-card', { on: openDocId === d.id }]"
                  @click="toggleOpenDoc(d)"
                >
                  <span class="doc-card-head">
                    <span class="doc-kind">{{ docKindLabel(d.kind) }}</span>
                    <span class="doc-version">v{{ d.version }}</span>
                  </span>
                  <span class="doc-card-title">{{ d.title }}</span>
                  <span class="doc-card-snippet">{{ d.content }}</span>
                </button>
              </div>
              <div class="stage-next split">
                <button class="btn" :disabled="anyJobRunning" @click="startStrategy">
                  <Sparkles :size="13" :stroke-width="2" />
                  {{ t('marketer.strategy.regenerateAll') }}
                </button>
                <button class="btn btn-primary" :disabled="!docs.length" @click="stage = 'creatives'">
                  {{ t('marketer.strategy.next') }}
                  <ArrowRight :size="13" :stroke-width="2" />
                </button>
              </div>

              <!-- Doc editor -->
              <div v-if="openDoc" class="doc-editor">
                <div class="doc-editor-head">
                  <span class="doc-kind">{{ docKindLabel(openDoc.kind) }}</span>
                  <h3 class="doc-editor-title">{{ openDoc.title }}</h3>
                  <span class="doc-version">v{{ openDoc.version }}</span>
                  <button class="btn btn-icon" :title="t('common.close')" @click="openDocId = null">
                    <X :size="14" :stroke-width="1.8" />
                  </button>
                </div>
                <textarea v-model="docEdit.content" class="textarea doc-textarea" rows="14" :disabled="jobs.refine.status === 'running'"></textarea>
                <div class="doc-editor-actions">
                  <button class="btn" :disabled="docSaving || jobs.refine.status === 'running'" @click="saveDoc">
                    <Loader2 v-if="docSaving" :size="13" class="animate-spin" />
                    {{ t('common.save') }}
                  </button>
                  <div class="refine-row">
                    <input
                      v-model.trim="docEdit.instruction"
                      class="input"
                      :placeholder="t('marketer.strategy.refinePlaceholder')"
                      :disabled="jobs.refine.status === 'running'"
                      @keydown.enter.prevent="refineDoc"
                    />
                    <button class="btn btn-primary" :disabled="anyJobRunning || !docEdit.instruction" @click="refineDoc">
                      <Loader2 v-if="jobs.refine.status === 'running'" :size="13" class="animate-spin" />
                      <Wand2 v-else :size="13" :stroke-width="2" />
                      {{ jobs.refine.status === 'running' ? t('marketer.strategy.refining') : t('marketer.strategy.refine') }}
                    </button>
                    <button v-if="jobs.refine.status === 'running'" class="btn btn-sm" @click="cancelJob('refine')">{{ t('marketer.job.cancel') }}</button>
                  </div>
                </div>
              </div>
            </template>
          </template>
        </section>

        <!-- ========== 4 CREATIVES ========== -->
        <section v-else-if="stage === 'creatives'" class="panel">
          <div class="panel-head">
            <h2 class="panel-title">{{ t('marketer.creatives.title') }}</h2>
            <p class="panel-desc">{{ t('marketer.creatives.desc') }}</p>
          </div>

          <div v-if="jobs.creatives.status === 'running'" class="job-running">
            <Loader2 :size="16" class="animate-spin" />
            <span>{{ t('marketer.creatives.progress', { done: jobs.creatives.completed, total: jobs.creatives.total || genCount }) }}</span>
            <button class="btn btn-sm" @click="cancelJob('creatives')">{{ t('marketer.job.cancel') }}</button>
          </div>

          <template v-else>
            <div class="gen-bar">
              <div class="gen-formats">
                <button
                  v-for="f in creativeFormats"
                  :key="f.value"
                  type="button"
                  :class="['filter-chip', { on: genFormats.includes(f.value) }]"
                  @click="toggleFormat(f.value)"
                >{{ f.label }}</button>
              </div>
              <div class="gen-controls">
                <label class="gen-count">
                  <span>{{ t('marketer.creatives.count') }}</span>
                  <BaseSelect v-model="genCount" :options="countOptions" :searchable="false" />
                </label>
                <button class="btn btn-primary" :disabled="anyJobRunning || !docs.length" @click="generateCreatives">
                  <Sparkles :size="13" :stroke-width="2" />
                  {{ creatives.length ? t('marketer.creatives.generateMore') : t('marketer.creatives.generate') }}
                </button>
              </div>
            </div>
            <p v-if="!docs.length" class="empty-guard">{{ t('marketer.creatives.needDocs') }}</p>

            <div v-if="creatives.length" class="creative-list">
              <article v-for="cr in creatives" :key="cr.id" class="creative-card" :class="{ approved: cr.approved }">
                <div class="creative-head">
                  <span class="tag tag-accent">{{ formatLabel(cr.format) }}</span>
                  <span v-if="cr.approved" class="tag tag-success">{{ t('marketer.creatives.approvedTag') }}</span>
                  <div class="creative-tools">
                    <button class="btn btn-icon" :title="t('marketer.creatives.edit')" @click="startEditCreative(cr)">
                      <Pencil :size="13" :stroke-width="1.8" />
                    </button>
                    <button class="btn btn-icon" :title="t('marketer.creatives.delete')" @click="toDeleteCreative = cr">
                      <Trash2 :size="13" :stroke-width="1.8" />
                    </button>
                  </div>
                </div>
                <template v-if="editingCreativeId === cr.id">
                  <label class="mk-field">
                    <span class="mk-field-label">{{ t('marketer.creatives.headline') }}</span>
                    <input v-model="creativeEdit.headline" class="input" />
                  </label>
                  <label class="mk-field">
                    <span class="mk-field-label">{{ t('marketer.creatives.hook') }}</span>
                    <input v-model="creativeEdit.hook" class="input" />
                  </label>
                  <label class="mk-field">
                    <span class="mk-field-label">{{ t('marketer.creatives.script') }}</span>
                    <textarea v-model="creativeEdit.script" class="textarea" rows="10"></textarea>
                  </label>
                  <div class="creative-edit-actions">
                    <button class="btn" @click="editingCreativeId = null">{{ t('common.cancel') }}</button>
                    <button class="btn btn-primary" :disabled="creativeSaving" @click="saveCreative(cr)">
                      <Loader2 v-if="creativeSaving" :size="13" class="animate-spin" />
                      {{ t('common.save') }}
                    </button>
                  </div>
                </template>
                <template v-else>
                  <h3 class="creative-headline">{{ cr.headline }}</h3>
                  <p v-if="cr.hook" class="creative-hook"><Zap :size="11" :stroke-width="1.8" /> {{ cr.hook }}</p>
                  <div class="doc-view creative-script" role="article">{{ cr.script }}</div>
                  <div class="creative-foot">
                    <button class="btn btn-sm" :class="cr.approved ? '' : 'btn-primary'" @click="toggleApprove(cr)">
                      <Check v-if="cr.approved" :size="12" :stroke-width="2.2" />
                      {{ cr.approved ? t('marketer.creatives.unapprove') : t('marketer.creatives.approve') }}
                    </button>
                  </div>
                </template>
              </article>
            </div>
            <div v-else-if="docs.length" class="step-empty">
              <Megaphone :size="24" :stroke-width="1.5" />
              <p class="empty-note">{{ t('marketer.creatives.empty') }}</p>
            </div>
          </template>
        </section>

        <!-- ========== 5 REVIEW / REFINE ========== -->
        <section v-else class="panel">
          <div class="panel-head">
            <h2 class="panel-title">{{ t('marketer.review.title') }}</h2>
            <p class="panel-desc">{{ t('marketer.review.desc') }}</p>
          </div>

          <div class="review-checklist">
            <div v-for="item in reviewItems" :key="item.key" :class="['review-item', { ok: item.done }]">
              <span class="review-check">
                <Check v-if="item.done" :size="12" :stroke-width="2.4" />
                <span v-else class="review-dot" />
              </span>
              <span class="review-label">{{ item.label }}</span>
              <button class="btn btn-sm review-jump" @click="stage = item.jump">{{ t('marketer.review.go') }}</button>
            </div>
          </div>

          <div class="review-actions">
            <button class="btn btn-primary" :disabled="!canCopyAll" @click="copyAll">
              <Copy :size="13" :stroke-width="2" />
              {{ t('marketer.review.copyAll') }}
            </button>
          </div>
        </section>
      </main>
    </div>

    <ConfirmDialog
      :open="!!toDeleteCreative"
      :title="t('marketer.creatives.deleteTitle')"
      :message="t('marketer.creatives.deleteMessage', { title: toDeleteCreative?.headline || '' })"
      :confirm-text="t('common.delete')"
      :loading-text="t('common.deleteLoading')"
      :loading="creativeDeleting"
      @confirm="removeCreative"
      @cancel="toDeleteCreative = null"
    />
  </div>

  <!-- Campaign not found / still loading -->
  <div v-else class="studio mk-loading">
    <div v-if="loadFailed" class="step-empty">
      <CircleAlert :size="24" :stroke-width="1.5" />
      <p class="empty-note">{{ t('marketer.work.notFound') }}</p>
      <button class="btn" @click="navigateTo('/marketer')">{{ t('marketer.work.backToList') }}</button>
    </div>
    <Loader2 v-else :size="22" class="animate-spin" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  ArrowRight, Check, CircleAlert, Copy, FileText, Loader2, Megaphone,
  Pencil, Search, Sparkles, Trash2, Wand2, X, Zap,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
  campaignAPI, bareModelName, collectTextModelOptions, ownerConfigId, pollJob, stopPolling,
  type MarketerJobStatus, type PollHandle,
} from '~/composables/useMarketer'
import { aiConfigAPI } from '~/composables/useApi'
import { toastError } from '~/composables/useToast'

const { t } = useI18n()
const route = useRoute()
const campaignId = Number(route.params.id)

// === data ===
const campaign = ref<any | null>(null)
const docs = ref<any[]>([])
const creatives = ref<any[]>([])
const loadFailed = ref(false)

// === stage pipeline ===
type StageId = 'goal' | 'research' | 'strategy' | 'creatives' | 'review'
const stage = ref<StageId>('goal')
const stages = computed(() => [
  { id: 'goal' as StageId, label: t('marketer.stages.goal'), sub: t('marketer.stages.goalSub') },
  { id: 'research' as StageId, label: t('marketer.stages.research'), sub: t('marketer.stages.researchSub') },
  { id: 'strategy' as StageId, label: t('marketer.stages.strategy'), sub: t('marketer.stages.strategySub') },
  { id: 'creatives' as StageId, label: t('marketer.stages.creatives'), sub: t('marketer.stages.creativesSub') },
  { id: 'review' as StageId, label: t('marketer.stages.review'), sub: t('marketer.stages.reviewSub') },
])
const stageIdx = computed(() => Math.max(0, stages.value.findIndex((s) => s.id === stage.value)))
const currentStageLabel = computed(() => stages.value[stageIdx.value]?.label || '')

function stageDone(id: StageId): boolean {
  if (!campaign.value) return false
  if (id === 'goal') return !!campaign.value.goal
  if (id === 'research') return !!campaign.value.research?.content
  if (id === 'strategy') return docs.value.length > 0
  if (id === 'creatives') return creatives.value.length > 0
  return creatives.value.some((c) => c.approved)
}

// === model selection (text only) ===
const textConfigs = ref<any[]>([])
const textModel = ref('')
const textModelOptions = computed(() => collectTextModelOptions(textConfigs.value))
const textModelMultiCfg = computed(() => new Set(textModelOptions.value.map((o) => o.configId)).size > 1)
function textModelParams() {
  return { model: bareModelName(textModel.value) || undefined, configId: ownerConfigId(textModelOptions.value, textModel.value) }
}

// === async jobs ===
const jobs = reactive<Record<'research' | 'strategy' | 'creatives' | 'refine', MarketerJobStatus>>({
  research: { status: 'idle' },
  strategy: { status: 'idle' },
  creatives: { status: 'idle' },
  refine: { status: 'idle' },
})
const pollHandles = new Set<PollHandle>()
const anyJobRunning = computed(() => Object.values(jobs).some((j) => j.status === 'running'))

function newHandle(): PollHandle {
  const h: PollHandle = { stopped: false }
  pollHandles.add(h)
  return h
}
onBeforeUnmount(() => {
  for (const h of pollHandles) h.stopped = true
})

async function poll(kind: 'research' | 'strategy' | 'creatives', fetchStatus: () => Promise<MarketerJobStatus>, onDone?: () => void) {
  jobs[kind] = { status: 'running' }
  try {
    const final = await pollJob(fetchStatus, { handle: newHandle(), onUpdate: (s) => { jobs[kind] = s } })
    jobs[kind] = final
    if (final.status === 'done') {
      toast.success(t('marketer.job.done'))
      await refresh()
      onDone?.()
    } else if (final.status === 'error') {
      toast.error(final.error_msg || t('errors.unknown'))
      await refresh()
    } else if (final.status === 'cancelled') {
      toast.info(t('marketer.job.cancelled'))
      await refresh()
    }
  } catch (e) {
    jobs[kind] = { status: 'error' }
    toastError(e)
    await refresh()
  }
}

async function cancelJob(kind: 'research' | 'strategy' | 'creatives' | 'refine', docId?: number) {
  try {
    if (kind === 'research') await campaignAPI.cancelResearch(campaignId)
    else if (kind === 'strategy') await campaignAPI.cancelStrategy(campaignId)
    else if (kind === 'creatives') await campaignAPI.cancelGenerate(campaignId)
    else if (kind === 'refine' && docId) await campaignAPI.cancelRefine(campaignId, docId)
  } catch (e) {
    toastError(e)
  }
}

function startResearch() {
  const p = textModelParams()
  poll('research', () => campaignAPI.researchStatus(campaignId), () => { /* research lands on campaign */ })
  campaignAPI.research(campaignId, p.model, p.configId).catch((e) => { toastError(e); stopAllPolling() })
  stage.value = 'research'
}

function startStrategy() {
  const p = textModelParams()
  poll('strategy', () => campaignAPI.strategyStatus(campaignId))
  campaignAPI.strategy(campaignId, p.model, p.configId).catch((e) => { toastError(e); stopAllPolling() })
}

async function refineDoc() {
  if (!openDoc.value || !docEdit.value.instruction) return
  const p = textModelParams()
  const docId = openDoc.value.id
  jobs.refine = { status: 'running' }
  try {
    const final = await pollJob(
      () => campaignAPI.refineStatus(campaignId, docId),
      { handle: newHandle(), onUpdate: (s) => { jobs.refine = s } },
    )
    jobs.refine = final
    if (final.status === 'done') {
      toast.success(t('marketer.strategy.refineDone'))
      await refresh()
    } else if (final.status === 'error') {
      toast.error(final.error_msg || t('errors.unknown'))
    } else if (final.status === 'cancelled') {
      toast.info(t('marketer.job.cancelled'))
    }
  } catch (e) {
    jobs.refine = { status: 'error' }
    toastError(e)
  }
  // refine POST หลังตั้ง polling เพราะ refine อาจเสร็จเร็วมาก (race กับ status แรก)
  campaignAPI.refineDoc(campaignId, docId, docEdit.value.instruction, p.model, p.configId)
    .catch((e) => { toastError(e); jobs.refine = { status: 'error' } })
}

async function generateCreatives() {
  const p = textModelParams()
  poll('creatives', () => campaignAPI.generateStatus(campaignId))
  try {
    await campaignAPI.generateCreatives(campaignId, {
      count: Number(genCount.value) || undefined,
      formats: genFormats.value,
      model: p.model,
      configId: p.configId,
    })
  } catch (e) {
    toastError(e)
    stopAllPolling()
  }
}

function stopAllPolling() {
  for (const h of pollHandles) h.stopped = true
  pollHandles.clear()
  for (const k of ['research', 'strategy', 'creatives', 'refine'] as const) {
    if (jobs[k].status === 'running') jobs[k] = { status: 'idle' }
  }
}

// === goal form ===
const edit = ref({ title: '', goal: '', brand_context: '', platform: 'tiktok', language: 'th' })
const saving = ref(false)

function fillEdit() {
  edit.value = {
    title: campaign.value?.title || '',
    goal: campaign.value?.goal || '',
    brand_context: campaign.value?.brand_context || '',
    platform: campaign.value?.platform || 'tiktok',
    language: campaign.value?.language || 'th',
  }
}

async function saveGoal() {
  if (!edit.value.goal.trim()) {
    toast.warning(t('marketer.create.goalRequired'))
    return
  }
  saving.value = true
  try {
    await campaignAPI.update(campaignId, {
      title: edit.value.title || undefined,
      goal: edit.value.goal,
      brand_context: edit.value.brand_context || undefined,
      platform: edit.value.platform || undefined,
      language: edit.value.language || undefined,
    })
    toast.success(t('marketer.goal.saved'))
    await refresh()
  } catch (e) {
    toastError(e)
  } finally {
    saving.value = false
  }
}

// === docs ===
const openDocId = ref<number | null>(null)
const openDoc = computed(() => docs.value.find((d) => d.id === openDocId.value) || null)
const docEdit = ref({ content: '', instruction: '' })
const docSaving = ref(false)

function openDocEditor(d: any) {
  openDocId.value = d.id
  docEdit.value = { content: d.content, instruction: '' }
}
function toggleOpenDoc(d: any) {
  if (openDocId.value === d.id) openDocId.value = null
  else openDocEditor(d)
}

async function saveDoc() {
  if (!openDoc.value) return
  docSaving.value = true
  try {
    await campaignAPI.updateDoc(campaignId, openDoc.value.id, { content: docEdit.value.content })
    toast.success(t('marketer.strategy.saved'))
    await refresh()
  } catch (e) {
    toastError(e)
  } finally {
    docSaving.value = false
  }
}

// === creatives ===
const genCount = ref('3')
const genFormats = ref<string[]>(['video_30s', 'video_15s', 'ugc_script', 'ad_copy'])
const creativeFormats = [
  { label: t('marketer.format.video_30s'), value: 'video_30s' },
  { label: t('marketer.format.video_15s'), value: 'video_15s' },
  { label: t('marketer.format.ugc_script'), value: 'ugc_script' },
  { label: t('marketer.format.ad_copy'), value: 'ad_copy' },
]
const countOptions = [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: String(n) }))

function toggleFormat(v: string) {
  const i = genFormats.value.indexOf(v)
  if (i >= 0) genFormats.value.splice(i, 1)
  else genFormats.value.push(v)
}

const editingCreativeId = ref<number | null>(null)
const creativeEdit = ref({ headline: '', hook: '', script: '' })
const creativeSaving = ref(false)
const creativeDeleting = ref(false)
const toDeleteCreative = ref<any | null>(null)

function startEditCreative(cr: any) {
  editingCreativeId.value = cr.id
  creativeEdit.value = { headline: cr.headline || '', hook: cr.hook || '', script: cr.script || '' }
}

async function saveCreative(cr: any) {
  creativeSaving.value = true
  try {
    await campaignAPI.updateCreative(cr.id, {
      headline: creativeEdit.value.headline,
      hook: creativeEdit.value.hook || undefined,
      script: creativeEdit.value.script,
    })
    toast.success(t('marketer.creatives.saved'))
    editingCreativeId.value = null
    await refresh()
  } catch (e) {
    toastError(e)
  } finally {
    creativeSaving.value = false
  }
}

async function toggleApprove(cr: any) {
  try {
    await campaignAPI.updateCreative(cr.id, { approved: !cr.approved })
    await refresh()
  } catch (e) {
    toastError(e)
  }
}

async function removeCreative() {
  if (!toDeleteCreative.value) return
  creativeDeleting.value = true
  try {
    await campaignAPI.delCreative(toDeleteCreative.value.id)
    toast.success(t('marketer.creatives.deleted'))
    toDeleteCreative.value = null
    await refresh()
  } catch (e) {
    toastError(e)
  } finally {
    creativeDeleting.value = false
  }
}

// === review ===
const reviewItems = computed(() => [
  { key: 'research', done: stageDone('research'), label: t('marketer.review.checkResearch'), jump: 'research' as StageId },
  { key: 'docs', done: docs.value.length >= 4, label: t('marketer.review.checkDocs', { n: docs.value.length }), jump: 'strategy' as StageId },
  { key: 'creatives', done: creatives.value.length > 0, label: t('marketer.review.checkCreatives', { n: creatives.value.length }), jump: 'creatives' as StageId },
  { key: 'approved', done: creatives.value.some((c) => c.approved), label: t('marketer.review.checkApproved', { n: creatives.value.filter((c) => c.approved).length }), jump: 'creatives' as StageId },
])
const canCopyAll = computed(() => !!campaign.value?.research?.content || docs.value.length > 0 || creatives.value.length > 0)

function buildMarkdown(): string {
  const c = campaign.value
  const lines: string[] = []
  lines.push(`# ${t('marketer.work.exportTitle', { title: c.title || t('marketer.create.untitled') })}`)
  if (c.goal) lines.push(`\n## ${t('marketer.stages.goal')}\n${c.goal}`)
  if (c.brand_context) lines.push(`\n## ${t('marketer.create.brandContext')}\n${c.brand_context}`)
  if (c.research?.content) lines.push(`\n## ${t('marketer.research.brief')}\n${c.research.content}`)
  for (const d of docs.value) {
    lines.push(`\n## ${docKindLabel(d.kind)} — ${d.title}\n${d.content}`)
  }
  for (const cr of creatives.value) {
    lines.push(`\n## ${formatLabel(cr.format)} — ${cr.headline}`)
    if (cr.hook) lines.push(`*${t('marketer.creatives.hook')}:* ${cr.hook}`)
    lines.push(`\n${cr.script}`)
  }
  return lines.join('\n')
}

async function copyAll() {
  try {
    await navigator.clipboard.writeText(buildMarkdown())
    toast.success(t('marketer.review.copied'))
  } catch {
    toast.error(t('errors.unknown'))
  }
}

// === labels ===
function docKindLabel(kind: string) {
  const known = ['persona', 'competition', 'positioning', 'channel_plan']
  return known.includes(kind) ? t(`marketer.docKind.${kind}`) : kind
}
function formatLabel(format: string) {
  const known = ['video_30s', 'video_15s', 'ugc_script', 'ad_copy']
  return known.includes(format) ? t(`marketer.format.${format}`) : format
}
function platformLabel(v: string) {
  const known = ['tiktok', 'instagram', 'youtube', 'facebook', 'xiaohongshu']
  return known.includes(v) ? t(`marketer.platform.${v}`) : v
}

const statusLabelText = computed(() => t(`marketer.status.${campaign.value?.status || 'draft'}`))
const statusTagClass = computed(() => {
  const map = { running: 'tag-info', done: 'tag-success', error: 'tag-error' }
  return map[campaign.value?.status || 'draft'] || 'tag-warning'
})

// === data load / resume ===
async function refresh() {
  try {
    const data = await campaignAPI.get(campaignId)
    campaign.value = data?.campaign || data
    docs.value = data?.docs || []
    creatives.value = data?.creatives || []
    if (openDocId.value) {
      const d = docs.value.find((x) => x.id === openDocId.value)
      if (d && jobs.refine.status !== 'running') docEdit.value.content = d.content
    }
  } catch (e: any) {
    if (e?.status === 404) loadFailed.value = true
    else toastError(e)
  }
}

/** กลับเข้ามาใหม่/รีเฟรชหน้า: ถ้ามีงาน running ค้าง ให้กลับมาโพลต่อ */
async function resumeRunningJobs() {
  try {
    const probes: [keyof typeof jobs, Promise<MarketerJobStatus>][] = [
      ['research', campaignAPI.researchStatus(campaignId)],
      ['strategy', campaignAPI.strategyStatus(campaignId)],
      ['creatives', campaignAPI.generateStatus(campaignId)],
    ]
    for (const [kind, p] of probes) {
      const s = await p.catch(() => null)
      if (s?.status === 'running') poll(kind, () => statusFor(kind))
    }
    if (campaign.value?.status === 'running') {
      for (const d of docs.value) {
        const s = await campaignAPI.refineStatus(campaignId, d.id).catch(() => null)
        if (s?.status === 'running') {
          jobs.refine = { status: 'running' }
          openDocEditor(d)
          pollJob(() => campaignAPI.refineStatus(campaignId, d.id), {
            handle: newHandle(),
            onUpdate: (st) => { jobs.refine = st },
          }).then(async (final) => {
            jobs.refine = final
            if (final.status === 'done') { toast.success(t('marketer.strategy.refineDone')); await refresh() }
          })
          break
        }
      }
    }
  } catch { /* probe พลาดไม่บล็อกการใช้งาน */ }
}

function statusFor(kind: 'research' | 'strategy' | 'creatives'): Promise<MarketerJobStatus> {
  if (kind === 'research') return campaignAPI.researchStatus(campaignId)
  if (kind === 'strategy') return campaignAPI.strategyStatus(campaignId)
  return campaignAPI.generateStatus(campaignId)
}

/** สเตจเริ่มต้น = สเตจแรกที่ยังไม่เสร็จ (goal เสมอเสร็จหลังสร้าง) */
function initStage() {
  const order: StageId[] = ['goal', 'research', 'strategy', 'creatives', 'review']
  stage.value = order.find((s) => !stageDone(s)) || 'review'
}

onMounted(async () => {
  await refresh()
  if (!campaign.value) return
  fillEdit()
  initStage()
  try {
    textConfigs.value = await aiConfigAPI.list('text') || []
  } catch { /* ไม่มี config → ModelSelect ซ่อน */ }
  resumeRunningJobs()
})
</script>

<style scoped>
.studio {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.mk-loading {
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}

/* === Topbar === */
.mk-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--header-bg);
  flex-shrink: 0;
}
.mk-topbar-main { display: flex; align-items: center; gap: 14px; min-width: 0; }
.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 6px 8px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s var(--ease-out), color 0.15s var(--ease-out);
}
.back-btn:hover { background: var(--bg-hover); color: var(--text-0); }
.mk-identity { min-width: 0; }
.mk-c-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-0);
}
.mk-meta-row { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.mk-stage-inline { font-size: 11px; color: var(--text-3); }
.mk-topbar-side { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* === Body & sidebar === */
.studio-body { flex: 1; display: flex; min-height: 0; }
.mk-sidebar {
  width: 236px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 12px;
  border-right: 1px solid var(--border);
  background: var(--surface-soft);
  overflow-y: auto;
}
.mk-stages { display: flex; flex-direction: column; gap: 4px; }
.mk-stage {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s var(--ease-out), border-color 0.15s var(--ease-out);
}
.mk-stage:hover { background: var(--bg-hover); }
.mk-stage.active {
  background: var(--bg-active);
  border-color: var(--border);
  box-shadow: inset 0 0 0 1px var(--border);
}
.mk-stage-state {
  width: 18px;
  height: 18px;
  margin-top: 1px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-3);
  background: var(--overlay-track);
}
.mk-stage.done .mk-stage-state { background: var(--success-bg); color: var(--success); }
.mk-stage.active .mk-stage-state { background: var(--accent-bg); color: var(--accent-text); }
.mk-stage-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  animation: mk-pulse 1.4s ease-in-out infinite;
}
@keyframes mk-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.8); }
}
.mk-stage-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.mk-stage-label { font-size: 13px; font-weight: 600; color: var(--text-0); }
.mk-stage-sub {
  font-size: 11px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Progress rail (ตาม episode.vue .sidebar-progress) */
.mk-rail { margin-top: auto; display: flex; flex-direction: column; gap: 7px; padding: 2px 2px 4px; }
.mk-rail-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.mk-rail-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-1);
}
.mk-rail-count { flex-shrink: 0; font-family: var(--font-mono); font-size: 11px; color: var(--text-3); }
.mk-rail-track { display: flex; gap: 4px; }
.mk-rail-seg {
  position: relative;
  flex: 1;
  height: 5px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--overlay-track);
  cursor: pointer;
  overflow: hidden;
  transition: background 0.2s var(--ease-out), transform 0.15s var(--ease-out);
}
.mk-rail-seg:hover { transform: scaleY(1.6); }
.mk-rail-seg:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--button-focus); }
.mk-rail-seg.done { background: var(--success); }
.mk-rail-seg.current { background: var(--accent-bg); }
.mk-rail-seg.current .mk-rail-fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,
    var(--accent) 0%,
    color-mix(in srgb, var(--accent) 30%, #fff 70%) 50%,
    var(--accent) 100%);
  background-size: 220% 100%;
  animation: mk-seg-marquee 1.5s linear infinite;
}
.mk-rail-seg:not(.current) .mk-rail-fill { display: none; }
@keyframes mk-seg-marquee {
  from { background-position: 220% 0; }
  to { background-position: -220% 0; }
}

/* === Main & panels === */
.mk-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 28px 48px; }
.panel { max-width: 860px; }
.panel-head { margin-bottom: 18px; }
.panel-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-0);
}
.panel-desc { margin: 5px 0 0; font-size: 12.5px; color: var(--text-2); }

/* Forms (reuse .input/.textarea/.btn จาก studio.css) */
.mk-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.mk-field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.mk-required { color: var(--action-danger); }
.mk-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.goal-form { max-width: 640px; }
.goal-actions { display: flex; gap: 10px; margin-top: 6px; }

/* Job running strip */
.job-running {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--accent-bg);
  color: var(--accent-text);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 16px;
}
.job-running .btn { margin-left: auto; }

/* Empty state */
.step-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 24px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  color: var(--text-3);
  text-align: center;
}
.empty-note { margin: 4px 0 10px; font-size: 13px; color: var(--text-2); }
.empty-guard { margin: 8px 0 0; font-size: 12px; color: var(--warn-text); }

/* Stage next */
.stage-next { display: flex; justify-content: flex-end; margin-top: 18px; }
.stage-next.split { justify-content: space-between; }

/* Research */
.doc-view-wrap {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-soft);
  overflow: hidden;
}
.doc-view-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.doc-version { font-family: var(--font-mono); font-size: 11px; color: var(--text-3); }
.doc-view {
  padding: 16px 18px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-1);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 460px;
  overflow-y: auto;
}
.research-highlights {
  margin: 0;
  padding: 12px 18px 14px 34px;
  border-top: 1px solid var(--border);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-2);
}

/* Strategy docs */
.doc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.doc-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-soft);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}
.doc-card:hover { border-color: var(--border-strong); transform: translateY(-1px); }
.doc-card.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--button-focus); }
.doc-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.doc-kind {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--accent-text);
  background: var(--accent-bg);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.doc-card-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-0);
}
.doc-card-snippet {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.doc-editor {
  margin-top: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-soft);
  padding: 14px 16px 16px;
}
.doc-editor-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.doc-editor-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-textarea { font-size: 13px; line-height: 1.7; width: 100%; }
.doc-editor-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.refine-row { display: flex; gap: 8px; }
.refine-row .input { flex: 1; min-width: 0; }

/* Creatives */
.gen-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.gen-formats { display: flex; flex-wrap: wrap; gap: 6px; }
.filter-chip {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--button-bg);
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s var(--ease-out);
}
.filter-chip:hover { border-color: var(--border-hover); color: var(--text-0); }
.filter-chip.on {
  background: var(--accent-bg);
  border-color: var(--accent);
  color: var(--accent-text);
}
.gen-controls { display: flex; align-items: center; gap: 10px; }
.gen-count { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-2); }
.gen-count > span { white-space: nowrap; }

.creative-list { display: flex; flex-direction: column; gap: 14px; }
.creative-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-soft);
  padding: 14px 16px 16px;
}
.creative-card.approved { border-color: color-mix(in srgb, var(--success) 55%, var(--border)); }
.creative-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.creative-tools { margin-left: auto; display: flex; gap: 4px; }
.creative-headline {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-0);
}
.creative-hook {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 12.5px;
  color: var(--text-2);
}
.creative-hook svg { flex-shrink: 0; color: var(--text-3); }
.creative-script { max-height: 320px; border-radius: var(--radius); background: var(--bg-base); }
.creative-foot { display: flex; justify-content: flex-end; margin-top: 12px; }
.creative-edit-actions { display: flex; justify-content: flex-end; gap: 10px; }

/* Review */
.review-checklist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 560px;
}
.review-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-soft);
}
.review-item.ok { border-color: color-mix(in srgb, var(--success) 45%, var(--border)); }
.review-check {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--overlay-track);
  color: var(--text-3);
}
.review-item.ok .review-check { background: var(--success-bg); color: var(--success); }
.review-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); }
.review-label { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; color: var(--text-1); }
.review-jump { flex-shrink: 0; }
.review-actions { margin-top: 20px; }

@media (max-width: 860px) {
  .studio-body { flex-direction: column; }
  .mk-sidebar { width: 100%; flex-direction: row; align-items: center; border-right: none; border-bottom: 1px solid var(--border); }
  .mk-stages { flex-direction: row; overflow-x: auto; flex: 1; }
  .mk-stage-sub { display: none; }
  .mk-rail { display: none; }
  .mk-main { padding: 18px 14px 36px; }
  .mk-field-row { grid-template-columns: 1fr; }
}
</style>
