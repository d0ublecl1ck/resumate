#!/usr/bin/env python3
"""V7：简历卡删除入口（父代理独立复验）。"""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import Recorder, api, api_login, browser_page

TS = time.strftime("%m%d-%H%M%S")
rec = Recorder("fix-ui-verify")
cookie = api_login("admin@resumate.dev", "resumate-admin")
st, first = api("GET", "/resumes?lifecycle=active", cookie=cookie)
clone = api("POST", "/resumes/%s/duplicate" % first[0]["id"], cookie=cookie)[1]
title = clone["title"]
with browser_page() as page:
    page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill("admin@resumate.dev")
    page.get_by_label("密码").fill("resumate-admin")
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.goto("http://127.0.0.1:5173/resumes", wait_until="networkidle")
    page.wait_for_timeout(2000)
    card = page.get_by_role("listitem").filter(has_text=title).first
    if card.count() == 0:
        card = page.locator("div").filter(has_text=title).last
    delete_btn = card.get_by_role("button", name="删除").first
    has = delete_btn.count() > 0
    if has:
        delete_btn.click()
        page.wait_for_timeout(700)
        page.get_by_role("dialog").get_by_role("button", name="确认删除").first.click()
        page.wait_for_timeout(2000)
    st2, body = api("GET", "/resumes/%s" % clone["id"], cookie=cookie)
    rec.step("V7 简历卡删除入口", "确认后该简历 lifecycle=deleted（GET 仍 200 但状态 deleted）",
             "删除按钮=%s GET=%s lifecycle=%s" % (has, st2, (body or {}).get("lifecycle") if isinstance(body, dict) else body),
             has and isinstance(body, dict) and body.get("lifecycle") == "deleted", rec.shot(page, "v7-resume-deleted"))
    # 清理
    api("DELETE", "/resumes/%s" % clone["id"], cookie=cookie)
print(rec.write())
