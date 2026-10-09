#!/usr/bin/env python3
"""编辑器顶栏「导出」按钮是否真的导出（无 onClick 的死按钮复核）。"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import Recorder, api, api_login, browser_page

rec = Recorder("editor-export")
cookie = api_login("admin@resumate.dev", "resumate-admin")
status, tpl = api("GET", "/templates", cookie=cookie)
resume = api("POST", "/resumes", cookie=cookie, body={"title": "e2e-export", "templateId": tpl[0]["id"]})[1]
rid = resume["id"]
with browser_page() as page:
    page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill("admin@resumate.dev")
    page.get_by_label("密码").fill("resumate-admin")
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    requests = []
    page.on("request", lambda r: requests.append(r.url))
    downloads = []
    page.on("download", lambda d: downloads.append(d.suggested_filename))
    page.goto("http://127.0.0.1:5173/resumes/%s" % rid, wait_until="networkidle")
    page.wait_for_timeout(1500)
    before = len(requests)
    page.get_by_role("button", name="导出").first.click()
    page.wait_for_timeout(2500)
    after = len(requests)
    new_reqs = [u for u in requests[before:] if "/api/" in u]
    rec.step("编辑器「导出」按钮", "点击后产生导出请求或下载事件",
             "downloads=%s new_api_requests=%s console_pageerror=%s" % (downloads, new_reqs,
                 [c for c in page.console_log if c.startswith("pageerror")][:1]),
             bool(downloads) or bool(new_reqs), rec.shot(page, "editor-export-click"))
print(rec.write())
