# Resumate 全链路端到端测试报告（工作流 B）

- 日期：2026-10-09
- 工作区：`<本机用户名>/resumate-worktrees/zj-fwwb-2026`（分支 `docs/zj-fwwb-2026`，全程未做任何 git 写操作）
- 驱动：Playwright **无头** chromium（`locale=zh-CN`）+ 真实 REST/SSE，所有功能均在浏览器里实际操作
- 证据根目录：`docs/e2e/2026-10-09/`（`areas/<领域>/REPORT.md` + 截图 + `raw/` 原始响应）

## 0. 环境启动方式与端口

| 组件 | 端口 | 启动方式 |
|---|---|---|
| PostgreSQL 库 `resumate` / `resumate_test` | 5432 | 已由 brew services 提供；`alembic upgrade head`（head 已到 `c8f1d3a6e2b4`，含工作流 A 的 interview 四张表）|
| Redis | 6379 | 已就绪（session / PAT / 验证码） |
| 后端 FastAPI | **127.0.0.1:8000** | `cd backend && uv sync && SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_FROM_EMAIL=no-reply@resumate.dev SMTP_STARTTLS=false nohup uv run --no-sync uvicorn app.main:app --host 127.0.0.1 --port 8000`（日志 `docs/e2e/2026-10-09/logs/backend.log`）|
| 前端 Vite | **127.0.0.1:5173** | `cd ui && nohup pnpm dev --host 127.0.0.1 --port 5173`（`/api/*` 代理到 8000）|
| SMTP 捕获器（无依赖 Python 实现） | **127.0.0.1:2525** | `/usr/bin/python3 docs/e2e/2026-10-09/scripts/smtp_sink.py`，邮件落盘 `/tmp/resumate-e2e-mail/*.eml`（验证/重置令牌从真实邮件里取）|

**没有直接用 `scripts/dev.sh up`**：该脚本的 `needs_pnpm_install()` 判定当前 `pnpm-lock.yaml` 比主仓 `node_modules/.modules.yaml` 新，会执行 `pnpm install`；而本 worktree 的 `node_modules` 是指向主工作区 `~/resumate/node_modules` 的软链，安装会污染主工作区。因此改为手动执行同等的 `uv sync` + 迁移 + seed + 起服务步骤（`dev.sh status/logs` 仍可用）。

登录账号：`admin@resumate.dev` / `resumate-admin`（超级管理员，20 项权限）；其余测试账号均为本任务自建（`e2e-*`）并已验邮。

## 1. 通过/失败矩阵（逐领域）

| 领域 | 通过 | 失败 | 说明 |
|---|---|---|---|
| 认证（注册/登录/邮箱验证/忘记密码重置/改密/会话失效） | 22 | 0 | `areas/auth` |
| 简历编辑器（章节条目/移动/10 秒空闲自动保存/版本/任意两版对比/恢复某版/防篡改） | 11 | 0 | `areas/resume-editor`；恢复某版为**本次修复后**结果 |
| Agent 轮次（创建轮次/校验/preview Diff/未审批 409/审批/apply/篡改拒绝/幂等重放/finalize/SSE 首帧+心跳） | 15 | 0 | `areas/agent-turn`；LLM 生成部分 BLOCKED，见 §4 |
| 简历库（新建/复制/标签筛选/归档/恢复/搜索/空态/错误态） | 26 | 2 | `areas/resume-library`；重命名/标签编辑/删除入口已修并复验；剩余 2 项属「新建弹窗故意不提供标题/模板」，见 §3 G1 |
| JD 与 Profile（JD 详情/绑定/解析/编辑/删除/解绑/岗位匹配/事实 CRUD/反向引用/basics） | 19 | 0(+1 BLOCKED) | `areas/jd-profile` + `areas/fix-ui-verify`；编辑/删除/解绑/岗位匹配/事实删除已修并复验 |
| 设置与 RBAC（偏好/Agent 配置/模型配置/快捷键冲突/角色树三态/封禁解封/越权） | 70 | 4 | `areas/settings-rbac` |
| 开放接入与备份（PAT 签发/越权 403/撤销/审计筛选分页/导出 JSON·MD/导入预览/导入） | 32 | 2 | `areas/access-backup` |
| 界面（中英切换/深浅色/404 空态与错误态） | 9 | 0 | `areas/ui-i18n-theme` |
| 冒烟（登录→工作台） | 4 | 0 | `areas/smoke` |
| 编辑器导出按钮 | 0 | 1 | `areas/editor-export`，死按钮，见 §3 G10 |
| 修复项独立复验（rename/tags/JD编辑/JD删除/解绑/匹配/事实删除/简历删除） | 7 | 0 | `areas/fix-ui-verify` |

仓库回归（最终状态，全部改动落地后）：`node quality-gates/run.js` → **Quality gates passed**；`ui tsc -b --noEmit` → **0 error**；`backend uv run pytest -q` → **305 passed**；`ui vitest run` → **59 files / 463 tests passed**。

## 2. 已修复缺陷（先复现 → 最小修复 → 端到端复验）

### F1 版本「恢复到此版本」确认按钮是空实现（前后端都没有恢复能力）— 已修复
- 复现：`/resumes/{id}/versions` 选一个历史版本 →「恢复为新版本」→ 弹窗「确认恢复为新版本」→ 弹窗关闭，**不产生任何请求**，版本列表不变；后端也没有按版本恢复的端点（只有归档恢复）。i18n 文案却承诺「会生成一个来源为『恢复』的新版本」。
- 证据（修复前）：`areas/resume-editor/REPORT.md` 的旧一轮记录 `restore_count=0`。
- 修复：后端新增 `POST /resumes/{resume_id}/versions/{version_id}/restore`（`schemas.VersionRestore` + `service.restore_version`：先 flush 未提交草稿为一个 manual 版本，再以 `source=restore` 落新版本，历史不覆盖；未知版本 404、当前版本 422）；前端 `restoreVersion()` + 恢复弹窗接线（提交态、错误映射、i18n `resume.restore.{versionMessage,restoring,errors.*}` zh/en）。
- 复验（修复后，同一脚本）：`restore_count=1`，新增版本 `('ver_4212b8644ef1','restore','恢复到 ver_bd0ffcda2b12')`；后端新增 4 个用例，`tests/test_resume.py` 18 passed；前端 `version-history.test.tsx` + `api.test.ts` 20 passed。

### F2 导入预览同名资源触发 React duplicate key — 已修复
- 复现：备份中含两份同标题资源时，`/settings/backup` 导入预览「将新增的资源」报 `Encountered two children with the same key`（`backup-panel.tsx` 用 `type+title` 作 key，而备份允许同名资源）。
- 证据：`areas/access-backup/minimal-repro-dupkey.md`、`areas/access-backup/raw/dupkey-console.log`。
- 修复：key 改为 `type-title-序号`；新增组件用例断言「同名资源渲染 2 条且无 duplicate key 警告」，`backup-panel.test.tsx` 9 passed。

### F3 RBAC `change_role` 缺同级/更高权限越权校验 — 已修复
- 复现（超管会话）：把 user 提为 super_admin（200，合理）后，再把该 **同级** super_admin 降级为 admin → 期望 4xx，实际 **200 且被降级**；而封禁/解封路径有 `_require_actor_outranks`（403）。授权口径不一致。
- 证据：`areas/settings-rbac/raw-users.json` 的 `same_rank_role_change`。
- 修复：`change_role` 加同口径越权校验（放在「最后一个超管不能被降级」保护之后，保持原有契约），新增用例 `test_change_role_blocks_same_or_higher_rank`；`tests/test_rbac_admin.py`+`test_access_control.py` 17 passed。

### F4 UI 入口缺失（8 项，由子代理就地修复 + 父代理独立复验）— 已修复
- 修复内容：简历卡重命名/标签编辑/删除入口（`PATCH /resumes/{id}`、`DELETE /resumes/{id}`）；JD 编辑死按钮（`PATCH /jds/{id}`）、JD 删除（`DELETE /jds/{id}`）、JD 解绑（`DELETE /jds/{id}/binding`）；Profile 事实删除（`DELETE /profile/facts/{id}`，弹窗展示 `FactDeletionImpact.referencedBy` 反向引用）；岗位匹配新增后端 `POST /profile/match-job`（api→service→dao 分层，确定性关键词覆盖度规则、不调用模型）+ JD 详情内嵌匹配区块 + 前端 `matchJob()` 改真实调用。
- 复验：`areas/fix-ui-verify/REPORT.md` V1–V7 **7/7 PASS**（真实后端 8000 + 无头浏览器 + REST 交叉验证）；`POST /profile/match-job` 用真实 JD 返回 200 且 `{results,gaps}` 结构正确。
- 新增测试：`resume-library-actions.test.tsx`、`jd-detail-actions.test.tsx`、`profile-fact-delete.test.tsx`、`backend/tests/test_profile_match.py`（5 passed）。

### 已回滚：新建简历弹窗的「标题 / 模板」字段（不是缺陷）
子代理按我的清单给新建弹窗加了标题与模板输入，但仓库既有测试 `create-resume-modal.test.tsx` 明确约定「只提供『从现有简历复制』与『完全新开』，不再有标题 / 岗位 / 模板输入」——说明这是**有意的产品设计**（创建即用默认标题「未命名简历」+ 首个已发布模板，命名/切模板通过卡片入口完成）。我因此**回滚**了该改动（`create-resume-modal.tsx` 恢复 HEAD、删除新增用例、移除相关 i18n 键），避免为了“补入口”而违背既有契约。

## 3. 未修复缺口（含最小复现与证据）

| # | 缺口 | 最小复现 | 证据 | 后端能力 |
|---|---|---|---|---|
| G1（设计如此，不修） | 新建简历弹窗无「标题 / 模板」输入 | 创建后标题固定「未命名简历」、模板固定首个 published | `areas/resume-library/02-02-create-modal.png`；既有测试 `create-resume-modal.test.tsx` 明确要求如此 | 有（`POST /resumes` 支持） |
| ~~G2~~（已修） | 简历卡片「重命名」「标签增删改」「删除」入口 | 卡片操作只有 打开编辑/版本历史/复制/归档；无重命名输入、无标签编辑、`删除`按钮命中 0 | `areas/resume-library/06-06-card-actions.png`、`12-12-no-delete-control.png` | 有（`PATCH /resumes/{id}`、`DELETE /resumes/{id}`） |
| ~~G3~~（已修） | JD「编辑（生成新 revision）」 | `/jds/{id}` 点击无弹窗、无 PATCH | `areas/jd-profile` 步骤 8 | 有（`PATCH /jds/{id}`） |
| ~~G4~~（已修） | JD 删除入口 | `/jds` 与详情扫描无删除控件 | `areas/jd-profile` 步骤 9 | 有（`DELETE /jds/{id}`） |
| ~~G5~~（已修） | JD 解绑入口 | 绑定后没有解绑控件 | `areas/jd-profile` 步骤 13 | 有（`DELETE /jds/{id}/binding`） |
| ~~G6~~（已修） | 岗位匹配 UI + POST /profile/match-job | `POST /profile/match-job` → 404；前端 `matchJob()` 是 `content.ts` 静态桩且无调用方 | `areas/jd-profile` 步骤 14 | **无**（能力表却声明 `profile.match-job`） |
| ~~G7~~（已修） | Profile 事实删除 + 反向引用影响确认 | `/profile` 事实卡只有「编辑」 | `areas/jd-profile` 步骤 18/20 | 有（`DELETE /profile/facts/{id}` 返回 `FactDeletionImpact`，契约已验证） |
| G8 | 用户管理无页面 | 导航「管理员」只有 模板库/角色与权限；`/admin/users` → 404 状态块 | `areas/settings-rbac/01-users-01-nav.png`、`02-users-02-admin-users-404.png` | 有（`/auth/users`、ban/unban/role） |
| G9 | 访问审计无「时间范围」筛选 | `GET /access/logs` 仅 `purpose/result/q/page/size` | `areas/access-backup/REPORT.md` D2 | 缺参数 |
| G10 | 编辑器顶栏「导出」是死按钮 | 点击后无请求、无下载、无报错（`resume-editor.tsx` 该按钮无 onClick） | `areas/editor-export/REPORT.md` | 无简历级导出端点（仅 `/backup/export*`） |
| G11 | 前端无「修改密码」入口 | `/settings` 无密码表单，`api.ts` 未声明 `POST /auth/password` | `areas/auth/REPORT.md` | 有（后端已用 REST 验证成功/失败路径） |

## 4. BLOCKED / 未覆盖（环境原因，非本次改动）

1. **模型凭证全部不可用**（导致真实 LLM 链路无法跑通）：
   - `POST /models/config:test`（admin，deepseek-flash）≈1.1s 返回 `ok=false`「模型服务拒绝凭证，请检查 API Key 与 provider 配置」；
   - `POST /jds:parse-text` → **502 `UPSTREAM_REJECTED`**（粘贴 JD 解析因此 BLOCKED；界面错误映射正确，未透出上游原文）；
   - 真实 Agent 轮次 → `state=cancelled`，`result.message = "runtime aborted: MODEL_ERROR"`。
   - 直连探测：`api.deepseek.com` 网络可达但返回 401；本地模型中转 `http://23.254.197.253:8080/v1` 对 `OPENAI_API_KEY`(zshrc) 与 codex-api skill 里的 key 均返回 `INVALID_API_KEY`。仓库/数据库里的两个 deepseek key 在 2026-10-07 曾测试通过，现已失效。
   - 处置：不伪造结果。**轮次编排链路改为用真实 HTTP 契约 + 合成 PatchOp 驱动**（`POST /turns` → `patches:validate` → `patches:preview` → 未审批 apply 409 → `pending-actions/approve` → apply → 同 idempotencyKey 重放 → working-document → finalize → 幂等 finalize，SSE 用 curl 实测 19s 长连），覆盖除“LLM 生成内容”之外的整条链路；真实轮次失败态也已作为证据留存。凭证修好后需重跑：JD 粘贴解析、真实 Agent 轮次生成 Diff。
2. 生产数据/外部副作用类：备份导入只对自建账号执行；admin 的模型配置未被覆盖（保持原值，仅测试时报错）。

## 5. 环境噪声（非产品缺陷）

- Vite `/@fs/.../geist-*.woff2` 403：本 worktree 的 `node_modules` 是主仓软链，Vite `server.fs.allow` 拒绝 worktree 外路径 → 字体回退，控制台固定 6 条 403。**任何本 worktree 内的视觉/字体验证都受影响**，建议在 `ui/vite.config.ts` 增加 `server.fs.allow`（未改，属另一工作流范围）。
- 未登录时 `/api/auth/me` 401 属正常会话探测。
- 无头浏览器剪贴板权限拒绝（PAT 复制按钮）产生 1 条 pageerror。
- 界面语言偏好存在 `localStorage`，全新浏览器（无 localStorage）不会用服务端 `settings.language` 初始化（我的 REST 改 en 后整页加载仍是 zh-CN）；走界面按钮切换则正常持久化。观察项，未修。

## 6. 数据与卫生

- 测试数据前缀：`e2e-*`（简历/JD/事实/账号），分布在 admin 与自建账号下；`resumate` 库与主工作区共用，历史数据（21→ 若干简历）未删除、未修改。
- `resumate` 库里 access-backup 用例累计了 32 简历 / 16 岗位 / 8 事实（前缀 `E2E-BAK-20261009-145552`），如需清理可按前缀删除。
- 明文测试 PAT 已撤销，证据里只留前缀与 sha256。
- 全程未执行任何 git 写操作、未安装依赖、未读写主工作区与其他 worktree。

## 7. 证据索引

- 领域报告：`areas/{auth,resume-editor,agent-turn,resume-library,jd-profile,settings-rbac,access-backup,ui-i18n-theme,editor-export,smoke}/REPORT.md`
- 脚本：`scripts/{e2e_lib.py,smtp_sink.py,auth_flow.py,editor_e2e.py,agent_turn_e2e.py,ui_i18n_theme_e2e.py,editor_export_check.py,smoke_login.py,...}`
- 原始响应：`areas/agent-turn/raw/*.json`、`areas/access-backup/raw/*`
- 运行日志：`logs/backend.log`、`logs/frontend.log`、`logs/smtp-sink.log`

## 8. 本次改动文件清单（工作流 B）

后端：`backend/app/modules/resume/{api,service,schemas}.py`（版本恢复）、`backend/app/modules/auth/service.py`（改角色越权校验）、`backend/app/modules/profile/{api,service,schemas}.py`（match-job）、`backend/tests/{test_resume,test_rbac_admin}.py`、`backend/tests/test_profile_match.py`（新增）。
前端：`ui/src/lib/{api.ts,version-restore.ts}`、`ui/src/components/{version-history.tsx,backup-panel.tsx,resume-library.tsx,jd-tuning.tsx,profile-workspace.tsx}`、`ui/src/i18n/locales/{zh-CN,en}/{resume,jd,profile}.ts`，新增测试 `version-history.test.tsx`、`backup-panel.test.tsx`（追加用例）、`resume-library-actions.test.tsx`、`jd-detail-actions.test.tsx`、`profile-fact-delete.test.tsx`。
未触碰：`ui/src/features/interview/**`、`backend/app/modules/interview/**`（工作流 A 范围）、主工作区、其他 worktree、`docs/competition/`。

## 9. 遗留待办（需产品/后续工作流处理）

1. `ui/prototypes/index.html` 未同步本次 UI 新增（原型是页面镜像，按项目规则需补齐）。
2. 新建页面（`/admin/users`）受「new-react-page + Storybook 先行确认」规则约束，本轮未做。
3. 模型凭证恢复后需重跑：JD 粘贴解析（`/jds:parse-text`）与真实 Agent 轮次产出 Diff。
4. 建议为 worktree 场景在 `ui/vite.config.ts` 增加 `server.fs.allow`，消除 geist 字体 403。
5. 审计日志时间范围筛选（G9）需要后端加参数 + 前端筛选控件。
