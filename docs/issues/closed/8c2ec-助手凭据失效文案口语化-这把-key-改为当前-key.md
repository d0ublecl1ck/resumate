---
id: 8c2ec
status: closed
created_at: 2026-10-09T16:34:57.572Z
updated_at: 2026-10-09T16:40:48.318Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:35:10.593Z
closed_at: 2026-10-09T16:40:48.318Z
---

# 助手凭据失效文案口语化：这把 Key 改为当前 Key

## Background

用户对助手「凭据失效」状态的标题文案提出疑问：中文「这把 Key 被模型服务拒绝了」中的「这把」偏口语（「一把钥匙」虽然成立，但界面里读起来像口语/翻译腔）。英文 `The model service rejected this key` 保持不动。

## Scope

- `ui/src/i18n/locales/zh-CN/agentOnboarding.ts`：`state.auth_failed.title` 由「这把 Key 被模型服务拒绝了」改为「当前 Key 被模型服务拒绝了」。
- 同步 `ui/src/components/agent-onboarding.stories.test.tsx` 中引用该文案的断言。
- `ui/prototypes/index.html` 中同文案的静态页同步。

## Non-goals

- 不改 en 文案，不改 `agent_failed` 之外的其他状态文案，不改 `agent-onboarding.tsx` 的判定逻辑。

## Acceptance Criteria

- [x] zh-CN `agentOnboarding.state.auth_failed.title` = 「当前 Key 被模型服务拒绝了」；en 保持 `The model service rejected this key`。
- [x] 引用该文案的测试断言同步更新并通过。
- [x] 两语言键结构逐键一致，en 无汉字。

## Implementation

- `ui/src/i18n/locales/zh-CN/agentOnboarding.ts`：`state.auth_failed.title` 由「这把 Key 被模型服务拒绝了」改为「当前 Key 被模型服务拒绝了」；en 保持 `The model service rejected this key`，未改。
- `ui/src/components/agent-onboarding.stories.test.tsx`：两处断言同步为新文案。
- `ui/prototypes/index.html`：三处静态同文案改为「当前 Key 被模型服务拒绝了」。

## Verification

验证命令与结果：在 `ui` 下运行 `./node_modules/.bin/vitest run src/components/agent-onboarding.stories.test.tsx` 通过，1 个测试文件 9 个用例全绿；`./node_modules/.bin/tsc -b --noEmit` 退出码 0；仓库根 `node quality-gates/run.js` 输出 Quality gates passed.。

文案核验：zh-CN `agentOnboarding.state.auth_failed.title` 为「当前 Key 被模型服务拒绝了」；en 未改动，仍为 `The model service rejected this key`；两语言键结构逐键一致，en 无汉字。

## Related ADRs

- None.
