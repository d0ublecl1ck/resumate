#!/usr/bin/env python3
"""聚焦复核 B8b：版本错备份的 UI 业务报错文案（不与损坏 JSON 连测）。"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import WEB, E2E_DIR, Recorder, browser_page

AREA = E2E_DIR / "areas" / "access-backup"
STATE = json.loads((AREA / "state.json").read_text(encoding="utf-8"))
bad = AREA / "bad-version.json"
bad.write_text(json.dumps({"formatVersion": "nope", "resources": {}}), encoding="utf-8")

rec = Recorder("access-backup")
with browser_page() as page:
    page.goto(WEB + "/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill(STATE["email"])
    page.get_by_label("密码").fill(STATE["password"])
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.wait_for_timeout(800)
    page.goto(WEB + "/settings/backup", wait_until="networkidle")
    page.get_by_role("heading", name="导出完整备份").wait_for(timeout=15000)
    page.locator("input[type=file]").set_input_files(str(bad))
    found = False
    for _ in range(20):
        if "不支持的备份格式版本" in page.inner_text("body"):
            found = True
            break
        page.wait_for_timeout(300)
    shot = rec.shot(page, "focused-bad-version")
    print("UI message found:", found)
    print("screenshot:", shot)
