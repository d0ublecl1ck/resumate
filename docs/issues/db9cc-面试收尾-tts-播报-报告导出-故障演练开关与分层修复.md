---
id: db9cc
status: in-progress
created_at: 2026-10-09T09:31:48.329Z
updated_at: 2026-10-09T09:31:58.963Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: A11 面试与能力提升
started_at: 2026-10-09T09:31:58.963Z
---

# 面试收尾：TTS 播报、报告导出、故障演练开关与分层修复

## Background

上一轮把面试会话页拆成 Session/Voice/Report 三屏后，屏上仍剩三个「有界面没后端」的控件：
报告屏「导出报告」无后端；语音屏「播放题目」是 3 秒定时器的假播报；语音屏
「模拟语音服务不可用」开关行为未定义。另外 voice-screen / session-screen 反向
import `@/pages/interview` 的 InterviewErrorNotice，features 依赖 pages。

## Scope

- 新增 `POST /speech/synthesize`：用已配置的百炼 Key 调 qwen3-tts-flash，服务端取回音频字节并回给前端；未配置 Key 沿用 MODEL_NOT_CONFIGURED，上游失败映射稳定错误码。
- 新增 `GET /interview/sessions/{id}/report/export?format=markdown`：返回 text/markdown 附件 + RFC5987 中文文件名，format 非 markdown 走 422。
- voice-screen「播放题目」接真实 TTS，失败/未配置如实降级为纯文字；「模拟语音服务不可用」做成真故障注入。
- report-screen「导出报告」接导出接口，成功/失败走 i18n，不直出服务端 message。
- InterviewErrorNotice 从 pages/interview 下沉到 ui/src/components，features 不再依赖 pages。

## Non-goals

- 不改 pages/interview-session.tsx、session-screen.tsx 的既有结构（仅更新被下沉组件的 import 路径）。
- 不改 ui/prototypes/index.html、ui/src/mocks/handlers.ts、backend/app/modules/kb/**、docs/competition/**。
- 不做 git 写操作；不重启 8000。

## Acceptance Criteria

- [x] `/speech/synthesize` 契约用 httpx.MockTransport 覆盖成功/401/超时/畸形/音频 URL 失配；真实调用一次并记录音频字节数与时长。
- [x] 未配置 Key 返回可区分的 MODEL_NOT_CONFIGURED，且不发起上游请求。
- [x] 报告导出 Markdown 含岗位、量表版本、四维分数与证据、亮点/不足/改进建议、表达维度；`format=pdf` 返回 422。
- [x] 前端 vitest 覆盖播报成功、未配置降级、导出成功/失败；`tsc -b --noEmit` 与 `build-storybook` 通过。
- [x] 无头 Chromium（zh-CN）真实会话点击「播放题目」发出 /speech/synthesize 并拿到音频，报告页「导出报告」下载 Markdown。
- [x] `node quality-gates/run.js` 与 `archkit inspect .` 通过。

## Implementation

- 后端 TTS：新增 `backend/app/modules/speech/dashscope_tts.py`（POST `/services/aigc/multimodal-generation/generation` -> 校验 `output.audio.url` -> GET 取回音频字节；401/超时/畸形/URL 过期映射稳定错误码，音频不落盘）；`schemas.py` 增 `SpeechSynthesisRequest`（text/voice/format，format 只接受 wav）与 `SpeechExpressionView`；`service.py` 增 `synthesize_speech` 与 `summarize_session_expression`；`api.py` 增 `POST /speech/synthesize`，返回音频二进制而非临时签名 URL（签名 URL 会过期且不应暴露给浏览器），权限沿用 `jd:write`。
- 报告导出：`interview/service.py` 增 `export_report_markdown` 与 `_render_report_markdown`（岗位、量表版本、四维分数与证据表、亮点/不足/建议、表达维度）；`interview/api.py` 增 `GET /interview/sessions/{id}/report/export`，text/markdown 附件 + RFC5987 中文文件名，`format` 用 `Literal["markdown"]` 让非 markdown 走 422，权限 `jd:read`。
- 前端：`api-client.ts` 增 `requestBlobWithResponse`；`speech-api.ts` 增 `synthesizeSpeech`；`interview.ts` 增 `exportInterviewReportMarkdown`；voice-screen 用真实 `<audio>` 播放 TTS，状态如实标注「云端播报」或错误码映射的「已降级为纯文字，上下文完整保留」，「模拟语音服务不可用」做成真故障注入（跳过云端转写与播报）；report-screen 接导出并给出 i18n 成功/失败反馈。
- 分层：`InterviewErrorNotice` 下沉到 `ui/src/components/interview-error-notice.tsx`，features/session-screen 与 features/voice-screen 改从 components 引入（仅改 import 行，不动既有结构）。

## Verification

- 后端：`backend/.venv/bin/python -m pytest -q` -> 503 passed；新增 `tests/test_speech_tts.py`（MockTransport 成功/401/超时/畸形/URL 过期/expires_at 过期/未配置 Key/format 422）、`tests/test_interview_report_export.py`（Markdown 内容、RFC5987 文件名、无报告 404、format=pdf 422）。
- 真实 TTS：`POST /speech/synthesize` 200 `audio/x-wav`，音频 234284 字节、单声道 24000 Hz 16bit、时长 4.88s（上游 wav 头 data size 为流式占位值 0x7FFFFF9B，按实际 payload 234240 字节计算）。
- 前端：`pnpm -C ui test` -> 516 passed（新增播报成功/未配置降级/故障演练、导出成功/失败）；`pnpm -C ui exec tsc -b --noEmit` 通过；`pnpm -C ui build-storybook` 成功。
- 无头 Chromium（locale=zh-CN，Playwright）：真实会话 `ivs_e9b340197020` 点「播放题目（TTS）」-> 请求 `/api/speech/synthesize` 200 `audio/x-wav`，界面标注「云端播报」；会话 `ivs_814176d3982c` 点「导出报告」-> `GET /api/interview/sessions/ivs_814176d3982c/report/export?format=markdown` 200 `text/markdown`，RFC5987 文件名，下载 `面试评估报告-资深后端工程师.md`，界面提示「报告已导出为 Markdown。」。证据：`docs/e2e/2026-10-09/areas/interview-tts-report/`（`network-evidence.json`、`01-voice-tts.png`、`02-report-export.png`、`tts-audio-sample.wav`、`downloaded-report.md`）。
- 验证期另起 :8001（新代码）与 :5174（`API_PROXY_TARGET=http://127.0.0.1:8001`），未重启 :8000；验证后两进程已停止，浏览器租约已 release。
- 门禁：`node quality-gates/run.js` 与 `archkit inspect .` 均输出 `Quality gates passed.`。

## Related ADRs

- None.
