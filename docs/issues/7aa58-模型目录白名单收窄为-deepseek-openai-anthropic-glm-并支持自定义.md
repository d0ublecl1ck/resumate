---
id: 7aa58
status: in-progress
created_at: 2026-10-03T06:25:35.692Z
updated_at: 2026-10-03T06:26:05.822Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 设置与模型配置
started_at: 2026-10-03T06:26:05.822Z
---

# 模型目录白名单收窄为 DeepSeek/OpenAI/Anthropic/GLM 并支持自定义

## Background

设置页的 Provider 下拉当前由 `GET /models/catalog` 驱动，而该端点直接暴露已提交的 models.dev 快照：223 家 provider、2MB JSON（`backend/app/modules/settings/data/model_catalog.json`）。用户面对的是一个几乎不可用的长列表，且绝大多数条目与产品无关。

用户决定：仅开放 DeepSeek、OpenAI、Anthropic 与 GLM（智谱的两家 provider 各自作为一项），其余一律收进「自定义」——想接自建网关、中转站或冷门厂商时，由用户自己填 provider / model / endpoint。

## Scope

- 在目录读取层（`backend/app/modules/settings/catalog.py`）加白名单：`deepseek`、`openai`、`anthropic`、`zhipuai`、`zhipuai-coding-plan`，`list_catalog` 只返回白名单内的 provider 及其模型；`provider` 与 `query` 过滤组合行为保持不变。
- 前端设置页模型分区新增平行选项「自定义」：选中后 provider 与 model 均可自由填写，endpoint 与 API Key 仍按现有输入。
- 新增/修改文案全部走 i18n，zh-CN 与 en 键结构一致。
- 后端补单测覆盖白名单与过滤组合；前端在 Storybook 中先行验证交互，经用户确认后再落真实页面。

## Non-goals

- 不改 `model_catalog.json` 快照本身，也不改 `scripts/refresh_model_catalog.py`（白名单在读取层，刷新后仍回到同一收窄结果）。
- 不新增后端对 provider / model 的白名单校验：`PUT /models/config` 继续接受自定义值。
- 不合并 `zhipuai` 与 `zhipuai-coding-plan`（用户明确要两家各自一项）。
- 不动 Agent 运行体、审批闭环与 `/agent/runtime` 就绪语义。

## Acceptance Criteria

- [x] `GET /models/catalog` 只返回 `deepseek`、`openai`、`anthropic`、`zhipuai`、`zhipuai-coding-plan` 五家，且各自模型列表与快照一致。
- [x] `list_catalog(provider="openai")` 仍只返回 openai；`list_catalog(provider="alibaba")`（白名单外）返回空；`query` 过滤只在白名单内匹配。
- [x] 白名单常量为模块级唯一事实源，新增/删除 provider 只改一处。
- [x] 设置页 Provider 下拉出现「自定义」选项，选中后 provider 与 model 可自由输入，endpoint / API Key 行为不变。
- [x] 新增文案在 zh-CN 与 en 双侧齐全，`ui-i18n` 门禁通过。
- [x] `uv run pytest`（相关用例）与 `pnpm -C ui test` 通过，`archkit inspect .` 通过。

## Implementation

- `backend/app/modules/settings/catalog.py`：新增模块级 `ALLOWED_PROVIDER_IDS = (deepseek, openai, anthropic, zhipuai, zhipuai-coding-plan)`，`list_catalog` 只遍历白名单并按该顺序输出，白名单外的 `provider` 查询返回空；快照文件与刷新脚本未改。
- `backend/tests/test_model_catalog.py`：新增 5 个用例（白名单成员与顺序、两家 GLM 保持独立、query 只在白名单内匹配、白名单外 provider 返回空、快照仍保留完整 models.dev 树）。
- `backend/tests/test_settings.py`：`/models/catalog` 端点断言由「模型总数 > 100」改为「provider 列表等于白名单 + 模型总数 > 50」。
- `ui/src/components/settings-form.tsx`：Provider 下拉新增平行选项「自定义」；`customProvider` 由「已保存 provider 不在目录」派生，为真时 Provider 与 Model 改用文本输入（`aria-label` 保持原字段名），endpoint / API Key 分支不变；哨兵值 `__custom__` 只存在于下拉，选中时清空 provider 让用户重填。
- `ui/src/i18n/locales/{zh-CN,en}/settings.ts`：新增 `settings.model.providerCustom`、`settings.model.providerCustomPlaceholder`；`settings.model.hint` 补「目录外走自定义」口径。
- `ui/src/components/settings-form.stories.tsx`：`ProviderNotInCatalog` 语义改为自定义态并补注释。
- `ui/src/components/settings-form.stories.test.tsx`：该 story 断言改为「Provider / Model 均为文本框且带已保存值」。
- `ui/src/lib/content.ts`：mock 目录对齐为白名单五家（顺序与后端一致）。
- `ui/prototypes/index.html`：登记模型目录收窄态与「自定义」平行选项。

## Verification

```console
$ uv run pytest -q
233 passed, 4 warnings in 9.66s

$ pnpm -C ui test
Test Files  30 passed (30)
     Tests  232 passed (232)

$ pnpm -C ui exec tsc --noEmit
（无输出）

$ archkit inspect .
Quality gates passed.
```

Storybook 确认件（MSW 驱动，静态构建实测 200）：`http://127.0.0.1:6007/?path=/story/components-settingsform--provider-not-in-catalog`；九条 story 覆盖默认 / 加载 / 错误 / 模型不在目录 / provider 不在目录（自定义态）/ 未选择 / 测试中 / 成功 / 失败。真实页面（`http://localhost:5173` 设置 → 模型配置）的 Provider 下拉在合并后只剩五家 + 「自定义」。

## Related ADRs

- None.
