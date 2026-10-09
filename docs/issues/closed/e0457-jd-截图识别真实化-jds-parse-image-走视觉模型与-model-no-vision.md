---
id: e0457
status: closed
created_at: 2026-10-09T16:26:10.638Z
updated_at: 2026-10-09T16:45:56.583Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-10-09T16:27:27.559Z
closed_at: 2026-10-09T16:45:56.583Z
---

# JD 截图识别真实化：/jds:parse-image 走视觉模型与 MODEL_NO_VISION

## Background

前端 `parseJdFromImage(fileName)`（ui/src/lib/api.ts:523）是伪实现：只收文件名，返回与图片无关的硬编码示例草案；后端 grep `image_url|image_base64|vision` 在 backend/app 无命中。真实图像识别缺失，`/jds` 上传截图点了没用。后端已有 `POST /jds:parse-text` 与 `jd/parser.py` 的同步模型调用范式，图像版与它同构，草案不落库。

已核对：`settings/data/model_catalog.json` 的模型条目只有 id/label/contextWindow/maxOutputTokens/成本，**没有任何 capability/modalities 字段**（`vision` 只出现在模型名里）。因此「模型是否支持看图」只能靠显式模型族判定，不能从目录能力标记读取。

## Scope

- `backend/app/modules/jd/schemas.py`：`JdImageParseRequest`（imageBase64/contentType/filename，png/jpeg/webp，8MB 上限）。
- `backend/app/modules/jd/parser.py`：`parse_jd_image`，OpenAI 兼容 `content:[{type:text},{type:image_url}]`，复用既有重试/状态码/JSON 解析；显式视觉模型判定。
- `backend/app/modules/jd/api.py`：`POST /jds:parse-image`（权限 jd:write，response_model=ProposedJdResponse）。
- `app/shared/errors.py`：最小追加 `MODEL_NO_VISION` 错误码与异常类（共享注册表，只追加）。
- `ui/src/lib/{api,types}.ts`：`parseJdFromImage` 真上传 File/base64，MachineErrorCode 加 MODEL_NO_VISION。
- `ui/src/components/create-jd-modal.tsx` 与其 stories/tests：错误块区分未配置/不支持看图/上游失败/校验失败，给「去设置换模型」；retry 按当前 mode 重跑。
- JD 相关 i18n 键。

## Non-goals

- 不落库、不新增迁移；不改 `ui/prototypes/index.html`（被并行任务 580c3a32 占用，若已改则跳过并在汇报说明）。
- 不碰 `quality-gates/**`、`app-shell.tsx`、`agent-onboarding*`、`run-panel.tsx`、主工作区（另一个 git worktree，具体绝对路径不入库）；不 push；不重启 8000/5173。

## Acceptance Criteria

- [x] `POST /jds:parse-image` 入参 `{imageBase64, contentType?, filename?}`；仅收 png/jpeg/webp，非法/超限 422 且不发起上游调用。
- [x] 模型不支持图像 -> 409 `MODEL_NO_VISION`，文案指向「设置与 Agent → 模型配置」，不回退伪造草案。
- [x] 支持 -> 带 `image_url` data URL 调上游，返回 `inputSource=image` 草案（body 来自模型识别的 JD 正文），schema 校验失败 -> MODEL_OUTPUT_INVALID。
- [x] 未配置/超时/拒绝分别 MODEL_NOT_CONFIGURED / UPSTREAM_TIMEOUT / UPSTREAM_REJECTED，不泄漏 key 与上游原文。
- [x] 后端桩测试覆盖成功/401/不支持图像/畸形/超时/超大；前端覆盖错误正向+不泄漏负向断言。
- [x] 门禁与 `tsc` 通过；真实图片验证结果如实标注（有视觉 key 才叫真机）。

## Implementation

- 后端：`jd/schemas.py` 增 `JdImageParseRequest`（imageBase64/contentType/filename，8MB 业务上限、16MB 硬顶）；`jd/vision.py` 显式视觉模型族判定（保守，未知判否）；`jd/parser.py` 增 `decode_image`（魔数嗅探 png/jpeg/webp、体积校验）与 `parse_jd_image`（OpenAI `content:[{type:text},{type:image_url data URL}]`，复用 `_post_with_retry`/`_response_content`/`_extract_json_object`），`_to_response` 支持 `input_source=image`、body 取模型识别正文；`jd/service.py`+`jd/api.py` 增 `POST /jds:parse-image`（jd:write，不落库）。
- `app/shared/errors.py` 最小追加 `MODEL_NO_VISION`（409）与 `ModelNoVision`。
- 前端：`parseJdFromImage` 改为接收 `{image, contentType, filename}` 并真上传 base64，删除 `heuristicParseJd` 与 `api.jd.note.imageDemo`；`MachineErrorCode` 加 `MODEL_NO_VISION`；`create-jd-modal` 增 `MODEL_NO_VISION`/`VALIDATION_FAILED` 映射、不支持看图时给「去设置换模型」、retry 按当前 mode 重跑、`accept` 收紧到 png/jpeg/webp；stories 增 ImageParsing/ImageDraftResult/ImageModelNotConfigured/ImageModelNoVision。

## Verification

- 后端：`TEST_DATABASE_URL=postgresql+psycopg://localhost:5432/resumate_test_e0457 ./.venv/bin/python -m pytest tests/test_jd_parse_image.py -q` -> 12 passed（MockTransport 成功 + 请求体 data URL、401、超时重试、畸形、空结果、MODEL_NO_VISION 不发上游、未配置、非法 base64、非法类型、超大）；全量 `pytest -q` -> 574 passed。
- 前端：`pnpm -C ui test` -> 606 passed；`pnpm -C ui exec tsc -b --noEmit` 通过；`pnpm -C ui build-storybook` 成功。
- 门禁：`node quality-gates/run.js` 与 `archkit inspect .` 通过。
- 真实图片（无头 Chromium，locale=zh-CN）：`/jds` 新增 JD -> 上传截图 -> 点「AI 识别」-> `POST /jds:parse-image` 409 `{"code":"MODEL_NO_VISION","message":"当前配置的模型不支持图像输入，请到「设置与 Agent → 模型配置」换成支持看图的模型"}`；界面 alert 为「整理失败 / 当前模型不支持看图。请到「设置与 Agent → 模型配置」换成支持图像的模型再试。」且出现「去设置换模型」按钮。证据：`docs/e2e/2026-10-09/areas/jd-image-tuning/01-image-parse.png`、`network-evidence.json`。
- 真机视觉调用：**未验证**。admin 的 deepseek endpoint `/models` 只返回 `deepseek-flash` / `deepseek-v4-pro`；用 `deepseek-v4-flash-vision-exp` 请求时上游静默回落（响应 model=deepseek-flash）。需要用户配置真正支持图像的 provider/model（例如 OpenAI `gpt-4o`、Anthropic `claude-sonnet-*`、智谱 `glm-4.6v`）并配有效 Key；成功路径目前只有桩 provider（MockTransport）证明。

## Related ADRs

- None.
