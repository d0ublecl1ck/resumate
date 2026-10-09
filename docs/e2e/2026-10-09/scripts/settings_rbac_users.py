# -*- coding: utf-8 -*-
"""功能 6：用户管理 —— 改角色 / 封禁 / 解封 / 越权保护（UI 缺失，UI 证据 + REST 行为）。"""
import json, sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from settings_rbac_lib import AREA_DIR, api, dump, login_cookie, StepLog, ui_login, WEB
from e2e_lib import Recorder, browser_page

accounts = json.loads((AREA_DIR / "accounts.json").read_text())
GOOD, ADMIN2 = accounts["good"], accounts["admin2"]
PWD = accounts["password"]
GOOD_ID, ADMIN2_ID = accounts["ids"]["good"], accounts["ids"]["admin2"]
log = StepLog("users")
shotter = Recorder("settings-rbac")
raw = {}

root_cookie, root_me, _ = login_cookie("admin@resumate.dev", "resumate-admin")
admin2_cookie, admin2_me, admin2_st = login_cookie(ADMIN2, PWD)
raw["admin2_me"] = admin2_me
log.add("准备：admin2 已为 admin 角色并登录", "role=admin",
        "status=%s role=%s" % (admin2_st, admin2_me.get("role") if isinstance(admin2_me, dict) else admin2_me),
        admin2_st == 200 and admin2_me.get("role") == "admin")

# ============ A. UI 是否存在用户管理入口 ============
with browser_page() as page:
    ok, err = ui_login(page, "admin@resumate.dev", "resumate-admin")
    nav = page.locator('nav[aria-label="主导航"]')
    nav.wait_for(timeout=20000)
    page.wait_for_timeout(800)
    nav_text = nav.inner_text()
    user_links = page.locator('nav[aria-label="主导航"] a[href*="users"]').count()
    shot_nav = shotter.shot(page, "users-01-nav")
    has_user_entry = any(k in nav_text for k in ("用户管理", "用户列表", "成员管理")) or user_links > 0
    log.add("导航中查找用户管理入口", "存在用户管理入口（本 worktree 未实现，属 UI 缺口）",
            "has_user_entry=%s links_with_users=%s nav=%r" % (has_user_entry, user_links, nav_text.replace("\n", " / ")),
            has_user_entry, shot_nav)

    page.goto(WEB + "/admin/users", wait_until="networkidle", timeout=45000)
    page.wait_for_timeout(1200)
    body_text = page.locator("body").inner_text()
    not_found = ("不存在" in body_text) or ("404" in body_text) or ("Not Found" in body_text)
    shot_404 = shotter.shot(page, "users-02-admin-users-404")
    log.add("访问 /admin/users", "存在用户管理页面",
            "页面文案=%r" % body_text[:160].replace("\n", " / "),
            not not_found, shot_404)

# ============ B. 改角色（super_admin） ============
s, b = api("POST", f"/auth/users/{GOOD_ID}/role", cookie=root_cookie, body={"role": "admin"})
raw["good_to_admin"] = {"status": s, "body": b}
log.add("超管把自建用户角色改为 admin", "200 且 roles=[admin]",
        "status=%s body=%s" % (s, json.dumps(b, ensure_ascii=False)),
        s == 200 and isinstance(b, dict) and b.get("role") == "admin")
s, b = api("POST", f"/auth/users/{GOOD_ID}/role", cookie=root_cookie, body={"role": "user"})
raw["good_to_user"] = {"status": s, "body": b}
log.add("超管把自建用户角色改回 user", "200 且 roles=[user]",
        "status=%s body=%s" % (s, json.dumps(b, ensure_ascii=False)),
        s == 200 and isinstance(b, dict) and b.get("role") == "user")

# ============ C. 越权保护（admin2 = admin 角色） ============
s, b = api("POST", f"/auth/users/user_admin/ban", cookie=admin2_cookie, body={"reason": "越权测试"})
raw["admin2_ban_superadmin"] = {"status": s, "body": b}
log.add("admin 封禁超管（更高权限）", "403 FORBIDDEN 且提示不能封禁同级或更高权限",
        "status=%s body=%s" % (s, json.dumps(b, ensure_ascii=False)),
        s == 403 and "同级或更高权限" in json.dumps(b, ensure_ascii=False))

# 把 good 临时提为 admin，制造同级
api("POST", f"/auth/users/{GOOD_ID}/role", cookie=root_cookie, body={"role": "admin"})
s, b = api("POST", f"/auth/users/{GOOD_ID}/ban", cookie=admin2_cookie, body={"reason": "同级测试"})
raw["admin2_ban_peer_admin"] = {"status": s, "body": b}
log.add("admin 封禁同级 admin", "403 FORBIDDEN 且提示不能封禁同级或更高权限",
        "status=%s body=%s" % (s, json.dumps(b, ensure_ascii=False)),
        s == 403 and "同级或更高权限" in json.dumps(b, ensure_ascii=False))
api("POST", f"/auth/users/{GOOD_ID}/role", cookie=root_cookie, body={"role": "user"})

s, b = api("POST", f"/auth/users/{GOOD_ID}/role", cookie=admin2_cookie, body={"role": "admin"})
raw["admin2_change_role_denied"] = {"status": s, "body": b}
log.add("admin 尝试改用户角色（无 role:assign）", "403 且提示没有该操作权限",
        "status=%s body=%s" % (s, json.dumps(b, ensure_ascii=False)),
        s == 403 and "没有该操作权限" in json.dumps(b, ensure_ascii=False))

# ============ D. 封禁 / 解封流程 ============
good_cookie_before, _, _ = login_cookie(GOOD, PWD)
s, b = api("POST", f"/auth/users/{GOOD_ID}/ban", cookie=root_cookie, body={"reason": "E2E 封禁测试"})
raw["ban_good"] = {"status": s, "body": b}
log.add("超管封禁自建用户", "200 且 isBanned=true",
        "status=%s isBanned=%s" % (s, b.get("isBanned") if isinstance(b, dict) else b),
        s == 200 and isinstance(b, dict) and b.get("isBanned") is True)

s_me, b_me = api("GET", "/auth/me", cookie=good_cookie_before)
raw["banned_old_session"] = {"status": s_me, "body": b_me}
log.add("封禁后旧会话立即失效", "401 UNAUTHENTICATED",
        "status=%s body=%s" % (s_me, json.dumps(b_me, ensure_ascii=False)), s_me == 401)

s_login, b_login = api("POST", "/auth/login", body={"email": GOOD, "password": PWD})
raw["banned_login"] = {"status": s_login, "body": b_login}
log.add("被封禁用户 REST 登录被拒", "403 ACCOUNT_BANNED",
        "status=%s body=%s" % (s_login, json.dumps(b_login, ensure_ascii=False)),
        s_login == 403 and isinstance(b_login, dict) and b_login.get("code") == "ACCOUNT_BANNED")

with browser_page() as page:
    ok, err = ui_login(page, GOOD, PWD)
    shot = shotter.shot(page, "users-03-banned-login")
    log.add("被封禁用户浏览器登录", "停留登录页并显示「账号已被封禁，请联系管理员。」",
            "ok=%s error=%r" % (ok, err), (not ok) and "账号已被封禁" in err, shot)

s, b = api("POST", f"/auth/users/{GOOD_ID}/unban", cookie=root_cookie)
raw["unban_good"] = {"status": s, "body": b}
log.add("超管解封自建用户", "200 且 isBanned=false",
        "status=%s isBanned=%s" % (s, b.get("isBanned") if isinstance(b, dict) else b),
        s == 200 and isinstance(b, dict) and b.get("isBanned") is False)

with browser_page() as page:
    ok, err = ui_login(page, GOOD, PWD)
    shot = shotter.shot(page, "users-04-unbanned-login")
    log.add("解封后浏览器可登录", "进入工作台", "ok=%s err=%r url=%s" % (ok, err, page.url), ok, shot)

# ============ E. 自我保护 ============
s, b = api("POST", "/auth/users/user_admin/ban", cookie=root_cookie, body={})
raw["self_ban"] = {"status": s, "body": b}
log.add("超管封禁自己", "422 且提示不能封禁自己",
        "status=%s body=%s" % (s, json.dumps(b, ensure_ascii=False)),
        s == 422 and "不能封禁自己的账号" in json.dumps(b, ensure_ascii=False))

s, b = api("POST", "/auth/users/user_admin/role", cookie=root_cookie, body={"role": "user"})
raw["self_role"] = {"status": s, "body": b}
log.add("超管修改自己的角色", "422 且提示不能修改自己的角色",
        "status=%s body=%s" % (s, json.dumps(b, ensure_ascii=False)),
        s == 422 and "不能修改自己的角色" in json.dumps(b, ensure_ascii=False))

# ============ F. 同级角色修改行为（观察项） ============
s, b = api("POST", f"/auth/users/{ADMIN2_ID}/role", cookie=root_cookie, body={"role": "super_admin"})
promoted_super = s == 200 and isinstance(b, dict) and b.get("role") == "super_admin"
raw["admin2_promoted_super"] = {"status": s, "body": b}
s2, b2 = api("POST", f"/auth/users/{ADMIN2_ID}/role", cookie=root_cookie, body={"role": "admin"})
raw["same_rank_role_change"] = {"status": s2, "body": b2}
log.add("同级（super_admin→super_admin 操作者）改角色为 admin · 观察项",
        "期望被越权保护拒绝（不能改同级或更高）",
        "promote=%s change_status=%s body=%s（后端 change_role 无同级越权检查）" % (
            promoted_super, s2, json.dumps(b2, ensure_ascii=False)),
        not (s2 == 200), "areas/settings-rbac/raw-users.json")

# 确认还原
_, roles_final = api("GET", "/auth/roles", cookie=root_cookie)
_, me_good = api("GET", f"/auth/users", cookie=root_cookie)
good_final = next((u for u in me_good if u["id"] == GOOD_ID), None) if isinstance(me_good, list) else None
admin2_final = next((u for u in me_good if u["id"] == ADMIN2_ID), None) if isinstance(me_good, list) else None
raw["final_good"] = good_final
raw["final_admin2"] = admin2_final
log.add("收尾状态还原", "good=user 未封禁；admin2=admin",
        "good=%s admin2=%s" % (json.dumps(good_final, ensure_ascii=False), json.dumps(admin2_final, ensure_ascii=False)),
        good_final and good_final["role"] == "user" and not good_final["isBanned"]
        and admin2_final and admin2_final["role"] == "admin")

dump(str(AREA_DIR / "raw-users.json"), raw)
log.save()
print("USERS DONE ok=%d fail=%d" % (sum(1 for s in log.steps if s["ok"]), sum(1 for s in log.steps if not s["ok"])))
