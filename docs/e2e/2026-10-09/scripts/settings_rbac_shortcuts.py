# -*- coding: utf-8 -*-
"""功能 4：快捷键冲突校验（同键冲突被拒 / 合法组合可保存）。"""
import json, sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from settings_rbac_lib import AREA_DIR, api, dump, login_cookie, StepLog, ui_login, WEB
from e2e_lib import Recorder, browser_page

accounts = json.loads((AREA_DIR / "accounts.json").read_text())
EMAIL, PWD = accounts["main"], accounts["password"]
log = StepLog("shortcuts")
shotter = Recorder("settings-rbac")
raw = {}
cookie, _, _ = login_cookie(EMAIL, PWD)

def prefs_section(page):
    return page.locator('section:has(h2:text-is("个人偏好"))')

def shortcut_input(page, action_label):
    return page.locator('input[aria-label="%s 快捷键"]' % action_label)

with browser_page() as page:
    ok, err = ui_login(page, EMAIL, PWD)
    page.goto(WEB + "/settings", wait_until="networkidle", timeout=45000)
    page.get_by_text("个人偏好", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1200)

    s0, p0 = api("GET", "/settings", cookie=cookie)
    keys_before = {x["action"]: x["keys"] for x in p0.get("shortcuts", [])}
    raw["shortcuts_before"] = p0
    shot = shotter.shot(page, "shortcuts-01-defaults")
    log.add("读取快捷键默认映射", "4 个动作且无冲突",
            json.dumps(keys_before, ensure_ascii=False),
            len(keys_before) == 4 and all(x.get("conflict") in (None, False) for x in p0["shortcuts"]), shot)

    # --- 冲突：把「发送对话」改成与「保存并提交」相同的 ⌘ S ---
    shortcut_input(page, "发送对话").fill("⌘ S")
    page.wait_for_timeout(300)
    shot = shotter.shot(page, "shortcuts-02-conflict-edited")
    prefs_section(page).get_by_role("button", name="保存偏好").click()
    page.wait_for_timeout(1500)
    err_text = ""
    try:
        err_text = prefs_section(page).locator('span:has-text("请先解除冲突")').first.inner_text(timeout=5000)
    except Exception:
        err_text = "[未出现冲突提示]"
    shot = shotter.shot(page, "shortcuts-03-conflict-rejected")
    rest_s, rest_b = api("PATCH", "/settings", cookie=cookie,
                         body={"shortcuts": [{"action": "save_flush", "keys": "⌘ S"},
                                             {"action": "send_message", "keys": "⌘ S"},
                                             {"action": "open_history", "keys": "⌘ H"},
                                             {"action": "accept_all_diff", "keys": "⌘ ⇧ A"}]})
    raw["conflict_ui"] = {"ui_text": err_text, "rest_status": rest_s, "rest_body": rest_b}
    log.add("两个动作绑定同一组合键 → 保存被拒", "界面出现冲突提示且后端 422",
            "UI=%r REST=%s %s" % (err_text, rest_s, json.dumps(rest_b, ensure_ascii=False)),
            rest_s == 422 and "请先解除冲突" in err_text, shot)

    s_after, p_after = api("GET", "/settings", cookie=cookie)
    keys_after = {x["action"]: x["keys"] for x in p_after.get("shortcuts", [])}
    log.add("冲突保存被拒后映射保留原值", "send_message 仍为 ⌘ ↵",
            json.dumps(keys_after, ensure_ascii=False),
            keys_after.get("send_message") == "⌘ ↵")

    # --- 合法组合 ---
    page.reload(wait_until="networkidle")
    page.get_by_text("个人偏好", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1200)
    shortcut_input(page, "发送对话").fill("⌘ J")
    page.wait_for_timeout(250)
    prefs_section(page).get_by_role("button", name="保存偏好").click()
    prefs_section(page).get_by_text("已保存", exact=True).wait_for(timeout=15000)
    page.wait_for_timeout(600)
    s2, p2 = api("GET", "/settings", cookie=cookie)
    keys2 = {x["action"]: x["keys"] for x in p2.get("shortcuts", [])}
    raw["shortcuts_valid"] = p2
    shot = shotter.shot(page, "shortcuts-04-valid-saved")
    log.add("合法组合 ⌘ J 保存", "REST send_message=⌘ J 且无冲突标记",
            json.dumps(keys2, ensure_ascii=False),
            keys2.get("send_message") == "⌘ J" and all(x.get("conflict") in (None, False) for x in p2["shortcuts"]), shot)

    # 刷新回显
    page.reload(wait_until="networkidle")
    page.get_by_text("个人偏好", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1200)
    ui_val = shortcut_input(page, "发送对话").input_value()
    shot = shotter.shot(page, "shortcuts-05-after-reload")
    log.add("刷新后合法组合回显", "发送对话输入框 = ⌘ J", "value=%r" % ui_val, ui_val == "⌘ J", shot)

    # --- 还原 ---
    shortcut_input(page, "发送对话").fill("⌘ ↵")
    page.wait_for_timeout(200)
    prefs_section(page).get_by_role("button", name="保存偏好").click()
    prefs_section(page).get_by_text("已保存", exact=True).wait_for(timeout=15000)
    page.wait_for_timeout(500)
    s3, p3 = api("GET", "/settings", cookie=cookie)
    keys3 = {x["action"]: x["keys"] for x in p3.get("shortcuts", [])}
    raw["shortcuts_restored"] = p3
    shot = shotter.shot(page, "shortcuts-06-restored")
    log.add("还原快捷键默认", "send_message=⌘ ↵", json.dumps(keys3, ensure_ascii=False),
            keys3.get("send_message") == "⌘ ↵", shot)

dump(str(AREA_DIR / "raw-shortcuts.json"), raw)
log.save()
print("SHORTCUTS DONE ok=%d fail=%d" % (sum(1 for s in log.steps if s["ok"]), sum(1 for s in log.steps if not s["ok"])))
