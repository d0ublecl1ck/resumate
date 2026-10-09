#!/usr/bin/env python3
"""最小化复现 D5：导入预览列表在「同名资源」下的 React duplicate key 警告。

上传一份仅含 2 份同标题 Resume + 2 个同标题 JD 的合法备份，停在预览弹窗抓控制台。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import WEB, E2E_DIR, Recorder, browser_page

AREA = E2E_DIR / "areas" / "access-backup"
RAW = AREA / "raw"
RAW.mkdir(parents=True, exist_ok=True)
STATE = json.loads((AREA / "state.json").read_text(encoding="utf-8"))

payload = {
    "formatVersion": "resumate-backup/1.0",
    "exportedAt": "2026-10-09T00:00:00+00:00",
    "ownerId": "user_demo",
    "resources": {
        "profiles": [],
        "resumes": [
            {"id": "dup_r1", "title": "重复标题-简历", "targetRole": "", "tags": [], "templateId": "tpl_classic",
             "templateVersion": 1, "lifecycle": "active", "saveState": "committed", "document": {}},
            {"id": "dup_r2", "title": "重复标题-简历", "targetRole": "", "tags": [], "templateId": "tpl_classic",
             "templateVersion": 1, "lifecycle": "active", "saveState": "committed", "document": {}},
        ],
        "resumeVersions": [],
        "jobDescriptions": [
            {"id": "dup_j1", "role": "重复标题-岗位", "company": "同一公司", "body": "x", "tags": [], "revision": 1},
            {"id": "dup_j2", "role": "重复标题-岗位", "company": "同一公司", "body": "y", "tags": [], "revision": 1},
        ],
    },
}
dup_path = AREA / "dupkey-backup.json"
dup_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

rec = Recorder("access-backup")

with browser_page() as page:
    page.goto(WEB + "/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill(STATE["email"])
    page.get_by_label("密码").fill(STATE["password"])
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.wait_for_timeout(1000)
    page.goto(WEB + "/settings/backup", wait_until="networkidle")
    page.get_by_role("heading", name="导出完整备份").wait_for(timeout=15000)
    page.wait_for_timeout(500)
    before = len(page.console_log)
    page.locator("input[type=file]").set_input_files(str(dup_path))
    dialog = page.get_by_role("dialog")
    dialog.wait_for(state="visible", timeout=10000)
    page.wait_for_timeout(1200)
    dlg_text = dialog.inner_text()
    shot = rec.shot(page, "minimal-repro-dupkey")
    new_console = page.console_log[before:]
    dupkey = [c for c in new_console if "Encountered two children with the same key" in c]
    (RAW / "dupkey-console.log").write_text("\n".join(new_console), encoding="utf-8")

lines = [
    "# 最小复现 D5：导入预览 React duplicate key",
    "",
    "## 步骤",
    "1. 浏览器登录隔离账号 -> /settings/backup",
    "2. 上传 dupkey-backup.json（2 份同标题 Resume + 2 个同标题 JD，格式合法）",
    "3. 预览弹窗渲染「将新增的资源」，控制台出现 duplicate key 警告",
    "",
    "## 预期 / 实际",
    "- 预期：允许同名资源的预览列表使用唯一 key，无 React 警告",
    "- 实际：控制台出现 %d 条 Encountered two children with the same key" % len(dupkey),
    "",
    "## 根因",
    "- ui/src/components/backup-panel.tsx:219 key={resource.type + resource.title} 在同名资源下不唯一",
    "",
    "## 原始控制台（dupkey-console.log 摘录）",
    "~~~",
    "\n".join(dupkey[:4]) or "(none)",
    "~~~",
    "",
    "## 截图",
    "- %s" % shot,
    "",
    "## 预览弹窗文案（前 200 字）",
    "~~~",
    dlg_text[:200],
    "~~~",
]
md_path = AREA / "minimal-repro-dupkey.md"
md_path.write_text("\n".join(lines), encoding="utf-8")
print("dupkey warnings:", len(dupkey))
print("report:", md_path)
