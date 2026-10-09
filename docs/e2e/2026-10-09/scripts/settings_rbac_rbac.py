# -*- coding: utf-8 -*-
"""功能 5：RBAC /admin/rbac —— 角色树、权限三态、增删改与回显。"""
import json, sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from settings_rbac_lib import (AREA_DIR, api, dump, group_state, leaf_state, login_cookie,
                               read_perm_tree, StepLog, toggle_perm, ui_login, WEB)
from e2e_lib import Recorder, browser_page

accounts = json.loads((AREA_DIR / "accounts.json").read_text())
ROLE_CODE = "e2e_rbac_%s" % accounts["ts"]
ROLE_NAME = "E2E 权限测试角色"
ROLE_NAME_2 = "E2E 权限测试角色-改"
log = StepLog("rbac")
shotter = Recorder("settings-rbac")
raw = {}
cookie, me, st = login_cookie("admin@resumate.dev", "resumate-admin")
log.add("admin(REST) 登录", "200 且 role=super_admin", "status=%s role=%s" % (st, me.get("role")), st == 200 and me.get("role") == "super_admin")

ROLE_TREE_CLICK_JS = """(name) => {
  const list = document.querySelector('ul[aria-label="角色树"]');
  if (!list) return false;
  const li = [...list.querySelectorAll('li')].find((x) => {
    const s = x.querySelector('span.truncate');
    return s && s.textContent === name;
  });
  if (!li) return false;
  li.click();
  return true;
}"""

s_p, perms = api("GET", "/auth/permissions", cookie=cookie)
raw["permissions"] = perms
groups = sorted({p["group"] for p in perms})
log.add("REST 读取权限目录", "权限目录非空且分组固定",
        "共 %d 条权限，分组=%s" % (len(perms), groups), len(perms) == 20)

def find_role(role_id):
    _, roles = api("GET", "/auth/roles", cookie=cookie)
    return next((r for r in roles if r["id"] == role_id), None)

with browser_page() as page:
    ok, err = ui_login(page, "admin@resumate.dev", "resumate-admin")
    page.goto(WEB + "/admin/rbac", wait_until="networkidle", timeout=45000)
    page.get_by_text("角色与权限", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1800)
    shot = shotter.shot(page, "rbac-01-loaded")
    role_tree_text = page.locator('ul[aria-label="角色树"]').inner_text()
    perm_tree_rows = read_perm_tree(page)
    log.add("RBAC 页面加载", "角色树含系统内置/自定义分组，权限树渲染",
            "role_tree_has_system=%s role_tree_has_custom=%s perm_rows=%s" % (
                "系统内置" in role_tree_text, "自定义" in role_tree_text,
                None if perm_tree_rows is None else len(perm_tree_rows)),
            "系统内置" in role_tree_text and "自定义" in role_tree_text and perm_tree_rows is not None)

    sys_roles = ["超级管理员", "管理员", "普通用户"]
    visible = {r: (r in role_tree_text) for r in sys_roles}
    log.add("系统内置角色渲染", "超级管理员/管理员/普通用户 均在树中",
            json.dumps(visible, ensure_ascii=False), all(visible.values()), shot)

    # --- 新建角色 ---
    page.get_by_role("button", name="新建角色").click()
    page.wait_for_timeout(800)
    page.locator('label:has(span:text-is("编码")) input').fill(ROLE_CODE)
    page.locator('label:has(span:text-is("名称")) input').fill(ROLE_NAME)
    page.locator('label:has(span:text-is("描述")) input').fill("E2E 自动化创建的临时角色")
    page.wait_for_timeout(500)
    rows0 = read_perm_tree(page)
    groups_all_unchecked = all(not r["checked"] and not r["indeterminate"] for r in rows0 if r["isFolder"])
    log.add("新建角色 · 权限树初始态", "所有分组未选中（无半选）",
            "分组状态=%s" % json.dumps([(r["label"], r["checked"], r["indeterminate"]) for r in rows0 if r["isFolder"]], ensure_ascii=False),
            groups_all_unchecked)

    toggle_perm(page, "resume:read")
    rows1 = read_perm_tree(page)
    g1 = group_state(rows1, "简历")
    log.add("勾选 resume:read · 三态-半选", "「简历」分组 indeterminate=true",
            "简历=%s resume:read=%s" % (json.dumps(g1, ensure_ascii=False), json.dumps(leaf_state(rows1, "resume:read"), ensure_ascii=False)),
            g1["indeterminate"] is True and g1["checked"] is False)

    toggle_perm(page, "resume:write")
    rows2 = read_perm_tree(page)
    g2 = group_state(rows2, "简历")
    log.add("再勾选 resume:write · 三态-全选", "「简历」分组 checked=true 且非半选",
            json.dumps(g2, ensure_ascii=False), g2["checked"] is True and g2["indeterminate"] is False)

    toggle_perm(page, "resume:read")
    rows3 = read_perm_tree(page)
    g3 = group_state(rows3, "简历")
    log.add("取消 resume:read · 回到半选", "「简历」分组 indeterminate=true",
            json.dumps(g3, ensure_ascii=False), g3["indeterminate"] is True and g3["checked"] is False)

    toggle_perm(page, "resume:read")
    toggle_perm(page, "jd:read")
    rows4 = read_perm_tree(page)
    g4r = group_state(rows4, "简历")
    g4j = group_state(rows4, "岗位")
    g4a = group_state(rows4, "账号")
    shot = shotter.shot(page, "rbac-02-tri-state")
    log.add("勾选 resume:read/write + jd:read · 三态组合", "简历已全选、岗位半选、账号未选",
            "简历=%s 岗位=%s 账号=%s" % (json.dumps(g4r, ensure_ascii=False), json.dumps(g4j, ensure_ascii=False), json.dumps(g4a, ensure_ascii=False)),
            g4r["checked"] and g4j["indeterminate"] and not g4a["checked"] and not g4a["indeterminate"], shot)

    page.get_by_role("button", name="创建", exact=True).click()
    page.wait_for_timeout(2000)
    _, roles_after_create = api("GET", "/auth/roles", cookie=cookie)
    raw["roles_after_create"] = roles_after_create
    created = next((r for r in roles_after_create if r["code"] == ROLE_CODE), None)
    shot = shotter.shot(page, "rbac-03-created")
    expected_perms = ["resume:read", "resume:write", "jd:read"]
    log.add("创建自定义角色", "REST 中角色存在且权限=%s" % expected_perms,
            "created=%s" % json.dumps(created, ensure_ascii=False),
            created is not None and sorted(created["permissions"]) == sorted(expected_perms), shot)

    # --- 刷新 + 重新选中，验证回显一致 ---
    page.reload(wait_until="networkidle")
    page.get_by_text("角色与权限", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1800)
    clicked = page.evaluate(ROLE_TREE_CLICK_JS, ROLE_NAME)
    page.wait_for_timeout(1200)
    rows5 = read_perm_tree(page)
    r5 = {r["code"]: r for r in rows5 if r["code"]}
    g5r = group_state(rows5, "简历")
    g5j = group_state(rows5, "岗位")
    detail_text = page.locator('section:has-text("权限")').last.inner_text()
    shot = shotter.shot(page, "rbac-04-reload-echo")
    ok = (clicked and r5.get("resume:read", {}).get("checked") and r5.get("resume:write", {}).get("checked")
          and r5.get("jd:read", {}).get("checked")
          and not r5.get("resume:write", {}).get("indeterminate")
          and g5r["checked"] and g5j["indeterminate"] and not r5.get("account:read", {}).get("checked"))
    log.add("刷新后重新选中角色 · 权限回显一致", "resume:read/write、jd:read 勾选；简历全选/岗位半选",
            "clicked=%s resume:read=%s resume:write=%s jd:read=%s 简历=%s 岗位=%s account:read=%s" % (
                clicked, r5.get("resume:read", {}).get("checked"), r5.get("resume:write", {}).get("checked"),
                r5.get("jd:read", {}).get("checked"), json.dumps(g5r, ensure_ascii=False),
                json.dumps(g5j, ensure_ascii=False), r5.get("account:read", {}).get("checked")), ok, shot)
    log.add("角色详情显示权限计数", "显示「3 项权限」", "detail contains 3 项权限=%s" % ("3 项权限" in detail_text),
            "3 项权限" in detail_text)

    # --- 修改角色：名称 + 权限 ---
    page.locator('label:has(span:text-is("名称")) input').fill(ROLE_NAME_2)
    toggle_perm(page, "resume:write")
    toggle_perm(page, "account:read")
    page.wait_for_timeout(500)
    shot = shotter.shot(page, "rbac-05-edited")
    page.get_by_role("button", name="保存", exact=True).click()
    page.wait_for_timeout(1800)
    updated = find_role(created["id"])
    raw["role_after_update"] = updated
    expected2 = ["resume:read", "jd:read", "account:read"]
    shot2 = shotter.shot(page, "rbac-06-updated")
    log.add("修改角色名称与权限", "REST 权限=%s 且名称=%s" % (expected2, ROLE_NAME_2),
            json.dumps(updated, ensure_ascii=False),
            updated is not None and sorted(updated["permissions"]) == sorted(expected2) and updated["name"] == ROLE_NAME_2, shot2)

    page.reload(wait_until="networkidle")
    page.get_by_text("角色与权限", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1800)
    page.evaluate(ROLE_TREE_CLICK_JS, ROLE_NAME_2)
    page.wait_for_timeout(1200)
    rows6 = read_perm_tree(page)
    r6 = {r["code"]: r for r in rows6 if r["code"]}
    g6a = group_state(rows6, "账号")
    g6r = group_state(rows6, "简历")
    shot = shotter.shot(page, "rbac-07-updated-echo")
    ok = (r6.get("resume:read", {}).get("checked") and not r6.get("resume:write", {}).get("checked")
          and r6.get("jd:read", {}).get("checked") and r6.get("account:read", {}).get("checked")
          and g6a["indeterminate"] and g6r["indeterminate"])
    log.add("修改后刷新回显一致", "resume:read、jd:read、account:read 勾选；简历/账号半选",
            "resume:read=%s resume:write=%s jd:read=%s account:read=%s 账号=%s 简历=%s" % (
                r6.get("resume:read", {}).get("checked"), r6.get("resume:write", {}).get("checked"),
                r6.get("jd:read", {}).get("checked"), r6.get("account:read", {}).get("checked"),
                json.dumps(g6a, ensure_ascii=False), json.dumps(g6r, ensure_ascii=False)), ok, shot)

    # --- 删除角色 ---
    page.get_by_role("button", name="删除", exact=True).click()
    page.wait_for_timeout(2000)
    _, roles_after_delete = api("GET", "/auth/roles", cookie=cookie)
    raw["roles_after_delete"] = roles_after_delete
    gone = not any(r["id"] == created["id"] for r in roles_after_delete)
    shot = shotter.shot(page, "rbac-08-deleted")
    log.add("删除自定义角色", "REST 中角色已不存在", "gone=%s" % gone, gone, shot)

    # --- 系统角色只读 ---
    page.reload(wait_until="networkidle")
    page.get_by_text("角色与权限", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1800)
    page.evaluate(ROLE_TREE_CLICK_JS, "普通用户")
    page.wait_for_timeout(1000)
    readonly_notice = page.get_by_text("系统内置角色由代码目录维护，只读。", exact=False).count() > 0
    delete_btn_count = page.get_by_role("button", name="删除", exact=True).count()
    shot = shotter.shot(page, "rbac-09-system-readonly")
    log.add("系统角色只读", "显示只读提示且无删除按钮",
            "readonly_notice=%s delete_btn=%s" % (readonly_notice, delete_btn_count), readonly_notice and delete_btn_count == 0, shot)

    # 系统角色 REST 修改应被拒
    s_sys, b_sys = api("PATCH", "/auth/roles/role_user", cookie=cookie, body={"name": "被改"})
    raw["system_role_patch"] = {"status": s_sys, "body": b_sys}
    log.add("REST 修改系统角色被拒", "422 且提示系统角色不可修改",
            "status=%s body=%s" % (s_sys, json.dumps(b_sys, ensure_ascii=False)),
            s_sys == 422 and "系统角色不可修改" in json.dumps(b_sys, ensure_ascii=False))

dump(str(AREA_DIR / "raw-rbac.json"), raw)
log.save()
print("RBAC DONE ok=%d fail=%d" % (sum(1 for s in log.steps if s["ok"]), sum(1 for s in log.steps if not s["ok"])))
