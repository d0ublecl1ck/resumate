#!/usr/bin/env python3
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import api, api_login, browser_page
cookie = api_login("admin@resumate.dev", "resumate-admin")
api("PATCH", "/settings", cookie=cookie, body={"theme": "paper", "language": "zh-CN"})
with browser_page() as page:
    page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill("admin@resumate.dev")
    page.get_by_label("密码").fill("resumate-admin")
    page.get_by_role("button", name="登录").click()
    page.wait_for_timeout(2000)
    page.goto("http://127.0.0.1:5173/settings", wait_until="networkidle")
    page.wait_for_timeout(1500)
    page.get_by_role("group", name="语言").get_by_role("button", name="English").click()
    page.wait_for_timeout(2000)
    print("LANG:", page.evaluate("document.documentElement.lang"))
    print("BODY:", page.inner_text("body")[:1000].replace(chr(10), " | "))
    print("LOCALSTORAGE:", page.evaluate("localStorage.getItem('resumate.locale')"))
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(2000)
    print("AFTER RELOAD LANG:", page.evaluate("document.documentElement.lang"))
api("PATCH", "/settings", cookie=cookie, body={"language": "zh-CN"})
