"""共享 E2E 脚手架：Playwright 无头浏览器、截图、API 调用、步骤记录。

用法：
    from e2e_lib import Recorder, browser_page, api_login
    rec = Recorder("resume-library")
    with browser_page() as page:
        ...
"""
import json
import os
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path

ROOT = Path("<本机用户名>/resumate-worktrees/zj-fwwb-2026")
E2E_DIR = ROOT / "docs/e2e/2026-10-09"
SHOTS = E2E_DIR / "shots"
LOGS = E2E_DIR / "logs"
API = "http://127.0.0.1:8000"
WEB = "http://127.0.0.1:5173"


class Recorder:
    """把每一步的预期/实际结果写成 markdown 证据。"""

    def __init__(self, name):
        self.name = name
        self.dir = E2E_DIR / "areas" / name
        self.dir.mkdir(parents=True, exist_ok=True)
        self.rows = []
        self.counter = 0

    def step(self, title, expected, actual, ok, evidence=""):
        self.counter += 1
        self.rows.append(
            {"n": self.counter, "title": title, "expected": expected,
             "actual": actual, "ok": ok, "evidence": evidence}
        )
        mark = "PASS" if ok else "FAIL"
        print("[%s] %s | expected=%s | actual=%s | %s" % (mark, title, expected, actual, evidence), flush=True)
        return ok

    def shot(self, page, name):
        self.counter_shot = getattr(self, "counter_shot", 0) + 1
        path = self.dir / ("%02d-%s.png" % (self.counter_shot, name))
        page.screenshot(path=str(path), full_page=True)
        return str(path)

    def write(self, extra=""):
        lines = ["# %s E2E 证据" % self.name, "", "| # | 步骤 | 预期 | 实际 | 结果 | 证据 |",
                 "|---|---|---|---|---|---|"]
        for r in self.rows:
            lines.append("| %d | %s | %s | %s | %s | %s |" % (
                r["n"], r["title"].replace("|", "\\|"), r["expected"].replace("|", "\\|"),
                r["actual"].replace("|", "\\|"), "PASS" if r["ok"] else "FAIL",
                r["evidence"]))
        passed = sum(1 for r in self.rows if r["ok"])
        lines.append("")
        lines.append("合计：%d 通过 / %d 失败" % (passed, len(self.rows) - passed))
        if extra:
            lines += ["", extra]
        out = self.dir / "REPORT.md"
        out.write_text("\n".join(lines), encoding="utf-8")
        return str(out)


@contextmanager
def browser_page(locale="zh-CN", viewport=None, store=None):
    from playwright.sync_api import sync_playwright

    vp = viewport or {"width": 1440, "height": 900}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(locale=locale, viewport=vp, storage_state=store)
        page = ctx.new_page()
        console = []
        page.on("console", lambda m: console.append("%s: %s" % (m.type, m.text)))
        page.on("pageerror", lambda e: console.append("pageerror: %s" % e))
        page.console_log = console  # type: ignore[attr-defined]
        try:
            yield page
        finally:
            ctx.close()
            browser.close()


def api(method, path, *, body=None, cookie=None, headers=None, raw=False):
    """直接调后端 REST；返回 (status, parsed_body_or_text)。"""
    url = API + path
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    if cookie:
        hdrs["Cookie"] = cookie
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8", "replace")
            status = resp.status
            set_cookie = resp.headers.get_all("Set-Cookie") or []
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", "replace")
        status = exc.code
        set_cookie = exc.headers.get_all("Set-Cookie") or []
    if raw:
        return status, text
    try:
        return status, json.loads(text)
    except Exception:
        return status, text


def api_login(email, password):
    """登录并返回可直接放进 Cookie 头的会话串（走配置好的 CookieJar）。"""
    return _login_cookie(email, password)


def _login_cookie(email, password):
    import http.cookiejar
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(
        API + "/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(req, timeout=30) as resp:
        resp.read()
    return "; ".join("%s=%s" % (c.name, c.value) for c in jar)


def wait_for_port(url, timeout=60):
    import socket
    from urllib.parse import urlparse
    u = urlparse(url)
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((u.hostname, u.port), timeout=2):
                return True
        except OSError:
            time.sleep(0.5)
    return False
