#!/usr/bin/env python3
"""V6 单独复现：Profile 事实删除入口。"""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import Recorder, api, api_login, browser_page

TS = time.strftime("%m%d-%H%M%S")
rec = Recorder("fix-ui-verify")
cookie = api_login("admin@resumate.dev", "resumate-admin")
st, fact = api("POST", "/profile/facts", cookie=cookie,
               body={"type": "skill", "title": "V6事实%s" % TS, "content": "删除入口复现", "tags": [],
                     "evidence": {"status": "verified"}, "visibility": "private"})
print("fact create:", st, fact.get("id"))
with browser_page() as page:
    page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill("admin@resumate.dev")
    page.get_by_label("密码").fill("resumate-admin")
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.goto("http://127.0.0.1:5173/profile", wait_until="networkidle")
    page.wait_for_timeout(2500)
    btn = page.get_by_role("button", name="删除「V6事实%s」" % TS)
    print("delete btn count:", btn.count())
    btn.first.click()
    page.wait_for_timeout(1200)
    dlg = page.get_by_role("dialog")
    print("dialog count:", dlg.count())
    if dlg.count():
        print("dialog text:", dlg.first.inner_text().replace(chr(10), " / ")[:200])
        names = [b.inner_text() for b in dlg.first.get_by_role("button").all()]
        print("dialog buttons:", names)
        confirm = dlg.first.get_by_role("button", name="确认删除")
        print("confirm count:", confirm.count(), "disabled:", confirm.first.is_disabled() if confirm.count() else None)
        confirm.first.click()
        page.wait_for_timeout(2500)
    print("alert:", [p.inner_text() for p in page.get_by_role("alert").all()])
    st2, body = api("GET", "/profile/facts/%s" % fact["id"], cookie=cookie)
    rec.step("V6 事实删除", "确认后事实 404", "GET=%s" % st2, st2 == 404, rec.shot(page, "v6b-fact-delete"))
    api("DELETE", "/profile/facts/%s" % fact["id"], cookie=cookie)
print(rec.write())
