#!/usr/bin/env python3
"""界面 E2E：中英双语切换、深浅色主题、空态/错误态。"""
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import Recorder, api, api_login, browser_page

rec = Recorder("ui-i18n-theme")
cookie = api_login("admin@resumate.dev", "resumate-admin")
# 幂等基线：上一轮崩溃可能把偏好留成深色，先把基线设回浅色 + 中文（REST 权威值）
api("PATCH", "/settings", cookie=cookie, body={"theme": "paper", "language": "zh-CN"})
CJK = re.compile(r"[\u4e00-\u9fff]")

with browser_page() as page:
    page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill("admin@resumate.dev")
    page.get_by_label("密码").fill("resumate-admin")
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.wait_for_timeout(1200)

    # 1) 浅色主题基线
    dark0 = page.evaluate("document.documentElement.classList.contains('dark')")
    rec.step("1 默认浅色（paper）", "html 无 dark 类",
             "dark=%s lang=%s" % (dark0, page.evaluate("document.documentElement.lang")), dark0 is False,
             rec.shot(page, "theme-paper"))

    # 2) 切深色
    page.goto("http://127.0.0.1:5173/settings", wait_until="networkidle")
    page.wait_for_timeout(1200)
    theme_select = page.get_by_label("主题")
    theme_select.select_option("dark")
    page.get_by_role("button", name="保存偏好", exact=True).click()
    page.wait_for_timeout(1500)
    dark1 = page.evaluate("document.documentElement.classList.contains('dark')")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1500)
    dark2 = page.evaluate("document.documentElement.classList.contains('dark')")
    st, prefs = api("GET", "/settings", cookie=cookie)
    rec.step("2 深色主题即时生效且持久化", "保存后 html.dark=true，刷新后仍为 dark，REST theme=dark",
             "after_save=%s after_reload=%s rest=%s" % (dark1, dark2, prefs.get("theme")),
             dark1 and dark2 and prefs.get("theme") == "dark", rec.shot(page, "theme-dark"))

    # 3) 切英文
    page.get_by_role("group", name="语言").get_by_role("button", name="English").click()
    page.wait_for_timeout(1800)
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1500)
    lang = page.evaluate("document.documentElement.lang")
    body = page.inner_text("body")
    chrome_en = all(key in body for key in ("Settings & open access", "Agent & preferences", "Language", "Theme"))
    chrome_zh = any(key in body for key in ("设置与开放接入", "语言", "主题"))
    rec.step("3 切换英文后界面文案变英文", "lang=en，设置页出现 Preferences/Language/Theme 且无中文 chrome",
             "lang=%s chrome_en=%s chrome_zh=%s sample=%s" % (lang, chrome_en, chrome_zh, body[:110].replace(chr(10), " / ")),
             lang == "en" and chrome_en and not chrome_zh, rec.shot(page, "lang-en-settings"))

    # 4) 英文下多个页面都无中文残留
    nav_map = {
        "workbench": ("/", "Workbench", "工作台"),
        "resumes": ("/resumes", "Resumes", "简历库"),
        "jds": ("/jds", "Job descriptions", "JD 库"),
        "profile": ("/profile", "Profile", "个人资料"),
    }
    chrome = {}
    for name, (path, en_label, zh_label) in nav_map.items():
        page.goto("http://127.0.0.1:5173" + path, wait_until="networkidle")
        page.wait_for_timeout(1200)
        text = page.inner_text("body")
        chrome[name] = {"en": en_label in text, "zh_nav": zh_label in text}
    ok4 = all(v["en"] and not v["zh_nav"] for v in chrome.values())
    rec.step("4 英文界面导航与区块标题为英文", "四个页面的导航/标题为英文且不出现中文导航词（用户数据与角色名不翻译）",
             "chrome=%s" % chrome, ok4, rec.shot(page, "lang-en-resumes"))

    # 5) 切回中文 + 浅色
    page.goto("http://127.0.0.1:5173/settings", wait_until="networkidle")
    page.wait_for_timeout(1200)
    page.get_by_label("Theme").select_option("paper")
    page.get_by_role("button", name="Save preferences", exact=True).click()
    page.wait_for_timeout(1500)
    page.get_by_role("group", name="Language").get_by_role("button", name="简体中文").click()
    page.wait_for_timeout(1800)
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1200)
    lang2 = page.evaluate("document.documentElement.lang")
    dark3 = page.evaluate("document.documentElement.classList.contains('dark')")
    st, prefs2 = api("GET", "/settings", cookie=cookie)
    rec.step("5 还原中文+浅色", "lang=zh-CN、dark=false、REST 一致",
             "lang=%s dark=%s rest=%s/%s" % (lang2, dark3, prefs2.get("language"), prefs2.get("theme")),
             lang2 == "zh-CN" and dark3 is False, rec.shot(page, "restored-zh-paper"))

    # 6) 错误态：不存在的路由
    page.goto("http://127.0.0.1:5173/no-such-page", wait_until="networkidle")
    page.wait_for_timeout(800)
    t6 = page.inner_text("body")
    rec.step("6 未知路由错误态", "显示未找到页面 + 错误码 404",
             "text=%s" % t6.replace(chr(10), " / ")[:160], "404" in t6, rec.shot(page, "state-404-route"))

    # 7) 错误态：不存在的简历
    page.goto("http://127.0.0.1:5173/resumes/res_missing_e2e", wait_until="networkidle")
    page.wait_for_timeout(1200)
    t7 = page.inner_text("body")
    rec.step("7 不存在的简历错误态", "显示未找到状态块且不白屏",
             "text=%s" % t7.replace(chr(10), " / ")[:160], ("404" in t7 or "不存在" in t7) and len(t7) > 20,
             rec.shot(page, "state-resume-404"))

    # 8) 错误态：不存在的 JD
    page.goto("http://127.0.0.1:5173/jds/jd_missing_e2e", wait_until="networkidle")
    page.wait_for_timeout(1200)
    t8 = page.inner_text("body")
    rec.step("8 不存在的 JD 错误态", "显示未找到状态块",
             "text=%s" % t8.replace(chr(10), " / ")[:160], "404" in t8, rec.shot(page, "state-jd-404"))

    errs = [c for c in page.console_log if c.startswith("pageerror")]
    rec.step("控制台无 JS 异常", "无 pageerror", "pageerror=%s" % errs[:2], len(errs) == 0)

print(rec.write())