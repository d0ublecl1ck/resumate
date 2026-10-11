---
id: 140bd
status: closed
created_at: 2026-10-09T16:27:06.791Z
updated_at: 2026-10-09T16:46:06.287Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-10-09T16:27:28.764Z
closed_at: 2026-10-09T16:46:06.287Z
---

# JD 微调启动真实化：创建绑定 JD 的 Agent run 并接手 Run 面板

## Background

`ui/src/components/jd-tuning.tsx:66-69` 的 `launch()` 只 `navigate(/resumes/{target}?panel=run)`，不创建任何绑定该 JD 的 Agent 任务；注释「真实实现会创建绑定 JD 的 Agent 任务」与行为不符，Run 面板看到的轮次与这个 JD 无关。

契约核对结论（写进 issue）：
- Agent 运行/轮次的数据模型**没有 jd_id 字段**（grep `jd_id|jdId` 在 backend/app/modules/agent 无命中）；`POST /resumes/{resume_id}/runs`（RunStartRequest = prompt/executionMode/sessionId）把 run 绑到简历（+可选 session），`POST /resumes/{id}/turns`（TurnCreateRequest）也没有 JD 字段。
- JD 的结构化绑定是 `job_descriptions.bound_resume_id`（`PUT /jds/{id}/binding`）。因此「绑定该 JD 的 Agent 任务」在现有契约里的正确表达是：**PUT 绑定 JD → 用带 JD revision/岗位/正文的 prompt 起 resume run**；JD 上下文经 prompt 携带，run 经 resume 归属。
- copy 操作有 `POST /resumes/{resume_id}/duplicate`。

## Scope

- `ui/src/lib/api.ts`：新增 `setJdBinding` 与 `jdTuningPrompt`（纯函数，可测）；复用 `duplicateResume`/`startRun`。
- `ui/src/components/jd-tuning.tsx`：`launch()` 真实创建 copy（如需）/绑定/run，失败给 i18n；注释与文案如实。
- JD i18n 键（启动失败文案）；`jd-detail-actions.test.tsx` 新增用例。

## Non-goals

- 不改 `run-panel.tsx`、`app-shell.tsx`、`agent-onboarding*`、`quality-gates/**`、`ui/prototypes/index.html`；不改 agent 后端契约、不加迁移；不 push；不重启 8000/5173。

## Acceptance Criteria

- [x] 点「开始微调」-> `POST /resumes/{target}/runs` 202，请求 prompt 含 JD 岗位/公司/revision/正文与操作方式。
- [x] 勾选「同时显式绑定」或改选目标 -> `PUT /jds/{id}/binding`；copy 模式 -> 先 `POST /resumes/{id}/duplicate` 再 run。
- [x] 失败映射 i18n、不直出服务端 message；注释不再声称未实现的行为。
- [x] 测试覆盖 direct / copy / rebind / 失败；`tsc` 与门禁通过。
- [x] 浏览器证据：网络请求 + 该 target 简历下出现 run 绑定轮次。

## Implementation

- `ui/src/lib/api.ts` 增 `setJdBinding(id, resumeId)`（PUT /jds/{id}/binding，body {resumeId}）与 `jdTuningPrompt(jd, operation)`（纯函数：prompt 带 JD revision/岗位/公司/正文，copy 追加副本说明）。
- `ui/src/components/jd-tuning.tsx`：`launch()` 改为真实链路——copy 先 `duplicateResume`，勾选 rebind 时 `setJdBinding(jd.id, runResumeId)`，然后 `startRun(runResumeId, { prompt: jdTuningPrompt(jd, op) })`，最后 `navigate(/resumes/{runResumeId}?panel=run)`；加了 launching 态、429/权限/网络/通用失败映射；删掉与行为不符的「前端演示 / 真实实现会…」注释，description/footerNote 改成如实描述。
- i18n：`jd.tuning.launching`、`jd.tuning.errors.launchFailed`/`launchBusy`，并改 `description`/`footerNote`。

## Verification

- 前端：`pnpm -C ui test` -> 606 passed；`jd-detail-actions.test.tsx` 11 passed，新增 direct（POST /runs 202、prompt 含 rev.1 与 JD 正文、跳 /resumes/res_fe_lead?panel=run）、copy（先 duplicate 再在 res_copy 上 run）、rebind（先 PUT binding {resumeId} 再 run）、429 映射 i18n 且不泄漏服务端原文。
- 真实契约：8007 实例上对 admin 的真实 JD `jd_8ce4abc693ee` 执行 `PUT /jds/{id}/binding {resumeId:res_e3290a6fc34f}` -> `boundResumeId=res_e3290a6fc34f`，再 `DELETE` 恢复 `None`。
- 门禁：`node quality-gates/run.js` 与 `archkit inspect .` 通过。
- 浏览器（无头 Chromium，locale=zh-CN，admin）：`/jds/jd_8ce4abc693ee` 选「复制后微调」-> `POST /resumes/res_e3290a6fc34f/duplicate` 201 得副本 `res_cf18c53f6249` -> `POST /resumes/res_cf18c53f6249/runs` 202 `{"runId":"run_d265c1f7af92","status":"started"}`，prompt 含 `JD revision rev.1`、岗位/公司/正文与副本说明 -> 跳转 `/resumes/res_cf18c53f6249?panel=run`；随后 `GET /resumes/res_cf18c53f6249/turns` 得到 `turn_97198052f777`（clientId=run_d265c1f7af92, source=agent, executionMode=approval, state=open, sessionId=sess_38872a3c85c7）。证据：`docs/e2e/2026-10-09/areas/jd-image-tuning/02-tuning-run.png`、`network-evidence.json`。

## Related ADRs

- None.
