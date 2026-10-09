# -*- coding: utf-8 -*-
"""汇总各功能 steps-*.json，用 Recorder.write() 生成 REPORT.md。"""
import json, sys, glob
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from settings_rbac_lib import AREA_DIR
from e2e_lib import Recorder

ORDER = ["prefs", "agent", "model", "shortcuts", "rbac", "users"]
LABEL = {"prefs": "设置偏好", "agent": "Agent 配置", "model": "模型配置",
         "shortcuts": "快捷键冲突", "rbac": "RBAC 角色权限", "users": "用户管理"}

rec = Recorder("settings-rbac")
files = {f.split("steps-")[1][:-5]: f for f in glob.glob(str(AREA_DIR / "steps-*.json"))}

matrix_rows = []
total_ok = total_fail = 0
for feat in ORDER:
    path = files.get(feat)
    steps = json.loads(open(path, encoding="utf-8").read()) if path else []
    ok = sum(1 for s in steps if s["ok"])
    fail = len(steps) - ok
    total_ok += ok
    total_fail += fail
    for s in steps:
        rec.step("[%s] %s" % (LABEL[feat], s["title"]), s["expected"], s["actual"], s["ok"], s["evidence"])
    matrix_rows.append("| %s | %d | %d | %d |" % (LABEL[feat], len(steps), ok, fail))

accounts = json.loads((AREA_DIR / "accounts.json").read_text())
extra = []
extra.append("## 环境")
extra.append("- worktree：<本机用户名>/resumate-worktrees/zj-fwwb-2026")
extra.append("- 后端 http://127.0.0.1:8000（uvicorn --reload；测试期间因另一工作流改后端代码短暂重启一次，REST 客户端已加连接重试）")
extra.append("- 前端 http://127.0.0.1:5173（无头 chromium，locale=zh-CN，每个功能独立 context）")
extra.append("- 自建账号（REST /auth/register，token 取自 /tmp/resumate-e2e-mail，验证后登录）：")
extra.append("  - 主账号（偏好/Agent/快捷键/模型保存）：%s" % accounts["main"])
extra.append("  - 被管账号（封禁/解封）：%s" % accounts["good"])
extra.append("  - 二级管理员（越权测试）：%s（由超管提为 admin）" % accounts["admin2"])
extra.append("- admin 只用于模型连通性测试与 RBAC/用户管理；测试后已核对 language=zh-CN、theme=paper、displayName=管理员 未变。")

extra.append("")
extra.append("## 通过/失败矩阵")
extra.append("")
extra.append("| 功能 | 步骤数 | 通过 | 失败 |")
extra.append("|---|---|---|---|")
extra += matrix_rows
extra.append("")
extra.append("合计：%d 通过 / %d 失败" % (total_ok, total_fail))

extra.append("")
extra.append("## 结论")
extra.append("- 通过：设置偏好（主题/语言/自动保存/默认模板，保存+刷新+REST 交叉验证）、Agent 配置（approval/full_access、budget 保存与 422 中文校验文案）、快捷键冲突拦截、模型配置读取/保存、RBAC 全流程（角色树、权限三态半选、增删改、回显一致、系统角色只读）、用户封禁/解封（ACCOUNT_BANNED + 浏览器登录提示 + 解封恢复）、越权保护（封禁同级/更高权限被拒、无 role:assign 被拒、自我保护）。")
extra.append("- 失败/受限：见下「缺陷」。")

extra.append("")
extra.append("## 缺陷")

extra.append("")
extra.append("### D1（UI 缺口）用户管理没有前端入口与页面")
extra.append("- 现象：导航「管理员」分组只有「模板库」「角色与权限」，没有用户管理；直接访问 /admin/users 得到 404 页（「未找到该页面 / 错误码：404」）。后端 /auth/users、/auth/users/{id}/ban|unban|role 均存在且行为正确，但没有任何 UI 可点，用户管理只能靠 REST 完成。")
extra.append("- 最小复现：admin 登录 → 左侧菜单只有模板库/角色与权限 → 地址栏输入 http://127.0.0.1:5173/admin/users → 显示 404。")
extra.append("- 原始证据：areas/settings-rbac/steps-users.json 第 2、3 条；截图 areas/settings-rbac/01-users-01-nav.png、02-users-02-admin-users-404.png。")
extra.append("- 影响：本 worktree 的「用户管理」需求（改角色/封禁/解封）没有可用界面。")

extra.append("")
extra.append("### D2（授权不一致）change_role 缺少同级/更高权限越权校验")
extra.append("- 现象：ban_user/unban_user 走 _require_actor_outranks，会拒绝同级或更高权限（403「不能封禁同级或更高权限的账号」）；change_role 没有该校验，只有「不能改自己」「保留至少一个超管」两条保护。于是 rank 3 的超管可以把另一个 rank 3 的超管降级为 admin，返回 200。")
extra.append("- 最小复现（REST，admin=super_admin 会话）：")
extra.append("  1. POST /auth/users/{B}/role {\"role\":\"super_admin\"} → 200（B 也成 super_admin，两个 rank=3）")
extra.append("  2. POST /auth/users/{B}/role {\"role\":\"admin\"} → 期望被拒，实际 200，B 被降级。")
extra.append("- 原始证据：areas/settings-rbac/raw-users.json 的 admin2_promoted_super、same_rank_role_change；steps-users.json 第 17 条。")
extra.append("- 说明：任务要求「不能封禁/改同级或更高权限账号」，封禁路径已实现，改角色路径缺失，与同一权限族的封禁保护不一致。")

extra.append("")
extra.append("### D3（BLOCKED，环境/凭证）admin 的 deepseek-flash 连通性测试返回 HTTP 401")
extra.append("- 现象：admin 已配置 provider=deepseek / model=deepseek-flash / endpoint=https://api.deepseek.com/v1 / keyConfigured=true，点击「测试连接」约 1.1s 后返回 ok=false，界面与 REST 均为「模型服务拒绝凭证，请检查 API Key 与 provider 配置」。")
extra.append("- 判定：这是后端探测到的真实上游结果（401）。后端按契约不回显上游原文、也不泄露密钥，所以只有这句通用文案；该 key 在 2026-10-07 曾通过（lastTest ok=true），现被上游拒绝，记为 BLOCKED 而非界面缺陷。")
extra.append("- 原始证据：areas/settings-rbac/raw-model.json 的 admin_test；steps-model.json 第 4 条；截图 areas/settings-rbac/03-model-03-admin-test.png。")
extra.append("- 主账号无 Key 测试同样返回「模型服务拒绝凭证...」，失败路径文案正常且不含密钥（raw-model.json 的 main_test_nokey）。")

extra.append("")
extra.append("## 观察项（非阻断）")
extra.append("- 快捷键冲突提示把内部动作键直接拼进中文句子：「按键 ⌘ S 已绑定给『save_flush』，请先解除冲突」。同界面动作名走 i18n 显示为「保存并提交」，建议后端错误也映射为动作显示名。证据：steps-shortcuts.json 第 2 条。")
extra.append("- 共享脚手架 docs/e2e/2026-10-09/scripts/e2e_lib.py 的 api_login() 走 POST /login，但后端真实前缀是 /auth/login（实测 POST /login → 404）。本 area 未改该共享文件，自建 settings_rbac_lib.login_cookie() 走 /auth/login 完成登录。")

extra.append("")
extra.append("## 原始证据索引")
for name in ["raw-setup.json", "accounts.json", "raw-prefs.json", "raw-agent.json", "raw-model.json",
             "raw-shortcuts.json", "raw-rbac.json", "raw-users.json",
             "steps-prefs.json", "steps-agent.json", "steps-model.json", "steps-shortcuts.json",
             "steps-rbac.json", "steps-users.json"]:
    extra.append("- areas/settings-rbac/" + name)

out = rec.write(extra=chr(10).join(extra))
print("REPORT ->", out)
print("MATRIX total ok=%d fail=%d" % (total_ok, total_fail))
