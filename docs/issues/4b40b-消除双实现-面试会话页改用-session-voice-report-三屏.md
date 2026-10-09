---
id: 4b40b
status: in-progress
created_at: 2026-10-09T09:19:32.958Z
updated_at: 2026-10-09T09:29:37.364Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T09:19:44.167Z
---

# 消除双实现：面试会话页改用 Session/Voice/Report 三屏

## Background

`ui/src/features/interview/{session,voice,report}-screen.tsx` 是 Storybook 先行阶段的完整实现，
但没有任何路由使用：`SessionScreen` 无 props 且只有静态稿；`VoiceScreen` 已接真实录音与云端转写，
但只在 Storybook 渲染；`InterviewReportScreen` 的分数与证据是组件内常量。
真实路由 `/interview/:id`（`ui/src/pages/interview-session.tsx`）自己重写了一遍同能力渲染：
`ReportPanel`、`VoiceAnswerEntry`、`QuestionCard`、`MetaRow`、`BulletList`、`ExpressionRow`。
两套实现并存，改一套漏一套。本 Issue 把三个屏改成受控展示组件，页面只做容器与数据编排。

## Scope

- `ui/src/pages/interview-session.tsx`：只保留取数（`getInterviewSession` / `getInterviewReport` /
  `listSpeechSegments`）与回调（`submitInterviewAnswer` / `createSpeechSegment` /
  `finishInterviewSession`），渲染交给三个屏；删除页面内重复实现。
- `ui/src/features/interview/session-screen.tsx`：新增受控 props（session / activeQuestion / 回调），
  无 props 时回退到文件内设计样例（Storybook 仍可渲染）。
- `ui/src/features/interview/voice-screen.tsx`：新增受控 props（session / question / 回调），
  无 props 时回退到设计样例；保留自带真实录音与云端转写链路。
- `ui/src/features/interview/report-screen.tsx`：新增 `report` 入参渲染真实分数与证据；
  无 `report` 时沿用设计常量；补齐页面独有的「总体摘要」与「证据不足不给分」呈现。
- `ui/src/features/interview/*.stories.tsx`、`*.test.tsx`：更新契约与断言。
- `ui/src/i18n/locales/{zh-CN,en}/interview{Session,Report,Voice}.ts`：新增文案，两语言键结构一致、en 无汉字。

## Non-goals

- 不改后端、迁移与 API 契约。
- 不动 `{bank,growth,history,plan,questions,setup}-screen.tsx`、`ui/prototypes/index.html`、
  `ui/src/mocks/handlers.ts`、`docs/competition/**`。
- 不新增路由：三个屏都在 `/interview/:id` 上由页面编排。
- 不把设计屏里本就存在的交互（TTS 播报按钮、导出报告按钮）接后端。

## Acceptance Criteria

- [x] `/interview/:id` 会话流由 `SessionScreen` 渲染、语音作答由 `VoiceScreen` 渲染、
      评估报告由 `InterviewReportScreen` 渲染；页面不再保留 `ReportPanel` / `VoiceAnswerEntry` /
      `QuestionCard` / `MetaRow` / `BulletList` / `ExpressionRow`。
- [x] 三个故事可渲染：屏在无 props 时回退到设计样例数据。
- [x] 真实数据只来自既有接口，真实页面路径不出现组件内 mock 常量（分数、证据、题目、会话信息、量表版本、岗位）。
- [x] 无头 Chromium（zh-CN，vite 5173 + 后端 8000）走通：文字作答 → 追问 → 结束评估 →
      报告显示真实分数与证据；语音入口能打开录音；截图存 `/tmp/`。
- [x] `pnpm -C ui exec vitest run`、`pnpm -C ui exec tsc -b --noEmit`、`pnpm -C ui build-storybook` 全通过。
- [x] `node quality-gates/run.js` / `archkit inspect .` 通过；`grep` 证明页面无重复实现且三个屏都被页面 import。

## Implementation

受控契约（页面只做容器，取数与回调都在 `pages/interview-session.tsx`）：

- `SessionScreen({ session, activeQuestionId, voiceQuestionIds, onAnswer, onVoiceEntry, submitting,
  submitError, canFinish, onFinish, finishing, finishError, voiceAvailable, asrAvailable })`：
  把 `session.questions` 铺成对话流（面试官气泡 + 候选人气泡），右侧「本场信息 / 语音链路 / 追问依据」
  读真实 `contextSnapshot`、浏览器录音能力与当前题 `referencePoints`；底部输入框提交文字作答，
  「语音回答」把当前题 id 交给页面；不足四个屏能力时保留「结束并生成评估」入口。
- `VoiceScreen({ session, question, voiceQuestionIds, saving, error, onBack, onRecorded })`：
  上方对话流展示当前题之前的真实问答，当前题读 `question.prompt`，右侧本场信息 / 追问依据读真实数据；
  自带 `useVoiceRecorder` + `useCloudTranscription` 真实录音链路，确认时通过 `onRecorded` 回传
  时长 / 转写 / 时间戳 / 链路；手动时长与空转写在提交前用 i18n 文案拦截。
- `InterviewReportScreen({ report, role, speech })`：`report` 存在时内容维度、证据、总体摘要、
  亮点 / 不足 / 建议、量表版本、岗位全部来自真实报告；`score === null` 显示「证据不足」且不给分、
  不画进度条；证据多于一条才出现「展开证据原文」；`speech` 决定表达维度显示实测值还是「不适用」。
  无 `report` / `speech` 时回退设计样例，Storybook 故事照旧渲染。

页面删除：`ReportPanel` / `VoiceAnswerEntry` / `QuestionCard` / `MetaRow` / `BulletList` / `ExpressionRow`，
页面从 758 行降到 223 行。

Storybook 回退策略：三个屏都在无 props 时回退到文件内设计样例数据（stories 不显式传真实数据），
故事文件里已写明；`report-screen` 的 `speech` 显式传样例（`null` / `VOICE_SAMPLE`）用于演示两种表达维度态。

i18n：`interviewSession` 新增 inProgress / voiceUnavailable / elapsedValue / referenceLine / company /
voice.entry+hint+recorder 行 / gaps.empty；`interviewReport` 新增 summary.title / insufficientEvidence /
noEvidence / empty，并把 description 与 confidenceBasis 改成插值（量表版本、依据处数）；`interviewVoice`
新增 answerTitle / answerDescription / header.back / question.noQuestion / answer.saving+submitError /
panel.session.jd / panel.gaps.empty。zh-CN 与 en 键结构一致，en 无汉字。

## Verification

- `pnpm -C ui exec vitest run` → `Test Files 72 passed (72) / Tests 511 passed (511)`。
- `pnpm -C ui exec tsc -b --noEmit` → exit 0，无输出。
- `pnpm -C ui build-storybook` → `Storybook build completed successfully`。
- `node quality-gates/run.js` → `Quality gates passed.`；`archkit inspect .` → `Quality gates passed.`。
- 无头 Chromium（`chromium.launch({headless:true})`，`locale="zh-CN"`，vite 5173 + 后端 8000，
  登录 admin@resumate.dev）：
  - 打开 `/interview/ivs_814176d3982c`，文字作答 3 题并提交，`结束并生成评估`；
    报告显示真实分数 `correctness=84 / depth=72 / rigor=60 / fit=78` 与真实证据，
    与 `GET /interview/sessions/{id}` 返回的 report 完全一致（设计常量是 82/75/77/88，可区分）。
  - 另建会话 `ivs_f31744575686` 提交「这个没做过，不太清楚。」触发追问：
    面试官气泡数 3 → 5，出现「追问」气泡与追问依据。
  - 语音入口：点「语音回答」进入 `VoiceScreen`，出现「允许使用麦克风」→ 点击后出现「开始录音」。
  - 截图：`/tmp/e2e-session-active.png`、`/tmp/e2e-voice-entry.png`、
    `/tmp/e2e-voice-record-ready.png`、`/tmp/e2e-session-answered.png`、
    `/tmp/e2e-report-final.png`、`/tmp/e2e-follow-up.png`。
- `grep -nE 'function (ReportPanel|VoiceAnswerEntry|QuestionCard|MetaRow|BulletList|ExpressionRow)'
  ui/src/pages/interview-session.tsx` → `NONE`；页面 import 了三个屏。

## Related ADRs

- None.
