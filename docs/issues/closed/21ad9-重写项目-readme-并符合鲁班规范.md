---
id: 21ad9
status: closed
created_at: 2026-09-29T04:40:00.000Z
updated_at: 2026-09-29T05:48:33.268Z
priority: high
labels: []
parent: null
blocked_by: []
started_at: 2026-09-29T05:47:38.236Z
closed_at: 2026-09-29T05:48:33.268Z
---

# 重写项目 README 并符合鲁班规范

## Background

仓库根 `README.md` 当前是 33 行的开发说明（启动后端、验证命令、Git hooks），只服务已经知道这个项目的人。仓库已于 2026-09-29 转为公开，并会用于比赛与毕业设计；首屏必须让陌生人在 10 秒内知道这是什么、解决什么问题、怎么跑起来、以及哪些还没做。

鲁班 house-style 是 Skill README 模板，本次取其通用节（引语钩子、人感开场、产物前置、真实数字挂可查证命令、不写大词、成本与前置条件前置、安全边界、文件结构、验证与测试），并写明不适用的节（一行 `npx skills add` 安装、skills.sh 徽章、触发方式）。

## Scope

- 重写仓库根 `README.md`：品牌 hero 与引语钩子、人感开场、产物前置、锚点导航、快速开始（含前置条件）、能力表、对比表、信任边界、仓库结构、验证与测试、已知边界、文档索引、开发约定。
- 保留原 README 的可用信息：后端启动、验证命令、定稿原型与品牌资产入口、用户故事与公共契约入口、Git hooks 说明。

## Non-goals

- 不加 LICENSE（未决定）。
- 不新增 `README.en.md`。
- 不改任何代码、质量门禁或文档事实。
- 不设置 GitHub 仓库描述与 topics（远端变更，需单独授权）。

## Acceptance Criteria

- [x] `README.md` 首屏含引语钩子、一行价值陈述与锚点导航。
- [x] 每个数字（测试数、页面数、端点数）都附可复现命令。
- [x] 不出现无法验证的夸大表述。
- [x] 明确写出未实现项与前置条件。
- [x] README 内所有相对链接存在。
- [x] `archkit inspect .` 通过。

## Implementation

- hero 区：`ui/public/brand/lockup.png` + 引语钩子 + 5 个栈徽章（链接指向 `backend/pyproject.toml` / `ui/package.json` / `docs/design.md`）+ 一行加粗价值陈述 + 锚点导航。
- 新增节：它解决什么问题（人感开场）、效果示例（approval 闭环与 PAT 的真实终端回放）、它能做什么（逐项现状表，含「未实现」一行）、它和同类有什么不同（六个维度对比）、信任边界（五条）、仓库结构、已知边界（六条诚实清单）、文档索引（九行表）。
- 保留并归位：后端启动与验证命令并入「快速开始」与「验证与测试」；定稿原型、品牌资产、用户故事、公共契约、覆盖表并入「文档索引」；Git hooks 保留为「开发约定」。
- 按鲁班「删掉不适用的节，但先想清楚为什么不适用」：未加 LICENSE 徽章（仓库无 LICENSE），未加 `npx skills add` 一行安装与 skills.sh 徽章（那是独立 Skill 仓库的形态，本项目是产品仓库）。

## Verification

- 相对链接：脚本提取 README 全部相对链接并逐个 `Path.exists()` → 16 条，失效 0（`backend/pyproject.toml`、`docs/design.md`、`ui/package.json`、`ui/README.md`、`docs/user-stories/*`、`docs/prd/*`、`docs/agent/agent-operation-api.md`、`agent-core/skills/resumate-api-operations/README.md`、`backend/README.md`、`ui/prototypes/index.html`、`ui/public/brand/README.md`、`quality-gates/README.md`、`docs/issues/`、`AGENTS.md`）。
- 数字口径逐一实跑：`uv run --directory backend pytest` → `157 passed`；`cd agent-core && uv run pytest -q` → `69 passed`；`cd ui && pnpm test` → `Test Files 17 passed / Tests 128 passed`；端点 72、页面组件 18 由 README 内给出的 grep/ls 命令得到。
- 未实现项来源：`ui/README.md` 明确列出仍走 mock 的端点；`GET /mcp` 实测 404。
- `archkit inspect .` → `Quality gates passed.`

## Related ADRs

- None.
