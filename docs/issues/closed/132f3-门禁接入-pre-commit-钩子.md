---
id: 132f3
status: closed
created_at: 2026-10-06T12:32:54.068Z
updated_at: 2026-10-06T12:34:02.480Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-06T12:33:06.266Z
closed_at: 2026-10-06T12:34:02.480Z
---

# 门禁接入 pre-commit 钩子

## Background

`quality-gates/gates/` 现有 4 个门禁（`generic-project`、`ui-i18n`、`ui-form-contract`、`repo-privacy`），但没有任何自动触发点：`.githooks/pre-commit` 只清理空目录的 `.gitkeep`，`git commit` 完全不会跑门禁，唯一执行点是手动 `archkit inspect .`。结果是门禁靠自觉，漏跑一次就等于没有。

## Scope

- 在 `.githooks/pre-commit` 追加门禁执行块（沿用 quality-gates skill 的 `# >>> quality-gates >>>` / `# <<< quality-gates <<<` marker 写法，便于将来被 skill 安装器识别为已安装）。
- 执行 `node quality-gates/run.js`（仓库自带 runner，与 archkit 加载 `quality-gates/gates/*.js` 同源同语义，不依赖 archkit）。
- 项目 `AGENTS.md` 的「质量门禁」段补钩子行为；`docs/design.md` 与 `.freak` 登记触发点变化。

## Non-goals

- 不动 `.gitkeep` 现有逻辑。
- 不加 CI、不改 archkit 行为、不改任何 gate 判定。
- 不用 `archkit inspect .` 作为钩子入口（它会额外要求 `.gate-version` 与本地 gate 副本同步，会把「archkit 升级后未 `--sync`」变成提交阻塞，与本次目标无关）。

## Acceptance Criteria

- [x] 提交违规内容（跟踪文件里出现个人邮箱/家目录路径）时 `git commit` 被拦截、提交不产生，报错指向具体文件:行号。
- [x] 修掉违规后 `git commit` 正常通过，钩子输出显示门禁通过。
- [x] 钩子在无违规时对提交耗时的增加不超过 1 秒（实测 0.30s）。
- [x] `git commit --no-verify` 仍可绕过（钩子不阻碍紧急提交）。

## Implementation

- `.githooks/pre-commit` 末尾追加一块，沿用 quality-gates skill 的 marker 约定（`# >>> quality-gates >>>` / `# <<< quality-gates <<<`），将来用 skill 的 `install.mjs` 再装一次会被识别为已安装、不会重复注入：
  - 先检查 `node` 是否存在，缺失时给出明确提示并非零退出；
  - 执行 `node "$(git rev-parse --show-toplevel)/quality-gates/run.js"`（仓库自带 runner，加载同一批 `quality-gates/gates/*.js`）；
  - 失败时打印「已拦截本次提交；确需绕过用 `--no-verify`」并以 1 退出。
- 选择仓库自带 runner 而不是 `archkit inspect .`：后者会先校验 `.gate-version` 与本地 gate 副本同步，会把「archkit 升级后未 `--sync`」变成提交阻塞，与门禁本身要拦的内容无关。
- 钩子不依赖安装步骤：`quality-gates/node_modules` 不存在时 `node quality-gates/run.js` 仍能跑通（gate 实现自带依赖）。
- 项目 `AGENTS.md`「质量门禁」段补两条规则（提交必须走钩子、禁止用豁免标记掩盖真实违规）；`docs/design.md` 记钩子与 `archkit inspect` 的关系；`README.md` 验证段标注钩子也会跑同一批门禁；`.freak` 记录触发点与仍然缺失的 CI。

## Verification

```
$ printf '邮箱：<personal>@gmail.com\n' > .hook-fixture.md && git add .hook-fixture.md
$ git commit -m "test: 应当被门禁拦截"
Quality gates failed:
- [repo-privacy] .hook-fixture.md:1 含个人邮箱地址 <personal>@gmail.com；公开仓库不得写入，改用 <接收方邮箱> 这类占位符，或项目自己的域名邮箱；确属规则说明可加 privacy-allow 标记。
pre-commit: 项目门禁未通过，已拦截本次提交（修完再提交；确需绕过用 --no-verify）。
commit exit=1
HEAD 是否未变: 是

$ git hook run pre-commit          # 无违规时的钩子耗时
real    0m0.303s

$ git commit --no-verify -m "test: 绕过门禁（随后回滚）"
[main <sha>] test: 绕过门禁（随后回滚）      # 确认 --no-verify 仍可绕过，随后 git reset --mixed HEAD~1 回滚
HEAD=d325676 文件数=536
```

证据摘要：违规提交被拦且 HEAD 未前进；`--no-verify` 能绕过（测试提交已 `git reset --mixed HEAD~1` 回滚，工作区无残留）；钩子无违规耗时 0.303s；本工单自身的提交即由该钩子校验通过。

## Related ADRs

- None.
