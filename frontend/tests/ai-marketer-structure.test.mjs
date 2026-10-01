/**
 * AI Marketer (Agent B) — structure & contract tests
 *
 * ตรวจว่า frontend เรียก API ตาม docs/ai-marketer/PLAN.md section 4 พอดี,
 * ไม่มี hardcoded UI text (ทุก string ผ่าน t()), ไม่มี mock data,
 * และ locale th/en มี key ครบสมมาตรกัน (marketer.* + errors.codes ใหม่)
 */
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

const composable = read('app/composables/useMarketer.ts')
const listPage = read('app/pages/marketer.vue')
const workbench = read('app/views/marketer/campaign.vue')
const nuxtConfig = read('nuxt.config.ts')
const layout = read('app/layouts/default.vue')
const th = JSON.parse(read('app/locales/th.json'))
const en = JSON.parse(read('app/locales/en.json'))

test('campaignAPI calls exactly the contract endpoints', () => {
  const expected = [
    `'/campaigns'`,
    `/campaigns/${'${'}id}`,
    `/campaigns/${'${'}id}/research`,
    `/campaigns/${'${'}id}/research-status`,
    `/campaigns/${'${'}id}/research/cancel`,
    `/campaigns/${'${'}id}/strategy`,
    `/campaigns/${'${'}id}/strategy-status`,
    `/campaigns/${'${'}id}/strategy/cancel`,
    `/campaigns/${'${'}id}/docs`,
    `/campaigns/${'${'}id}/docs/${'${'}docId}`,
    `/campaigns/${'${'}id}/docs/${'${'}docId}/refine`,
    `/campaigns/${'${'}id}/docs/${'${'}docId}/refine-status`,
    `/campaigns/${'${'}id}/docs/${'${'}docId}/refine/cancel`,
    `/campaigns/${'${'}id}/creatives`,
    `/campaigns/${'${'}id}/creatives/generate-status`,
    `/campaigns/${'${'}id}/creatives/generate/cancel`,
    `/campaigns/creatives/${'${'}creativeId}`,
  ]
  for (const ep of expected) {
    assert.ok(composable.includes(ep), `useMarketer.ts must reference ${ep}`)
  }
  // model/config_id passthrough (แบบเดียวกับ endpoints อื่นในระบบ)
  assert.match(composable, /config_id:/)
  assert.match(composable, /model:/)
  // async job lifecycle: start → poll status → cancel
  assert.match(composable, /export async function pollJob/)
  assert.match(composable, /status !== 'running'/)
})

test('marketer routes are registered and reachable', () => {
  assert.match(nuxtConfig, /name: 'marketer-campaign'/)
  assert.match(nuxtConfig, /path: '\/marketer\/:id'/)
  assert.match(nuxtConfig, /views\/marketer\/campaign\.vue/)
  // file-based list page exists (pages/marketer.vue → /marketer)
  assert.ok(listPage.length > 0)
  // sidebar nav entry
  assert.match(layout, /to="\/marketer"/)
  assert.match(layout, /Megaphone/)
  assert.match(layout, /layout\.nav\.marketer/)
})

test('workbench implements the 5-stage Topview flow', () => {
  for (const stage of ['goal', 'research', 'strategy', 'creatives', 'review']) {
    assert.match(workbench, new RegExp(`'${stage}'`), `stage ${stage} must exist`)
  }
  // progress rail แบบเดียวกับ episode.vue (segments + marquee fill)
  assert.match(workbench, /mk-rail-track/)
  assert.match(workbench, /mk-rail-fill/)
  assert.match(workbench, /mk-seg-marquee/)
  // job polling + cancel + resume-on-mount
  assert.match(workbench, /pollJob\(/)
  assert.match(workbench, /cancelJob\(/)
  assert.match(workbench, /resumeRunningJobs/)
  // model passthrough ผ่าน ModelSelect + ownerConfigId
  assert.match(workbench, /ModelSelect/)
  assert.match(workbench, /ownerConfigId/)
  // 4 strategy docs + creative formats
  assert.match(workbench, /docKindLabel/)
  assert.match(workbench, /persona/)
  assert.match(workbench, /channel_plan/)
  assert.match(workbench, /video_30s/)
  assert.match(workbench, /ugc_script/)
  // review: checklist + copy-all export
  assert.match(workbench, /review-checklist/)
  assert.match(workbench, /copyAll/)
})

test('no hardcoded UI text — every visible string goes through t()', () => {
  for (const [name, src] of [['pages/marketer.vue', listPage], ['views/marketer/campaign.vue', workbench]]) {
    // comment ทุกชนิด (HTML/CSS/JS) ไม่ใช่ UI text — strip ก่อนตรวจ
    const stripped = src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(stripped, /[\u0E00-\u0E7F]/, `${name} has hardcoded Thai text`)
    assert.doesNotMatch(stripped, /[\u4E00-\u9FFF]/, `${name} has hardcoded Chinese text`)
  }
})

test('no mock data in delivered code', () => {
  for (const [name, src] of [['useMarketer.ts', composable], ['pages/marketer.vue', listPage], ['views/marketer/campaign.vue', workbench]]) {
    assert.doesNotMatch(src, /\bmock\w*\s*[:=]/i, `${name} contains mock data`)
    assert.doesNotMatch(src, /fixture|dummyData/i, `${name} contains fixture data`)
  }
})

test('dangerous actions go through ConfirmDialog', () => {
  assert.match(listPage, /ConfirmDialog/)
  assert.match(workbench, /ConfirmDialog/)
  assert.match(workbench, /toDeleteCreative/)
})

test('marketer.* i18n keys exist in both locales with full parity', () => {
  const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? [...leaves(v, `${p}.${k}`)] : [`${p}.${k}`])
  const thKeys = new Set(leaves(th.marketer, 'marketer'))
  const enKeys = new Set(leaves(en.marketer, 'marketer'))
  const onlyTh = [...thKeys].filter((k) => !enKeys.has(k))
  const onlyEn = [...enKeys].filter((k) => !thKeys.has(k))
  assert.equal(onlyTh.length, 0, `keys missing in en.json: ${onlyTh.join(', ')}`)
  assert.equal(onlyEn.length, 0, `keys missing in th.json: ${onlyEn.join(', ')}`)
  // ทุก key ที่ template เรียกใช้ (marketer.*) ต้องมีจริงใน locale
  const used = new Set([...listPage.matchAll(/t\('((?:marketer|layout\.nav)\.[\w.]+)'/g)].map((m) => m[1]))
  for (const k of used) {
    assert.ok(enKeys.has(k) || k.startsWith('layout.nav'), `en.json missing ${k} (used by pages/marketer.vue)`)
    assert.ok(thKeys.has(k) || k.startsWith('layout.nav'), `th.json missing ${k} (used by pages/marketer.vue)`)
  }
  // layout.nav.marketer
  assert.equal(typeof th.layout.nav.marketer, 'string')
  assert.equal(typeof en.layout.nav.marketer, 'string')
})

test('new campaign error codes are localized in errors.codes', () => {
  const codes = [
    'E_CAMPAIGN_NOT_FOUND',
    'E_CAMPAIGN_JOB_RUNNING',
    'E_CAMPAIGN_EMPTY_GOAL',
    'E_CAMPAIGN_NO_RESEARCH',
    'E_CAMPAIGN_NO_DOCS',
    'E_CAMPAIGN_EMPTY_INSTRUCTION',
  ]
  for (const c of codes) {
    assert.equal(typeof en.errors.codes[c], 'string', `en errors.codes.${c} missing`)
    assert.equal(typeof th.errors.codes[c], 'string', `th errors.codes.${c} missing`)
  }
})
