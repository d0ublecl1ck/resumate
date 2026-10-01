---
id: 3ae82
status: in-progress
created_at: 2026-10-01T01:37:39.921Z
updated_at: 2026-10-01T01:37:55.995Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-10-01T01:37:55.995Z
---

# 历史会话界面：会话列表与详情 Storybook 先行

## Background

后端会话能力已就绪而前端一条都没用：`GET /sessions`（最近活跃优先）与 `GET /sessions/{id}/messages`（支持 afterSeq 增量）。运行体已经在写会话历史，压缩产生的摘要是一条 `role=system`、内容以 `[compacted-history]` 开头的消息；**压缩会把 seq 打出空档（base 重锚），seq 不能当连续计数**。

按 `new-react-page` 的强顺序，本 Issue 只做到「原型补登记 + Storybook」，等用户确认后才做真实页面接线。

**已知限制与取舍：会话表没有 title / summary 字段。** 列表项拿不到标题，因此：

- 列表项标题用 `lastActiveAt` 派生（`YYYY-MM-DD HH:mm · 短 ID`），不编造 title 字段；
- 详情页显式写一句「后端暂未保存会话标题，这里用最近活跃时间代替」，让限制对用户可见；
- 不请求额外的消息接口去猜标题——列表页不该为标题拉全量消息。

## Scope

1. `ui/prototypes/index.html`：新增 `设计补充 · 历史会话（SCR-004 侧栏入口）` 面板，登记列表四态（有会话 / 空 / 加载 / 出错）与详情五态（消息流 / 压缩摘要 / 空会话 / 加载 / 出错），复用既有令牌，品牌 C 档（语法层 + mascot="badge"）。
2. `ui/src/components/session-history.tsx`（新增，纯展示）：`SessionList` 与 `SessionDetail`，数据由 props 注入；`SessionSummary` / `SessionMessage` 形状镜像后端契约字段，一个不多；`content` 是任意 JSON，组件做健壮渲染。
3. `ui/src/components/session-history.stories.tsx`（新增，标题 `Pages/SessionHistory`）：9 个 story 覆盖上述状态，含一条带 `[compacted-history]` 的会话。
4. `ui/src/components/session-history.stories.test.tsx`（新增）：story 级断言。
5. i18n：新增 `sessionHistory` 命名空间并同步 zh-CN / en。

## Non-goals

- 不接真实页面：**不改 App.tsx、不加路由、不改 lib/api.ts 的真实调用**，不动 run-panel 与 agent-onboarding。
- 不请求真实端点、不加 MSW handler：本期组件不发起任何网络调用。
- 不编造后端没有的数据（title / summary / message 计数等一律不出现）。
- 不做搜索、分页、收藏、删除会话等交互。

## Acceptance Criteria

- [x] 原型补登记历史会话列表与详情的全部状态，且不新增页面视觉规则（品牌 C 档）。
- [x] Storybook 覆盖：正常会话与消息、空态、含 `[compacted-history]` 的会话（渲染为独立「已压缩的历史」块且不暴露原始标记）、加载中、出错态。
- [x] `seq` 只作为元信息展示，不参与连续计数。
- [x] i18n 双语键结构一致，en 无中文。
- [x] `pnpm -C ui test`、`pnpm -C ui build-storybook`、`archkit inspect .` 全绿。
- [x] 未改动 App.tsx / 路由 / lib/api.ts / run-panel / agent-onboarding。

## Implementation

- `session-history.tsx`：`SessionList({ sessions?, error?, activeId?, onSelect? })` 用 `sessions === undefined` 表示加载中、`[]` 表示空态；`SessionDetail({ session?, messages?, error?, onBack? })` 同样语义。加载/空/错误三态走 `StateBlock`（内部是 `MascotState mascot="badge"`，C 档）。
- 压缩识别：`message.role === "system" && text.startsWith("[compacted-history]")` → 渲染成 cobalt 边框卡片，标题「已压缩的历史」＋说明胶囊，正文去掉标记本身。
- 工具调用：从 wire 的 `toolCalls` 提取 name，单独一行「工具调用：xxx」。
- 时间统一 `dayjs(...).format("YYYY-MM-DD HH:mm")`，无效时间原样回退。
- i18n：`ui/src/i18n/locales/{zh-CN,en}/sessionHistory.ts` + 两个 `index.ts` 注册。
- 原型：`ui/prototypes/index.html` 新增 `#session-history` 面板（列表 4 条 + 详情 5 条 checklist）＋「无标题」限制说明与落点。

说明：本次组件与 story 基本同笔完成，story 测试随后补齐并在首轮失败一条断言（本地时区下两个会话落在同一天导致 `getByText` 命中多处），改为 `getAllByText` 后通过；不是严格的先红后绿，失败与修复证据如上。

## Verification

```
pnpm -C ui test
→ Test Files 28 passed (28) / Tests 215 passed (215)

pnpm -C ui build-storybook
→ Storybook build completed successfully

archkit inspect .
→ Quality gates passed.
```

## Related ADRs

- None.
