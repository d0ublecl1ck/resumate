# -*- coding: utf-8 -*-
"""功能 1：设置页偏好（主题 / 语言 / 自动保存 / 默认模板）保存后刷新仍生效。"""
import json, sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from settings_rbac_lib import AREA_DIR, api, dump, login_cookie, StepLog, ui_login, WEB
from e2e_lib import Recorder, browser_page

accounts = json.loads((AREA_DIR / "accounts.json").read_text())
EMAIL = accounts["main"]
PWD = accounts["password"]
log = StepLog("prefs")
shotter = Recorder("settings-rbac")
raw = {}

cookie, me, st = login_cookie(EMAIL, PWD)
log.add("REST 登录自建主账号", "200 且 role=user",
        "status=%s role=%s" % (st, me.get("role") if isinstance(me, dict) else me), st == 200)

before_s, before = api("GET", "/settings", cookie=cookie)
raw["settings_before"] = before

with browser_page() as page:
    ok, err = ui_login(page, EMAIL, PWD)
    shot = shotter.shot(page, "prefs-01-login-workbench")
    log.add("浏览器登录并进入工作台", "URL 为 / 且显示工作台",
            "ok=%s err=%s url=%s" % (ok, err, page.url), ok, shot)

    page.goto(WEB + "/settings", wait_until="networkidle", timeout=45000)
    page.get_by_text("个人偏好", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1200)
    shot = shotter.shot(page, "prefs-02-settings-loaded")
    log.add("打开设置页", "渲染出「个人偏好」分区", "已渲染「个人偏好」", True, shot)

    page.locator('label:has(span:text-is("显示名称")) input').fill("E2E 主账号-改名")
    page.locator('label:has(span:text-is("主题")) select').select_option("dark")
    switch = page.get_by_role("switch", name="空闲自动保存")
    # 间隔输入框在自动保存关闭时 disabled：先确保打开再填值，最后关掉。
    if switch.get_attribute("aria-checked") == "false":
        switch.click()
        page.wait_for_timeout(250)
    page.locator('input[aria-label="自动保存间隔（秒）"]').fill("30")
    if switch.get_attribute("aria-checked") == "true":
        switch.click()
        page.wait_for_timeout(200)
    page.locator('select[aria-label="默认模板"]').select_option("tpl_modern")
    page.wait_for_timeout(300)
    shot = shotter.shot(page, "prefs-03-edited-form")
    log.add("编辑偏好（改名/深色/关自动保存/间隔30/默认模板现代双栏）", "表单接受输入",
            "theme=dark autosave=%s interval=30 template=tpl_modern" % switch.get_attribute("aria-checked"), True, shot)

    page.get_by_role("button", name="保存偏好", exact=True).click()
    page.get_by_text("已保存", exact=True).first.wait_for(timeout=15000)
    page.wait_for_timeout(800)
    shot = shotter.shot(page, "prefs-04-saved")
    log.add("点击「保存偏好」", "出现「已保存」", "已出现「已保存」", True, shot)

    after_s, after = api("GET", "/settings", cookie=cookie)
    raw["settings_after_save"] = after
    ok = (after.get("theme") == "dark" and after.get("autosave") is False
          and after.get("autosaveIntervalSeconds") == 30
          and after.get("defaultTemplateId") == "tpl_modern"
          and after.get("displayName") == "E2E 主账号-改名")
    dump(str(AREA_DIR / "raw-prefs-after-save.json"), after)
    log.add("REST 交叉验证 GET /settings", "theme=dark autosave=false interval=30 template=tpl_modern 名称已改",
            json.dumps(after, ensure_ascii=False), ok, "areas/settings-rbac/raw-prefs-after-save.json")

    is_dark = page.evaluate("() => document.documentElement.classList.contains('dark')")
    log.add("主题即时生效", "<html> 带 dark class", "dark=%s" % is_dark, is_dark)

    page.reload(wait_until="networkidle")
    page.get_by_text("个人偏好", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1500)
    val_theme = page.locator('label:has(span:text-is("主题")) select').input_value()
    val_name = page.locator('label:has(span:text-is("显示名称")) input').input_value()
    val_auto = page.get_by_role("switch", name="空闲自动保存").get_attribute("aria-checked")
    val_interval = page.locator('input[aria-label="自动保存间隔（秒）"]').input_value()
    val_tpl = page.locator('select[aria-label="默认模板"]').input_value()
    is_dark2 = page.evaluate("() => document.documentElement.classList.contains('dark')")
    shot = shotter.shot(page, "prefs-05-after-reload")
    ok = (val_theme == "dark" and val_name == "E2E 主账号-改名" and val_auto == "false"
          and val_interval == "30" and val_tpl == "tpl_modern" and is_dark2)
    log.add("刷新后偏好回显", "深色/改名/关自动保存/30/现代双栏 全部保留",
            "theme=%s name=%s autosave=%s interval=%s tpl=%s dark=%s" % (val_theme, val_name, val_auto, val_interval, val_tpl, is_dark2),
            ok, shot)

    page.get_by_role("button", name="English", exact=True).click()
    page.wait_for_timeout(1500)
    en_s, en = api("GET", "/settings", cookie=cookie)
    raw["settings_lang_en"] = en
    lang_en_ui = page.evaluate("() => document.documentElement.lang")
    shot = shotter.shot(page, "prefs-06-lang-en")
    ok = en.get("language") == "en" and lang_en_ui == "en"
    log.add("切换语言为 English", "REST language=en 且 <html lang>=en",
            "language=%s html.lang=%s" % (en.get("language"), lang_en_ui), ok, shot)

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1500)
    lang_after_reload = page.evaluate("() => document.documentElement.lang")
    local_locale = page.evaluate("() => localStorage.getItem('resumate.locale')")
    shot = shotter.shot(page, "prefs-07-lang-en-reload")
    ok = lang_after_reload == "en" and local_locale == "en"
    log.add("刷新后语言仍为 English", "<html lang>=en 且 localStorage=en",
            "html.lang=%s localStorage=%s" % (lang_after_reload, local_locale), ok, shot)

    page.get_by_role("button", name="简体中文", exact=True).click()
    page.wait_for_timeout(1500)
    zh_s, zh = api("GET", "/settings", cookie=cookie)
    raw["settings_lang_zh"] = zh
    lang_zh_ui = page.evaluate("() => document.documentElement.lang")
    log.add("切回简体中文", "REST language=zh-CN 且 <html lang>=zh-CN",
            "language=%s html.lang=%s" % (zh.get("language"), lang_zh_ui),
            zh.get("language") == "zh-CN" and lang_zh_ui == "zh-CN")

    page.goto(WEB + "/settings", wait_until="networkidle")
    page.get_by_text("个人偏好", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1000)
    page.locator('label:has(span:text-is("主题")) select').select_option("paper")
    sw = page.get_by_role("switch", name="空闲自动保存")
    if sw.get_attribute("aria-checked") == "false":
        sw.click()
    page.locator('input[aria-label="自动保存间隔（秒）"]').fill("10")
    page.get_by_role("button", name="保存偏好", exact=True).click()
    page.get_by_text("已保存", exact=True).first.wait_for(timeout=15000)
    page.wait_for_timeout(600)
    r_s, r = api("GET", "/settings", cookie=cookie)
    raw["settings_restored"] = r
    shot = shotter.shot(page, "prefs-08-restored")
    log.add("还原主题/自动保存为默认", "theme=paper autosave=true interval=10",
            "theme=%s autosave=%s interval=%s" % (r.get("theme"), r.get("autosave"), r.get("autosaveIntervalSeconds")),
            r.get("theme") == "paper" and r.get("autosave") is True and r.get("autosaveIntervalSeconds") == 10, shot)

dump(str(AREA_DIR / "raw-prefs.json"), raw)
log.save()
print("PREFS DONE ok=%d fail=%d" % (sum(1 for s in log.steps if s["ok"]), sum(1 for s in log.steps if not s["ok"])))
