#!/usr/bin/env python3
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import browser_page

with browser_page() as page:
    bad = []
    page.on("response", lambda r: bad.append((r.status, r.url)) if r.status >= 400 else None)
    page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill("admin@resumate.dev")
    page.get_by_label("密码").fill("resumate-admin")
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.wait_for_timeout(4000)
    body = page.inner_text("body")
    print("BODY LEN:", len(body))
    print("BODY:", body[:400].replace(chr(10), " / "))
    print("BAD RESPONSES:")
    for s, u in bad:
        print("  ", s, u)
    print("CONSOLE:")
    for c in page.console_log:
        print("  ", c[:300])
