/**
 * Product Studio — Creative Gallery เทมเพลต（docs/product-studio/PLAN.md §3）
 * กำหนดใน code ฝั่ง backend ตามสัญญา — ออกแบบเองทั้งหมด ห้ามคัดลอกชื่อ/สื่อจาก Topview
 *
 * role และ category ต้องตรงกับ i18n ฝั่ง frontend:
 *   category  → productStudio.categories.<category>  (review/demo/fashion_beauty/showcase/promo)
 *   beat role → productStudio.templates.<id>.beats.<role>
 * (ดู docs/product-studio/PLAN.md หัว "Notes from Agent B")
 * defaultDurationSec = ผลรวมวินาทีของ beats（ผู้ใช้เลือกความยาวจริงแล้วระบบปรับสเกลให้）
 */

export type StudioTemplateCategory = 'review' | 'demo' | 'fashion_beauty' | 'showcase' | 'promo'
export type StudioAvatarMode = 'required' | 'optional' | 'hands' | 'none'

export interface StudioTemplateBeat {
  role: string
  seconds: number
}

export interface StudioTemplate {
  id: string
  category: StudioTemplateCategory
  avatarMode: StudioAvatarMode
  hasDialogue: boolean
  defaultDurationSec: number
  /** Platform ids ตาม PLAN §4 (GET /options) — แกลเลอรีฝั่ง frontend ใช้กรอง */
  platforms: string[]
  beats: StudioTemplateBeat[]
}

const ALL_PLATFORMS = ['tiktok', 'tiktok_shop', 'shopee', 'lazada', 'facebook', 'instagram_reels', 'youtube_shorts', 'amazon']
/** flash_deal เป็นสไตล์ไลฟ์ขายของ — เฉพาะแพลตฟอร์มขายของ */
const COMMERCE_PLATFORMS = ['tiktok', 'tiktok_shop', 'shopee', 'lazada']

function beats(list: Array<[string, number]>): StudioTemplateBeat[] {
  return list.map(([role, seconds]) => ({ role, seconds }))
}

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'ugc_review',
    category: 'review',
    avatarMode: 'required',
    hasDialogue: true,
    defaultDurationSec: 24,
    platforms: ALL_PLATFORMS,
    beats: beats([['hook', 3], ['problem', 5], ['use_product', 8], ['result', 5], ['cta', 3]]),
  },
  {
    id: 'unboxing',
    category: 'review',
    avatarMode: 'hands',
    hasDialogue: true,
    defaultDurationSec: 23,
    platforms: ALL_PLATFORMS,
    beats: beats([['hook', 3], ['unbox', 6], ['reveal', 5], ['details', 6], ['cta', 3]]),
  },
  {
    id: 'before_after',
    category: 'demo',
    avatarMode: 'optional',
    hasDialogue: true,
    defaultDurationSec: 21,
    platforms: ALL_PLATFORMS,
    beats: beats([['hook', 4], ['during', 8], ['after', 6], ['cta', 3]]),
  },
  {
    id: 'problem_solution',
    category: 'demo',
    avatarMode: 'optional',
    hasDialogue: true,
    defaultDurationSec: 20,
    platforms: ALL_PLATFORMS,
    beats: beats([['problem', 5], ['intro', 4], ['solve', 8], ['cta', 3]]),
  },
  {
    id: 'how_to_use',
    category: 'demo',
    avatarMode: 'hands',
    hasDialogue: true,
    defaultDurationSec: 21,
    platforms: ALL_PLATFORMS,
    beats: beats([['hook', 3], ['step1', 5], ['step2', 5], ['step3', 5], ['cta', 3]]),
  },
  {
    id: 'three_reasons',
    category: 'review',
    avatarMode: 'required',
    hasDialogue: true,
    defaultDurationSec: 21,
    platforms: ALL_PLATFORMS,
    beats: beats([['hook', 3], ['reason1', 5], ['reason2', 5], ['reason3', 5], ['cta', 3]]),
  },
  {
    // compliance: ห้ามอ้างชื่อแบรนด์คู่แข่งในบทพูด/ภาพ
    id: 'comparison',
    category: 'demo',
    avatarMode: 'optional',
    hasDialogue: true,
    defaultDurationSec: 20,
    platforms: ALL_PLATFORMS,
    beats: beats([['hook', 3], ['generic', 6], ['ours', 8], ['cta', 3]]),
  },
  {
    id: 'try_on',
    category: 'fashion_beauty',
    avatarMode: 'required',
    hasDialogue: true,
    defaultDurationSec: 20,
    platforms: ALL_PLATFORMS,
    beats: beats([['hook', 3], ['try', 8], ['show', 6], ['cta', 3]]),
  },
  {
    // compliance: เป็น "รีวิวจาก creator" — ห้ามอ้างว่าเป็นลูกค้าจริง
    id: 'creator_story',
    category: 'review',
    avatarMode: 'required',
    hasDialogue: true,
    defaultDurationSec: 20,
    platforms: ALL_PLATFORMS,
    beats: beats([['story', 6], ['turning_point', 6], ['result', 5], ['cta', 3]]),
  },
  {
    id: 'lifestyle_showcase',
    category: 'showcase',
    avatarMode: 'none',
    hasDialogue: true,
    defaultDurationSec: 19,
    platforms: ALL_PLATFORMS,
    beats: beats([['scene1', 5], ['scene2', 5], ['scene3', 5], ['packshot', 4]]),
  },
  {
    id: 'asmr_closeup',
    category: 'showcase',
    avatarMode: 'hands',
    hasDialogue: false,
    defaultDurationSec: 19,
    platforms: ALL_PLATFORMS,
    beats: beats([['macro', 4], ['texture', 5], ['sound', 6], ['packshot', 4]]),
  },
  {
    id: 'flash_deal',
    category: 'promo',
    avatarMode: 'required',
    hasDialogue: true,
    defaultDurationSec: 17,
    platforms: COMMERCE_PLATFORMS,
    beats: beats([['hook', 3], ['show', 6], ['offer', 5], ['cta', 3]]),
  },
]

/** หาเทมเพลตตาม id — ไม่พบเรียกด้วย E_TEMPLATE_UNKNOWN */
export function getStudioTemplate(id: string): StudioTemplate | undefined {
  return STUDIO_TEMPLATES.find(t => t.id === id)
}
