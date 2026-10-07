---
id: fb67d
status: in-progress
created_at: 2026-10-07T10:08:17.735Z
updated_at: 2026-10-07T10:08:51.453Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-10-07T10:08:51.453Z
---

# JD 新增 AI 整理对接真实模型（阶段一：原型与 Storybook 确认）

## Background

`/jds` 页「新增 JD」里的「AI 整理」目前是**纯前端正则启发式**，不是 AI：

- `ui/src/lib/api.ts:371-374` 的 `parseJdFromText` 注释写 `POST /jds:parse-text`，实现却是 `return resolve(heuristicParseJd(text, "text"))`。
- 置信度是本地算出来的假数字（`api.ts:436`，`Math.min(0.95, ...)`），不联网。
- 后端没有该端点：`curl -X POST http://127.0.0.1:8000/jds:parse-text` → 404。
- `docs/issues/closed/a74d2-jd-crud-与软绑定-api.md:30` 写明当时**故意不实现** `POST /jds:parse-text` 与 `POST /jds:parse-image`。
- `ui/src/components/create-jd-modal.tsx:51-57` 的 `runTextParse` **没有 try/catch**：一旦失败 `parsing` 永远为 true、按钮永久「整理中…」；现在没暴露是因为它从不失败。

用户决定把「AI 整理」换成真 AI。仓库规矩要求先「原型 → Storybook 确认 → 才真实开发与后端对接」，因此本 issue 只覆盖**阶段一**（原型补状态 + Storybook 确认件 + 本文末尾冻结的 API 契约草案）。阶段二另起 issue 落地。

## Scope

- 阶段一（本 issue 落地范围）：
  - `ui/prototypes/index.html` 的 `#screen-jds` 补「新增 JD」弹窗的缺失状态（输入 / 整理中 / 成功草案 / 失败可重试），并同步该屏 `<ul class="states">`。
  - `ui/src` 只加/改 Storybook 确认件（story + 为呈现状态而做的组件拆分），**不接后端**；文案走 i18n（zh-CN 与 en 同步、键结构一致）。
  - 冻结阶段二要落地的 `POST /jds:parse-text` 契约（见下节），供用户与阶段一并确认。
- 阶段二（不在本 issue 落地，仅冻结契约）：
  - 后端实现 `POST /jds:parse-text`（权限 `jd:write`），前端把 `parseJdFromText` 改为真实请求，并给 `runTextParse`/图片链路补失败态与重试。

## Non-goals

- 不实现后端端点（阶段一不动 `backend/`）。
- 不改 `parseJdFromImage`（截图识别仍是硬编码示例草案，本阶段不假装它是真的）。
- 不改数据库模型配置、不动 `UserSettings.model_config` 结构。
- 不合并进 `main`（本阶段只在自己的 worktree 分支提交）。

## Acceptance Criteria

- [ ] `ui/prototypes/index.html` 的 `#screen-jds` 登记「新增 JD」弹窗的输入 / 整理中 / 成功草案 / 失败可重试四态，只用既有令牌与既有组件语法，并同步该屏 `<ul class="states">`。
- [ ] Storybook 覆盖 输入态 / 整理中 / 成功草案 / 模型未配置 / 解析失败可重试，且 `pnpm -C ui run build-storybook` 通过。
- [ ] i18n zh-CN 与 en 键结构一致、en 无残留中文。
- [ ] `pnpm -C ui test` 与 `archkit inspect .` 通过。

### API 契约草案（阶段二落地，供一并确认）

#### 端点

- `POST /jds:parse-text`
- 权限：`jd:write`
- 请求体（JSON）：`{ "text": string }`；`text` 去空白后为空 → 422 `VALIDATION_FAILED`。

#### 响应体（200）：对齐前端现有 `ProposedJd`（`ui/src/lib/types.ts:455-465`）

```jsonc
{
  "role": "高级前端工程师",
  "company": "某科技有限公司",       // 可选
  "tags": ["前端", "性能优化"],       // 数组
  "body": "原始岗位描述（不翻译、不截断）",
  "sourceUrl": "https://…",          // 可选，模型从文本中抽出的第一个链接
  "extracted": [{ "label": "岗位", "value": "高级前端工程师" }],
  "parseConfidence": 0.86,           // 0–1，由模型给出（见待拍板 ②）
  "note": "由 AI 整理，请核对后创建。",
  "inputSource": "text"
}
```

#### 模型调用（不硬编码 endpoint/key）

- 复用用户级 settings：读 `UserSettings.model_config` 的 `model` / `endpoint`，key 用 `settings_service.decrypt_api_key(config["apiKey"])`（Fernet）解密；与 `backend/app/modules/agent/runner.py:85-93` 的 `_resolve_model_config` 同源同写法。
- 目标模型为设置页已配置的 DeepSeek 官方 `deepseek-flash`，endpoint 与 key 全部来自 settings，不写死。
- 调用形态：OpenAI 兼容 chat completions；prompt 要求「只输出一个 JSON 对象」，后端解析后映射到 `ProposedJd`。
- 架构提示（阶段二必须先决策）：`backend/app/modules/agent/runner.py:1-9` 明确「the backend never calls a model itself」，当前后端唯一的模型 HTTP 出现在 `settings/catalog.py` 的连接探测。`POST /jds:parse-text` 会成为**第一条业务路径的后端内模型调用**，阶段二开工前需用户明确批准该口径（或在 `jd` 模块内新建一个薄解析器，复用 settings 的 endpoint/key 与 `catalog.py` 的超时分类口径，不新建第二套 HTTP 客户端）。

#### 失败分类与错误码

| 场景 | HTTP | 机器码 | 前端出口 |
| --- | --- | --- | --- |
| 未配置 key 或 model | 409 | `MODEL_NOT_CONFIGURED`（已有，`types.ts:45`） | 「模型未配置，去设置」+ 跳设置入口 |
| 上游连接/读超时 | 504 | `UPSTREAM_TIMEOUT`（新码） | 「解析超时，请重试」+ 重试按钮 |
| 上游 4xx/5xx 拒绝 | 502 | `UPSTREAM_REJECTED`（新码） | 「模型服务不可用，请重试」+ 重试按钮 |
| 模型输出不是合法 JSON | 502 | `MODEL_OUTPUT_INVALID`（新码） | 「模型返回无法解析，请重试」+ 重试按钮 |
| 请求体 `text` 为空 | 422 | `VALIDATION_FAILED`（已有） | 就地字段提示 |

- 新机器码需同步加入 `ui/src/lib/types.ts` 的 `MachineErrorCode`，并在组件里按码映射 i18n（门禁 `ui-form-contract.js` 判定 2：不得把 `ApiRequestError.message` 当用户文案）。
- 重试策略：仅对「连接失败 / 超时」自动重试一次（只读幂等）；对上游 4xx、`MODEL_OUTPUT_INVALID` 不自动重试，直接给可点重试。
- 超时口径对齐 `settings/catalog.py` 现有 connect=5 / read=30 / write=10 / pool=5（推理模型首 token 偏慢，可给 parse 单独放宽 read，但需在 issue 记录取值理由）。

#### 待用户拍板（阶段一确认清单）

1. 失败后是否回退到现有本地启发式，还是只报错让用户重试？（推荐：只报错重试，不再偷偷回退，避免用户以为结果来自 AI）
2. `解析置信度 95%` 这个假指标是去掉还是改由模型给？（推荐：改由模型给 0–1，并在 UI 保留，但文案明确「模型自评」）
3. `note` 文案怎么写？（推荐：「由 AI 整理，请核对后创建。」）
4. 模型未配置时是就地引导去设置还是直接报错？（推荐：就地引导，带「去设置模型」入口）
5. 本次是否顺手让「AI 整理」支持裸回车触发？（推荐：支持 Ctrl/Cmd+Enter 提交，裸回车在 textarea 里留给换行）

## Implementation

阶段一（原型 + Storybook 确认件，未接后端）：

- 原型：`ui/prototypes/index.html` 的 `#screen-jds` 新增「新增 JD」弹窗四态块（输入 / 整理中 / 成功草案 / 失败），并同步该屏 `<ul class="states">`；新增动画令牌 `@keyframes proto-spin` / `.spin`（镜像 lucide `Loader2 animate-spin`，仅「整理中」用）。
- 组件拆分：`ui/src/components/create-jd-modal.tsx` 拆出纯呈现层 `CreateJdDialogView`（story 逐态确认用），容器 `CreateJdModal` 补 `error` 状态与 try/catch（原先解析失败会让 `parsing` 永久为 true、按钮卡在「整理中…」）。`parseJdFromText` / `parseJdFromImage` 本身未改，仍走启发式。
- Storybook：`ui/src/components/create-jd-modal.stories.tsx`（5 态：InputReady / Parsing / DraftResult / ModelNotConfigured / ParseRetryable）。
- 测试：`ui/src/components/create-jd-modal.test.tsx`、`ui/src/components/create-jd-modal.stories.test.tsx`。
- i18n：`ui/src/i18n/locales/zh-CN/jd.ts` 与 `en/jd.ts` 同步新增 `jd.create.retry`、`errorTitle`、`openSettings`、`errors.{MODEL_NOT_CONFIGURED,UPSTREAM_TIMEOUT,UPSTREAM_REJECTED,MODEL_OUTPUT_INVALID,NETWORK_ERROR}`。
- 文档口径：`README.md` 更新前端测试与 story 计数。

## Verification

- `pnpm -C ui test`：39 files / 285 passed（新增 14 条：9 条组件 + 5 条 story）。
- `pnpm -C ui run build-storybook`：completed successfully。
- `archkit inspect .`：Quality gates passed。
- 浏览器确认入口：Storybook `Components/CreateJdModal`（见阶段一交付汇报的完整 URL）。

## Related ADRs

- None.
