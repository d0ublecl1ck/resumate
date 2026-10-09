---
id: b6eab
status: closed
created_at: 2026-10-09T16:27:50.897Z
updated_at: 2026-10-09T16:37:18.770Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:28:09.391Z
closed_at: 2026-10-09T16:37:18.770Z
---

# 把伪实现检测做成质量门禁：诚实词汇扫描与前后端路由交叉核对

## Background

一个伪实现被漏检：`ui/src/lib/api.ts` 的 `parseJdFromImage(fileName)` 注释自述「真实实现走图片识别；此处为前端演示，返回基于文件名的示例草案」，函数体确实是硬编码 demo 文本，只接文件名、完全不看图片；`ui/src/components/jd-tuning.tsx` 的 `launch()` 注释自述「前端演示：真实实现会创建绑定 JD 的 Agent 任务」，函数体只 `navigate(...)`。两者都进了两轮「还有什么没做」的审计却都没被抓到：

1. 审计按通用标记（`TODO|FIXME|XXX`）搜，没有按本仓库自己的诚实词汇（「此处为前端演示」「真实实现走」「示例草案」）搜；
2. 审计按材料的声称驱动，这个功能 PPT/方案里没写，从未进入范围，也没有「每个路由 × 每个可交互控件 → 真接口还是本地捏造」的遍历；
3. 注释里写着 `POST /jds:parse-image`，后端根本没有这个路由，从未被交叉核对。

本次只做检测门禁，不改产品代码（`api.ts` 与 `jd-tuning.tsx` 由另一个子代理修）。

## Scope

- 新增 `quality-gates/gates/no-fake-implementation.js`：`check(projectRoot)` 返回 `string[]`。
  - 规则一（结构化标记）：生产代码里出现含糊词汇（`前端演示`、`真实实现走`、`示例草案`、`假数据`、`占位数据`、`暂时写死`、`硬编码演示`、`demo data`、`hardcoded demo` 等）时，同一处必须有合规 `TODO(fake):` 四字段标记（摘要与 `TODO(fake):` 同行 + `真实实现:` + `影响:` + `出处:`）。没有配套标记 -> error；有标记但缺字段 -> error（点名缺哪个）；合规 -> 放行并进入清单。普通 `TODO/FIXME/XXX` 明显在说假实现 -> warning 建议规范化。反向约束（如「绝不用假数据填充」）不算命中。豁免：测试/story/mock/fixture 路径 + 行内 `fake-allow`。
  - 清单（known stubs）：每次运行把全部合规 `TODO(fake):` 汇总到 stdout，固定前缀 `[no-fake-implementation] known stubs:`，字段 `文件:行号 | 摘要 | 影响 | 出处 | 发现日期`，使「还有什么没做」一条命令即可回答。
  - 规则二（路由交叉核对）：抽取前端注释/代码里的 `METHOD /path` 声明，与后端 `backend/app/modules/**/api.py` 的 `APIRouter(prefix=...)` + `@router.*` 路由表比对；两侧把 `{id}` / `{resume_id}` / `${id}` / `:id` 归一成同一形态。缺失路由在「路径根段是真实后端资源」时报 error；根段不是后端资源（如前端聚合 `GET /workbench/summary`）时 `console.warn` 提示，不失败。
- 接入运行入口：`quality-gates/run.js` 已按 `gates/*.js` 自动发现并逐个调用 `check`，确认新门禁被跑到即可；不修改 `run.js`（它是 `.gate-version` 记录的官方文件，改动会触发 `archkit inspect` 的同步漂移）。
- 门禁自测：新增 `quality-gates/tests/no-fake-implementation.test.mjs`，用临时 fixture 树证明两条规则都会报错、干净树通过、豁免语法生效；并手工用样例/临时还原证明真实命中会被拦下。
- 必要的最小豁免：`ui/src/lib/content.ts` 是仓库的演示数据/fixture 模块（文件头自述、仅被 story/test/mock 与 `api.ts` 取常量），其 `MODEL_CATALOG` 只服务 `mocks/handlers.ts`；该行加 `fake-allow` 并写明理由。

## Non-goals

- 不改 `ui/src/lib/api.ts` 的 `parseJdFromImage` 与 `ui/src/components/jd-tuning.tsx` 的 `launch`（另一个子代理在修），不做任何产品行为改动。
- 不新增 CI、不改 `.githooks/pre-commit`、不改 `run.js`、不改 `generic-project.js` 与 `.gate-version`。
- 不追求一次性消灭所有既有命中：本 issue 交付门禁本身与自证，真实命中的修复归属各自 issue。

## Acceptance Criteria

- [x] `quality-gates/gates/no-fake-implementation.js` 存在，导出 `check(projectRoot)` 并返回 `string[]`；失败文案含「文件:行号 + 命中词/缺失路由/缺失字段 + 正确做法」。
- [x] 规则一：含糊词汇没有配套合规 `TODO(fake):` 标记即 error（给出文件:行号与标记模板）；合规四字段放行并进入清单；缺字段报「标记不合格」并点名缺失字段；反向约束不算命中；普通 TODO 描述假实现给 warning。
- [x] 规则一豁免：`*.test.*`、`*.stories.*`、`*.fixture.*`、`*.mock.*`、`mocks/`、`fixtures/`、`tests/`、`storybook/` 路径与行内 `fake-allow` 注释，语法与既有 gate 的 `-allow` 行内标记一致。
- [x] 清单输出到 stdout 固定位置，字段 `文件:行号 | 摘要 | 影响 | 出处 | 发现日期`。
- [x] 规则二能归一化 `{id}` / `{resume_id}` / `${id}` / `:id`；优先 openapi 快照、否则静态解析 `APIRouter(prefix=)` + `@router.*`；缺路由时按「根段是否为后端资源」区分 error 与 `console.warn`，`include_router` 非空前缀给 warning。
- [x] `node quality-gates/run.js` 与 `archkit inspect .` 会执行该门禁（run.js 自动发现 `gates/*.js`，无需改动）。
- [x] 自证三组：无标记报错（含文件:行号与模板）、合规四字段通过且清单出现该条、删一个字段报「标记不合格」；三组输出记录在 Verification。
- [x] 门禁自测（`node --test quality-gates/tests/no-fake-implementation.test.mjs`）11 条全绿。
- [x] 全仓 0 命中后提交门禁本身；仓库内不出现绝对家目录路径；提交带且仅带一个 `Issue: <id>` trailer，不 push。

## Implementation

- `quality-gates/gates/no-fake-implementation.js`：导出 `check(projectRoot)` 与 `analyzeProject(projectRoot)`（自测用），并支持 `node quality-gates/gates/no-fake-implementation.js [projectRoot]` 直接运行。规则一为结构化标记判定，规则二抽取 `METHOD /path` 与后端路由表比对。
- 规则一实现：`parseStubBlocks` 解析合规 `TODO(fake):` 四字段；合规块覆盖的行（含前 2 行窗口）跳过含糊词汇判定；无标记命中 -> error；缺字段 -> 「标记不合格」并点名；`NEGATION` 守卫让「绝不用假数据」这类反向约束不算命中；普通 TODO 描述假实现 -> warning。
- 规则二路由来源：优先 `OPENAPI_SNAPSHOT_PATH` / `backend/openapi.json` / `quality-gates/reports/openapi.json`（当前仓库无快照），否则静态解析 `backend/app/modules/**/api.py` 的 `APIRouter(prefix=...)` 与 `@router.<method>("...")`；`include_router(..., prefix=...)` 带非空前缀时输出 warning（静态解析无法可靠映射回模块）。
- 参数归一化：花括号参数、TS 模板串参数、冒号整段参数统一成 `{}`；`/jds:parse-text` 这类动作后缀不归一，避免把 `:parse` 误当参数。集合级声明退化：`DELETE /x` 若后端有 `DELETE /x/{}` 视为已实现，减少假阳性。
- 清单：`check` 每次把合规 `TODO(fake):` 打印到 stdout，固定前缀 `[no-fake-implementation] known stubs:` 与字段 `文件:行号 | 摘要 | 影响 | 出处 | 发现日期`。选 stdout 而非落盘报告，因为写 `quality-gates/reports/*.md` 会让每次门禁运行都脏工作区，影响 pre-commit 与 `archkit inspect` 的改动集。
- `quality-gates/tests/no-fake-implementation.test.mjs`：11 条 `node:test`，覆盖无标记 error、合规放行+清单、缺字段不合格、`fake-allow`、路径豁免、反向约束、通用 TODO warning、规则二 error / warning / 归一化 / 前缀。
- `run.js` 未改：它已按 `gates/*.js` 自动发现并逐个 `check`；改它会与 `.gate-version` 记录的官方文件哈希不符，触发 `archkit inspect` 同步漂移。
- `ui/src/lib/content.ts:396` 加行内 `fake-allow`：`MODEL_CATALOG` 只被 `ui/src/mocks/handlers.ts` 的 MSW mock 引用（生产设置页走后端 `/models/catalog` 快照），是合法 fixture，不是伪实现。
- 未提交：按调度决定，等全仓 0 命中后再提交门禁本身，避免新门禁提前锁死 worktree 的 pre-commit。

## Verification

### 自测：11 条全绿

```text
$ node --test quality-gates/tests/no-fake-implementation.test.mjs
ℹ tests 11
ℹ pass 11
ℹ fail 0
```

### 自证 A：无标记的伪实现 -> error（含文件:行号与模板）

临时 fixture `/tmp/nfi-demo`（不提交）：`ui/src/lib/stub.ts` 写「前端演示：返回示例草案」。

```text
EXIT=1
[no-fake-implementation] known stubs: 0
[no-fake-implementation] failures: 1
  [no-fake-implementation] ui/src/lib/stub.ts:1 命中伪实现词汇「前端演示」但没有配套的合规标记 -> 临时实现必须写成结构化标记，模板：TODO(fake): <一句话摘要>
  //   真实实现: <真实现应当做什么>
  //   影响: <用户会看到什么错误结果>
  //   出处: <issue id 或文档锚点>；...
```

### 自证 B：改成合规 TODO(fake) 四字段 -> 通过，且清单出现该条

```text
EXIT=0
[no-fake-implementation] known stubs: 1（文件:行号 | 摘要 | 影响 | 出处 | 发现日期）
  ui/src/lib/stub.ts:1 | JD 截图识别仍是本地 stub | 上传截图后只按文件名返回示例草案，用户拿不到真实识别结果 | b6eab | 2026-10-09
[no-fake-implementation] no failures.
```

### 自证 C：删掉「出处」字段 -> 报标记不合格

```text
EXIT=1
[no-fake-implementation] failures: 1
  [no-fake-implementation] ui/src/lib/stub.ts:1 TODO(fake) 标记不合格，缺少字段：出处 -> 按下面模板补全（四项缺一不可）：TODO(fake): <一句话摘要>
  //   真实实现: <真实现应当做什么>
  //   影响: <用户会看到什么错误结果>
  //   出处: <issue id 或文档锚点>
```

### 接进 run.js 与 archkit inspect（确认会被执行）

```text
$ node quality-gates/run.js
[no-fake-implementation] 路由表来源：静态解析 backend/app/modules/**/api.py（未找到 openapi 快照）
[no-fake-implementation] known stubs: 0
Quality gates passed.

$ archkit inspect .
[no-fake-implementation] 路由表来源：静态解析 backend/app/modules/**/api.py（未找到 openapi 快照）
[no-fake-implementation] ui/src/lib/api.ts:852 声明 GET /workbench/summary 不在后端路由根集合内（可能是前端聚合或文档漂移），无法判定。
[no-fake-implementation] known stubs: 0
Quality gates passed.
```

### 当前仓库真实命中与处置

- `ui/src/lib/api.ts:521`（原「真实实现走 / 此处为前端演示 / 示例草案」）：已由另一个子代理改成真实 `POST /jds:parse-image` 调用，后端 `backend/app/modules/jd/api.py:68` 已有该路由，现 0 命中。
- `ui/src/components/jd-tuning.tsx:67`（原「前端演示」）：已被修复，现 0 命中。
- `ui/src/lib/content.ts:396`（「前端演示 fixture」）：合法 mock fixture，已加行内 `fake-allow`，现 0 命中。
- `ui/src/features/interview/voice-screen.tsx:3`（「绝不用假数据填充」）：反向约束，非伪实现；门禁加 `NEGATION` 守卫后不再命中。
- `ui/src/lib/api.ts:852`「`GET /workbench/summary`」：前端聚合函数，非后端端点；规则二归入 warning，不失败。
- **原剩余 1 处 error（已按决策 a 修复）**：`ui/src/i18n/locales/en/common.ts:44` 与 `zh-CN` 同键 `loadingDemo`。它是 `ui/src/pages/states.tsx:9` 的 PageLoading 默认描述，数据早已全部走后端，文案过期且误导用户；拍板选「改文案，不用豁免」——`正在读取本地演示数据…` -> `正在加载…`，`Reading local demo data…` -> `Loading…`，键名不变。它不是待实现的临时实现，因此没有用 `fake-allow` 或 `TODO(fake)`。改后全仓 0 命中。

### 接管复核（integrator，2026-10-09）

隔离样例树 `/tmp/nf-{a,b,c}`（不提交）复跑三组，命令 `node quality-gates/gates/no-fake-implementation.js <tree>`：

```text
CASE a（有含糊词汇、无标记）exit=1
  [no-fake-implementation] ui/src/lib/draft.ts:1 命中伪实现词汇「此处为前端演示」但没有配套的合规标记 → 临时实现必须写成结构化标记，模板：TODO(fake): <一句话摘要> ...
CASE b（合规四字段）exit=0
  [no-fake-implementation] known stubs: 1（文件:行号 | 摘要 | 影响 | 出处 | 发现日期）
    ui/src/lib/draft.ts:2 | parseJdFromImage 只按文件名返回示例草案 | 用户上传任意图片都得到同一个基于文件名的假结果 | b6eab | 2026-10-09
  [no-fake-implementation] no failures.
CASE c（删「影响」字段）exit=1
  [no-fake-implementation] ui/src/lib/draft.ts:2 TODO(fake) 标记不合格，缺少字段：影响 → 按下面模板补全（四项缺一不可）...
```

全仓直跑（`node quality-gates/gates/no-fake-implementation.js`，exit 0）：

```text
[no-fake-implementation] known stubs: 0（文件:行号 | 摘要 | 影响 | 出处 | 发现日期）
[no-fake-implementation] no failures.
```

同轮门禁与测试：`node quality-gates/run.js` -> Quality gates passed.；`archkit inspect .` -> Quality gates passed.；`pnpm -C ui exec tsc -b --noEmit` -> exit 0；`pnpm -C ui test` -> 80 files / 606 passed。

### 提交范围

```text
新增  quality-gates/gates/no-fake-implementation.js
新增  quality-gates/tests/no-fake-implementation.test.mjs
修改  ui/src/lib/content.ts（仅 MODEL_CATALOG 那行加行内 fake-allow 与理由）
修改  ui/src/i18n/locales/zh-CN/common.ts（loadingDemo 文案）
修改  ui/src/i18n/locales/en/common.ts（loadingDemo 文案）
修改  docs/issues/b6eab-…md（本文件）
未改  quality-gates/run.js / .gate-version / generic-project.js（run.js 按 gates/*.js 自动发现）
```

## Related ADRs

- None.
