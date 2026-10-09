#!/usr/bin/env python3
"""烟测：无头浏览器登录 -> 工作台，确认脚手架与栈可用（含字体 403 环境噪声说明）。"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import Recorder, browser_page

rec = Recorder("smoke")
with browser_page() as page:
    page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
    shot = rec.shot(page, "login-page")
    rec.step("打开登录页", "渲染登录表单", "title=%s url=%s" % (page.title(), page.url),
             page.get_by_role("button", name="登录").count() > 0, shot)
    page.get_by_label("邮箱").fill("admin@resumate.dev")
    page.get_by_label("密码").fill("resumate-admin")
    rec.shot(page, "login-filled")
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.wait_for_timeout(3000)
    shot2 = rec.shot(page, "workbench")
    body = page.inner_text("body")
    rec.step("管理员登录", "跳转工作台", "url=%s" % page.url, "/login" not in page.url, shot2)
    rec.step("工作台渲染", "出现导航与工作台内容（长度 > 200）",
             "len=%d sample=%s" % (len(body), body[:80].replace(chr(10), " / ")), len(body) > 200, shot2)
    errs = [c for c in page.console_log if c.startswith("pageerror")]
    font403 = [c for c in page.console_log if "403" in c]
    rec.step("无 JS 异常", "无 pageerror（字体 403 属 worktree 软链 node_modules 的环境噪声）",
             "pageerror=%d font403=%d" % (len(errs), len(font403)), len(errs) == 0)
print(rec.write())
