---
id: fb67d
status: closed
created_at: 2026-10-07T10:08:17.735Z
updated_at: 2026-10-07T11:16:08.116Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-10-07T10:08:51.453Z
closed_at: 2026-10-07T11:16:08.116Z
---

# JD 新增 AI 整理对接真实模型（原型确认 + 真实端点）

## Background

`/jds` 页「新增 JD」里的「AI 整理」目前是**纯前端正则启发式**，不是 AI：

- `ui/src/lib/api.ts:371-374` 的 `parseJdFromText` 注释写 `POST /jds:parse-text`，实现却是 `return resolve(heuristicParseJd(text, "text"))`。
- 置信度是本地算出来的假数字（`api.ts:436`，`Math.min(0.95, ...)`），不联网。
- 后端没有该端点：`curl -X POST http://127.0.0.1:8000/jds:parse-text` → 404。
- `docs/issues/closed/a74d2-jd-crud-与软绑定-api.md:30` 写明当时**故意不实现** `POST /jds:parse-text` 与 `POST /jds:parse-image`。
- `ui/src/components/create-jd-modal.tsx:51-57` 的 `runTextParse` **没有 try/catch**：一旦失败 `parsing` 永远为 true、按钮永久「整理中…」；现在没暴露是因为它从不失败。

用户决定把「AI 整理」换成真 AI。仓库规矩要求先「原型 → Storybook 确认 → 才真实开发与后端对接」，因此本 issue 分两段落地：**阶段一**（原型补状态 + Storybook 确认件 + 契约草案）先给用户确认；用户 2026-10-07 拍板「1–5 全部按推荐执行」后，**阶段二**（后端真实端点 + 前端接线 + 口径文档）在同一分支顺序完成。

## Scope

- 阶段一（已完成）：原型 `#screen-jds` 补「新增 JD」弹窗四态并同步 `states`；`ui/src` 只加/改 Storybook 确认件（story + 为呈现状态而做的组件拆分），文案走 i18n（zh-CN 与 en 同步）。
- 阶段二（已完成）：后端实现 `POST /jds:parse-text`（权限 `jd:write`），模型配置取用户级 settings；前端把 `parseJdFromText` 改为真实请求并删掉该路径的启发式回退；容器接线失败态与「去设置模型」导航；同步 `runner.py` 注释与 `docs/design.md` 的口径。

## Non-goals

- 不改 `parseJdFromImage`（截图识别仍是硬编码示例草案，本次不假装它是真的）。
- 不改数据库模型配置、不动 `UserSettings.model_config` 结构。
- 不做 JD 截图识别（OCR / 多模态），也不给「AI 整理」加裸回车提交（用户已确认维持 Ctrl/Cmd+Enter，裸回车留给 textarea 换行）。

## Acceptance Criteria

- [x] `ui/prototypes/index.html` 的 `#screen-jds` 登记四态，只用既有令牌与既有组件语法，并同步该屏 `<ul class="states">`。
- [x] Storybook 覆盖 输入态 / 整理中 / 成功草案 / 模型未配置 / 解析失败可重试，且 `pnpm -C ui run build-storybook` 通过。
- [x] i18n zh-CN 与 en 键结构一致、en 无残留中文。
- [x] 后端 `POST /jds:parse-text`：成功解析、模型未配置、上游超时、上游拒绝、输出非法 JSON、置信度 clamp、错误体不含 key 均有测试。
- [x] 前端 `parseJdFromText` 走真实请求并删掉该路径启发式回退；`MachineErrorCode` 补新码；容器接线失败态与去设置导航。
- [x] `pnpm -C ui test`、`pnpm -C ui run build`、`cd backend && uv run pytest -q`、`archkit inspect .` 全绿。
- [x] 合并进 `main` 后用真实页面完成端到端实证。

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
- 文档口径：`README.md` 更新端点、测试与 story 计数。

阶段二（真实端点 + 前端接线）：

- 后端：新增 `backend/app/modules/jd/parser.py`（`POST /jds:parse-text` 的模型调用）：`_resolve_config` 从用户级 `user_settings.model_config` 取 model/endpoint/provider，key 经 `settings_service.decrypt_api_key` 解密；`catalog.resolve_base_url` + `catalog.PROBE_TIMEOUT` + `catalog.safe_status_message` 复用 settings 的 endpoint / 超时 / 状态码文案；仅对连接错误与超时重试一次；`body` 固定用用户原文（模型只抽取字段，不改写 / 截断）；`parseConfidence` clamp 到 [0,1]；`note` 固定 `由 AI 整理，请核对后创建。`；日志只记 url / 状态码 / 异常类型。
- 后端契约：`backend/app/modules/jd/schemas.py` 增 `JdParseRequest` / `ProposedJdExtracted` / `ProposedJdResponse`；`api.py` 增 `POST /jds:parse-text`（`jd:write`）；`service.py` 薄转发；`app/shared/errors.py` 增 `UPSTREAM_TIMEOUT` / `UPSTREAM_REJECTED` / `MODEL_OUTPUT_INVALID` 与对应异常类（504 / 502 / 502）。
- `settings/catalog.py` 把 `_resolve_base_url` / `_safe_status_message` 提升为公开 `resolve_base_url` / `safe_status_message`，供 jd 模块复用而不碰私有名。
- 前端：`ui/src/lib/api.ts::parseJdFromText` 改为 `request<ProposedJd>("/jds:parse-text")`（该路径不再回退启发式；`heuristicParseJd` 保留给 `parseJdFromImage` 的截图演示）；`ui/src/lib/types.ts` 的 `MachineErrorCode` 补三个新码；`create-jd-modal.tsx` 容器用 `useNavigate` 把「去设置模型」接到 `/settings`。
- 口径文档：`backend/app/modules/agent/runner.py:1-9` 改成如实描述（模型调用默认由独立 runner 承担，`POST /jds:parse-text` 是唯一同步例外 + 理由）；`docs/design.md` 的岗位端点清单补 `POST /jds:parse-text`，并在「关键决策」的独立进程条目上补同样的例外说明。

## Verification

- TDD Red：后端 `tests/test_jd_parse_text.py` 先因 `app.modules.jd.parser` 不存在而 collection error；前端 `api.test.ts` / `create-jd-modal.test.tsx` 新增断言先失败（旧实现仍返回启发式、未接线导航）。
- Green（合并后 main `0701f96` 上重跑）：`cd backend && uv run pytest -q` → 269 passed；`pnpm -C ui test` → 44 files / 326 passed；`pnpm -C ui run build` → 成功（仅 chunk 体积警告）；`archkit inspect .` → Quality gates passed。
- Storybook 阶段一确认件 `Components/CreateJdModal` 5 态（阶段一已由用户确认；Storybook 已收）。

端到端实证（dev 后端 `--reload` + Vite HMR，真实页面 + 真实 DeepSeek）：

- `curl`（admin 会话）`POST /jds:parse-text` → 200：`{"role":"前端工程师","company":"美团","tags":["前端","组件化","构建工具","类型系统"],"body":"<原文>","sourceUrl":null,"extracted":[…],"parseConfidence":0.82,"note":"由 AI 整理，请核对后创建。","inputSource":"text"}`；响应体不含 api key / Authorization / 上游原文。
- 无头 Playwright（`/usr/bin/python3` + `playwright`，`locale=zh-CN`，1440×1000）：`http://localhost:5173/jds` → 新增 JD → 粘贴无岗位关键词文本 → AI 整理 → 出现模型草案：岗位名称 `前端工程师`、公司 `美团`、标签 `前端, 组件化, 构建工具, 类型系统`、`解析置信度 70%`、note `由 AI 整理，请核对后创建。`。截图文件 `e2e-jds-parse.png`（存于 worktree 外的临时目录，未入库）。
- 「不是启发式」判定：同一段文本下，旧启发式的确定性输出为 role 空、company 空、tags `["后端"]`、置信度 0.6、note 旧文案（启发式不识别无「工程师 / 岗位」关键词的文本）；真实模型给 role=`前端工程师`、company=`美团`、4 个标签、note 新文案。更强证据：两次实时调用（curl 0.82 / 浏览器 0.70）置信度不同——确定性启发式不可能每次不同。

## Related ADRs

- None.
