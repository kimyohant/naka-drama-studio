# AI Marketer — Plan & API Contract

> **Status (updated):** Both sides are now implemented in this repository and the contract in
> section 4 has been verified end-to-end (backend typecheck, frontend tests 56/56, E2E script
> over the full HTTP surface: 33/33 checks + deterministic 409 duplicate-job test).
> Backend files: `src/routes/campaigns.ts`, `src/services/campaigns.ts`,
> `src/db/sqlite-schema.ts` (migration 6), `src/db/schema.ts`, `src/agents/index.ts`
> (`marketer` agent, no tools), `workspace/prompts/marketer.md`, mounted in `src/index.ts`.
> The only untested path is a live AI generation (no text-service config was present in the
> test database) — the async job error path itself (`E_NO_TEXT_MODEL` → task error → campaign
> status error) is verified.

> **Provenance note (Agent B):** This file was authored by Agent B (frontend). The original
> `docs/ai-marketer/PLAN.md` referenced by the task brief was not present in the repository
> (verified via `git fetch --all` and a filesystem search), so this document re-creates it from
> the brief: the Topview AI Marketer flow (section 1) and the API contract (section 4), aligned
> with the existing backend conventions in `backend/src/utils/response.ts`,
> `backend/src/services/pipeline-tasks.ts` and `backend/src/routes/agent.ts`.
> **Agent A (backend) should reconcile section 4 against the implementation; if the real
> implementation differs, update this file and the frontend calls in
> `frontend/app/composables/useMarketer.ts` (all endpoint paths live in that one file).**

## 1. Flow (Topview AI Marketer emulation)

Five-stage pipeline per campaign, mirroring Topview's AI Marketer:
describe goal → research → strategy (4 docs) → creatives → review/refine.

```
┌─────────┐   ┌──────────┐   ┌─────────────────────┐   ┌───────────┐   ┌────────────────┐
│ 1 Goal  │ → │ 2 Research│ → │ 3 Strategy (4 docs) │ → │ 4 Creatives│ → │ 5 Review/Refine│
└─────────┘   └──────────┘   └─────────────────────┘   └───────────┘   └────────────────┘
```

1. **Goal** — user creates a campaign: goal (required), title, brand/product context,
   target platform, content language.
2. **Research** — one AI job produces a market research brief (market, audience signals,
   competitors). Async job, polled.
3. **Strategy** — one AI job produces the 4 strategy documents:
   | kind | doc |
   |---|---|
   | `persona` | Audience persona |
   | `competition` | Competitive landscape |
   | `positioning` | Positioning & messaging |
   | `channel_plan` | Channel & content plan |
   Requires research done. Each doc is manually editable and individually refinable
   (instruction → AI revise → version++).
4. **Creatives** — AI generates N creative variants (headline, hook, segmented script)
   from the approved strategy. Requires at least one strategy doc.
5. **Review/Refine** — readiness checklist, per-creative approve/reject, per-creative and
   per-doc refine jobs, and a client-side "copy all as markdown" export.

Stage gating (enforced by backend, surfaced by UI):
- research/strategy/creatives jobs cannot start while another campaign job is running (`E_CAMPAIGN_JOB_RUNNING`)
- strategy requires research present (`E_CAMPAIGN_NO_RESEARCH`)
- creatives require ≥1 strategy doc (`E_CAMPAIGN_NO_DOCS`)

## 2. Frontend surface (Agent B scope)

- `frontend/app/pages/marketer.vue` — campaign list + create dialog (`/marketer`)
- `frontend/app/views/marketer/campaign.vue` — campaign workbench (`/marketer/:id`),
  progress-rail layout matching `views/drama/episode.vue`
- `frontend/app/composables/useMarketer.ts` — all API calls + generic job polling
- nav entry in `frontend/app/layouts/default.vue`; i18n under `marketer.*` (+ `errors.codes`)

## 3. Backend surface (Agent A scope, not implemented by Agent B)

- `backend/src/routes/campaigns.ts` mounted in `backend/src/index.ts` as `api.route('/campaigns', campaigns)`
- persistence: `campaigns`, `campaign_docs`, `campaign_creatives` tables (DDL idempotent in
  `sqlite-schema.ts`), async work via `pipeline_tasks` (`kind = 'campaign_research' | 'campaign_strategy' | 'campaign_creatives' | 'campaign_refine'`,
  `key = 'campaign:<id>:<step>'`), agents run through Mastra with text-config model resolution
  (`model` / `config_id` passthrough like other routes).

## 4. API Contract

Conventions (same as the rest of the repo):
- envelope `{ code: 200, data, message: 'success' }`; errors `{ code: 400|404|409|500, message, errorCode? }`
- request bodies snake_case; AI jobs are started with POST, polled with GET `…-status`,
  cancelled with POST `…/cancel`
- job status payload (all `-status` endpoints), from `pipeline_tasks`:

```jsonc
// GET /api/v1/campaigns/:id/<step>-status
{
  "status": "idle" | "running" | "done" | "error" | "cancelled",
  "kind": "campaign_research",        // pipeline_tasks.kind
  "total": 4, "completed": 2, "failed": 0,
  "current_key": "persona",           // current sub-step or null
  "error_msg": null,                  // string when status=error
  "result": null                      // step payload once done (per-step shape below)
}
```

### Objects

```jsonc
// Campaign
{
  "id": 1,
  "title": "Summer launch",
  "goal": "Grow TikTok followers for our iced-tea brand",
  "brand_context": "Brand facts, product, price range, audience…",
  "platform": "tiktok",            // tiktok | instagram | youtube | facebook | xiaohongshu
  "language": "th",                // BCP-47-ish tag for generated content
  "status": "draft" | "running" | "done" | "error",
  "stage": "goal" | "research" | "strategy" | "creatives" | "review",  // furthest reached
  "research": { "content": "markdown", "highlights": ["…"] } | null,
  "created_at": "ISO", "updated_at": "ISO"
}

// Strategy doc
{ "id": 11, "campaign_id": 1, "kind": "persona" | "competition" | "positioning" | "channel_plan",
  "title": "Audience persona", "content": "markdown", "version": 2, "updated_at": "ISO" }

// Creative
{ "id": 21, "campaign_id": 1, "format": "video_30s" | "video_15s" | "ugc_script" | "ad_copy",
  "headline": "…", "hook": "…", "script": "markdown (3s segments like drama scripts)",
  "approved": false, "version": 1, "created_at": "ISO", "updated_at": "ISO" }
```

### Endpoints

| Method & path | Body | Returns / notes |
|---|---|---|
| `GET /api/v1/campaigns` | — | `{ items: Campaign[] }` (docs/creatives not included) |
| `POST /api/v1/campaigns` | `{ title?, goal, brand_context?, platform?, language? }` | `201` Campaign; empty/missing `goal` → `400 E_CAMPAIGN_EMPTY_GOAL` |
| `GET /api/v1/campaigns/:id` | — | `{ campaign: Campaign, docs: Doc[], creatives: Creative[] }` |
| `PUT /api/v1/campaigns/:id` | `{ title?, goal?, brand_context?, platform?, language? }` | Campaign |
| `DELETE /api/v1/campaigns/:id` | — | `200`; cascades docs/creatives |
| `POST /api/v1/campaigns/:id/research` | `{ model?, config_id? }` | Campaign (`status='running'`); `409 E_CAMPAIGN_JOB_RUNNING` if a job is already running |
| `GET /api/v1/campaigns/:id/research-status` | — | job status; `result = { highlights: string[] }` (research itself re-read from campaign) |
| `POST /api/v1/campaigns/:id/research/cancel` | `{}` | job status |
| `POST /api/v1/campaigns/:id/strategy` | `{ model?, config_id?, kinds?: string[] }` | Campaign; `400 E_CAMPAIGN_NO_RESEARCH` if no research; creates 4 docs (`kinds` defaults to all 4) |
| `GET /api/v1/campaigns/:id/strategy-status` | — | job status (`total=4`, `current_key` = doc kind being written) |
| `POST /api/v1/campaigns/:id/strategy/cancel` | `{}` | job status |
| `GET /api/v1/campaigns/:id/docs` | — | `{ items: Doc[] }` |
| `PUT /api/v1/campaigns/:id/docs/:docId` | `{ title?, content? }` | Doc; `version++` |
| `POST /api/v1/campaigns/:id/docs/:docId/refine` | `{ instruction, model?, config_id? }` | Doc (updated after job completes — frontend polls `refine-status` then re-GETs doc) |
| `GET /api/v1/campaigns/:id/docs/:docId/refine-status` | — | job status |
| `POST /api/v1/campaigns/:id/docs/:docId/refine/cancel` | `{}` | job status |
| `POST /api/v1/campaigns/:id/creatives` | `{ count?, formats?: string[], model?, config_id? }` | Campaign; `400 E_CAMPAIGN_NO_DOCS` if no docs; `count` 1–5 default 3 |
| `GET /api/v1/campaigns/:id/creatives/generate-status` | — | job status (`total`=count) |
| `POST /api/v1/campaigns/:id/creatives/generate/cancel` | `{}` | job status |
| `GET /api/v1/campaigns/:id/creatives` | — | `{ items: Creative[] }` |
| `PUT /api/v1/campaigns/creatives/:creativeId` | `{ headline?, hook?, script?, approved? }` | Creative |
| `DELETE /api/v1/campaigns/creatives/:creativeId` | — | `200` |

Stable error codes (frontend maps via `errors.codes.*`):

| errorCode | when |
|---|---|
| `E_CAMPAIGN_NOT_FOUND` | unknown campaign/doc/creative id |
| `E_CAMPAIGN_JOB_RUNNING` | starting a job while another is running (409) |
| `E_CAMPAIGN_EMPTY_GOAL` | create with empty `goal` |
| `E_CAMPAIGN_NO_RESEARCH` | strategy job without research |
| `E_CAMPAIGN_NO_DOCS` | creatives job without docs |
| `E_CAMPAIGN_EMPTY_INSTRUCTION` | refine with empty `instruction` |

Plus reused codes: `E_NO_TEXT_MODEL`, `E_AGENT_UNAVAILABLE`, `E_AGENT_EMPTY_RESULT`.

## 5. Notes from Agent B

_(things the frontend needs from the API that the contract as implemented must provide)_

1. **Mount point**: `backend/src/index.ts` must add `api.route('/campaigns', campaigns)` — the
   frontend hard-codes no fallback paths; every call goes through `/api/v1/campaigns…`.
2. **`stage` field** on Campaign (section 4) is what the workbench rail uses to restore where the
   user left off. If the backend prefers to derive it, please still return it (derived is fine).
3. **`result` on job status** is only used to detect completion payload — the frontend re-GETs
   the campaign/docs/creatives after `done`, so `result` may be `null` without breaking the UI.
4. **Model resolution**: only text models are used by this feature. The frontend sends
   `model` as the **bare model name** (stripped of the `provider/` prefix, same as
   `bareModelName` in `episode.vue`) and `config_id` exactly like the `agent/:type/chat`
   endpoint — same resolution semantics.
5. **Cancellation is cooperative** (`cancel_requested` flag like `pipeline-tasks.ts`); the UI
   polls `…-status` and expects `status='cancelled'` eventually. If the user cancels after the
   job already finished, return the terminal status (`done`), not an error.
6. **Localization of AI output** should follow campaign `language`; the UI language (th/en) is
   independent and must not affect generated content.
