<template>
  <div class="page page-enter">
    <!-- ===== Header ===== -->
    <header class="mk-head">
      <div class="mk-head-copy">
        <p class="eyebrow">{{ t('marketer.eyebrow') }}</p>
        <h1 class="mk-title">{{ t('marketer.title') }}</h1>
        <p class="mk-sub">{{ t('marketer.subtitle') }}</p>
      </div>
      <button class="btn btn-primary" type="button" @click="openCreate">
        <Plus :size="15" :stroke-width="2.2" />
        {{ t('marketer.list.newCampaign') }}
      </button>
    </header>

    <!-- ===== Campaign grid ===== -->
    <div v-if="loading" class="mk-grid" aria-hidden="true">
      <div v-for="i in 3" :key="i" class="mk-card skeleton-card">
        <div class="skeleton-line w-60"></div>
        <div class="skeleton-line w-40"></div>
        <div class="skeleton-line w-80"></div>
      </div>
    </div>

    <div v-else-if="campaigns.length" class="mk-grid">
      <article
        v-for="(c, i) in campaigns"
        :key="c.id"
        class="mk-card"
        :style="{ animationDelay: `${i * 0.04}s` }"
        tabindex="0"
        role="button"
        :aria-label="t('marketer.list.openAria', { title: c.title || t('marketer.create.untitled') })"
        @click="open(c)"
        @keydown.enter.prevent="open(c)"
        @keydown.space.prevent="open(c)"
      >
        <div class="mk-card-top">
          <h3 class="mk-card-title truncate">{{ c.title || t('marketer.create.untitled') }}</h3>
          <AppMenu :open="menuId === c.id" placement="bottom-end" :min-width="120" @update:open="(v) => { menuId = v ? c.id : null }">
            <template #trigger>
              <button class="mk-more" type="button" :title="t('common.more')" :aria-label="t('common.more')" @click.stop>
                <MoreHorizontal :size="16" :stroke-width="2" />
              </button>
            </template>
            <AppMenuItem danger @click="menuId = null; toDelete = c">{{ t('marketer.list.delete') }}</AppMenuItem>
          </AppMenu>
        </div>
        <p class="mk-goal">{{ c.goal }}</p>
        <div class="mk-card-tags">
          <span v-if="c.platform" class="tag tag-accent">{{ platformLabel(c.platform) }}</span>
          <span class="tag" :class="statusTagClass(c)">{{ statusLabel(c) }}</span>
        </div>
        <div class="mk-card-foot">
          <Clock :size="11" :stroke-width="1.8" />
          {{ fmtDate(c.updated_at || c.updatedAt) }}
        </div>
      </article>
    </div>

    <div v-else class="mk-empty">
      <Megaphone :size="26" :stroke-width="1.5" />
      <p class="mk-empty-title">{{ t('marketer.list.emptyTitle') }}</p>
      <p class="mk-empty-desc">{{ t('marketer.list.emptyDesc') }}</p>
      <button class="btn btn-primary" type="button" @click="openCreate">
        <Plus :size="15" :stroke-width="2.2" />
        {{ t('marketer.list.newCampaign') }}
      </button>
    </div>

    <!-- ===== Create dialog ===== -->
    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <div class="dialog create-dialog" role="dialog" aria-modal="true" :aria-label="t('marketer.create.title')">
        <div class="dialog-head">
          <div class="mk-dialog-icon">
            <Megaphone :size="18" :stroke-width="1.8" />
          </div>
          <div class="dialog-head-copy">
            <h2 class="dialog-title">{{ t('marketer.create.title') }}</h2>
            <p class="dialog-desc">{{ t('marketer.create.desc') }}</p>
          </div>
        </div>
        <form @submit.prevent="create">
          <div class="dialog-body">
            <label class="mk-field">
              <span class="mk-field-label">{{ t('marketer.create.titleField') }}</span>
              <input v-model.trim="form.title" class="input" :placeholder="t('marketer.create.titlePlaceholder')" />
            </label>
            <label class="mk-field">
              <span class="mk-field-label">{{ t('marketer.create.goal') }} <span class="mk-required">*</span></span>
              <textarea
                v-model="form.goal"
                class="textarea"
                rows="4"
                :placeholder="t('marketer.create.goalPlaceholder')"
                required
                autofocus
              ></textarea>
            </label>
            <label class="mk-field">
              <span class="mk-field-label">{{ t('marketer.create.brandContext') }}</span>
              <textarea v-model="form.brand_context" class="textarea" rows="3" :placeholder="t('marketer.create.brandPlaceholder')"></textarea>
            </label>
            <div class="mk-field-row">
              <label class="mk-field">
                <span class="mk-field-label">{{ t('marketer.create.platform') }}</span>
                <BaseSelect v-model="form.platform" :options="platformOptions" :searchable="false" />
              </label>
              <label class="mk-field">
                <span class="mk-field-label">{{ t('marketer.create.language') }}</span>
                <BaseSelect v-model="form.language" :options="languageOptions" :searchable="false" />
              </label>
            </div>
          </div>
          <div class="dialog-foot">
            <button type="button" class="btn" :disabled="creating" @click="showCreate = false">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn btn-primary" :disabled="creating || !form.goal.trim()">
              <Loader2 v-if="creating" :size="13" class="animate-spin" />
              {{ creating ? t('marketer.create.creating') : t('marketer.create.submit') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <ConfirmDialog
      :open="!!toDelete"
      :title="t('marketer.delete.title')"
      :message="t('marketer.delete.message', { title: toDelete?.title || t('marketer.create.untitled') })"
      :confirm-text="t('common.delete')"
      :loading-text="t('common.deleteLoading')"
      :loading="deleting"
      @confirm="remove"
      @cancel="toDelete = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock, Loader2, Megaphone, MoreHorizontal, Plus } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { campaignAPI } from '~/composables/useMarketer'
import { toastError } from '~/composables/useToast'

const { t, locale } = useI18n()

const campaigns = ref<any[]>([])
const loading = ref(true)
const showCreate = ref(false)
const creating = ref(false)
const toDelete = ref<any | null>(null)
const deleting = ref(false)
const menuId = ref<number | null>(null)

const form = ref({ title: '', goal: '', brand_context: '', platform: 'tiktok', language: 'th' })

const platformOptions = [
  { label: t('marketer.platform.tiktok'), value: 'tiktok' },
  { label: t('marketer.platform.instagram'), value: 'instagram' },
  { label: t('marketer.platform.youtube'), value: 'youtube' },
  { label: t('marketer.platform.facebook'), value: 'facebook' },
  { label: t('marketer.platform.xiaohongshu'), value: 'xiaohongshu' },
]
const languageOptions = [
  { label: t('marketer.language.th'), value: 'th' },
  { label: t('marketer.language.en'), value: 'en' },
  { label: t('marketer.language.zh'), value: 'zh' },
]

function platformLabel(v: string) {
  return t(`marketer.platform.${v}`)
}

function statusLabel(c: any) {
  return t(`marketer.status.${c.status || 'draft'}`)
}

function statusTagClass(c: any) {
  const map = { running: 'tag-info', done: 'tag-success', error: 'tag-error' }
  return map[c.status || 'draft'] || 'tag-warning'
}

function fmtDate(v?: string) {
  if (!v) return ''
  try {
    return new Date(v).toLocaleDateString(locale.value === 'th' ? 'th-TH' : locale.value, { dateStyle: 'medium' })
  } catch {
    return v
  }
}

function openCreate() {
  form.value = { title: '', goal: '', brand_context: '', platform: form.value.platform, language: form.value.language }
  showCreate.value = true
}

async function load() {
  loading.value = true
  try {
    const data = await campaignAPI.list()
    campaigns.value = data?.items || []
  } catch (e) {
    toastError(e)
  } finally {
    loading.value = false
  }
}

async function create() {
  const goal = form.value.goal.trim()
  if (!goal) {
    toast.warning(t('marketer.create.goalRequired'))
    return
  }
  creating.value = true
  try {
    const c: any = await campaignAPI.create({
      title: form.value.title || undefined,
      goal,
      brand_context: form.value.brand_context.trim() || undefined,
      platform: form.value.platform || undefined,
      language: form.value.language || undefined,
    })
    toast.success(t('marketer.create.created'))
    showCreate.value = false
    navigateTo(`/marketer/${c.id}`)
  } catch (e) {
    toastError(e)
  } finally {
    creating.value = false
  }
}

function open(c: any) {
  navigateTo(`/marketer/${c.id}`)
}

async function remove() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await campaignAPI.del(toDelete.value.id)
    toast.success(t('marketer.delete.deleted'))
    toDelete.value = null
    await load()
  } catch (e) {
    toastError(e)
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page {
  padding: 32px 40px 48px;
  overflow-y: auto;
  height: 100%;
}

/* === Header === */
.mk-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.eyebrow { margin-bottom: 6px; }
.mk-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-0);
}
.mk-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-2);
  max-width: 560px;
}

/* === Grid & cards === */
.mk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}
.mk-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-soft);
  cursor: pointer;
  transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out);
  animation: fadeUp 0.24s var(--ease-out) both;
}
.mk-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow-elevated);
}
.mk-card:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--button-focus);
}
.mk-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mk-card-title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-0);
}
.mk-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}
.mk-more:hover { background: var(--bg-hover); color: var(--text-0); }
.mk-goal {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mk-card-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.mk-card-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: auto;
  font-size: 11px;
  color: var(--text-3);
}

/* === Empty === */
.mk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 72px 24px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  color: var(--text-3);
  text-align: center;
}
.mk-empty-title { margin: 8px 0 0; font-size: 15px; font-weight: 700; color: var(--text-1); }
.mk-empty-desc { margin: 0 0 14px; font-size: 12.5px; max-width: 380px; }

/* === Create dialog === */
.create-dialog { width: 520px; max-width: calc(100vw - 48px); }
.mk-dialog-icon {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  background: var(--accent-bg);
  color: var(--accent-text);
}
.mk-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.mk-field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.mk-required { color: var(--action-danger); }
.mk-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* === Skeleton === */
.skeleton-card { cursor: default; animation: none; }
.skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: var(--bg-hover);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}
.skeleton-line.w-40 { width: 40%; }
.skeleton-line.w-60 { width: 60%; }
.skeleton-line.w-80 { width: 80%; }
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (max-width: 860px) {
  .page { padding: 20px 16px 32px; }
  .mk-head { flex-direction: column; align-items: stretch; }
  .mk-field-row { grid-template-columns: 1fr; }
}
</style>
