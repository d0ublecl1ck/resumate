#!/usr/bin/env python3
"""jd-profile E2E 公共辅助：登录、网络捕获、按钮盘点、REST 数据准备。"""
import http.cookiejar
import json
import sys
import time
import urllib.request

ROOT = "<本机用户名>/resumate-worktrees/zj-fwwb-2026"
sys.path.insert(0, ROOT + "/docs/e2e/2026-10-09/scripts")
from e2e_lib import api  # noqa: E402

API = "http://127.0.0.1:8000"
WEB = "http://127.0.0.1:5173"
ADMIN = ("admin@resumate.dev", "resumate-admin")


def login_cookie(email=None, password=None):
    email = email or ADMIN[0]
    password = password or ADMIN[1]
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


def ui_login(page, email=None, password=None):
    """通过登录页真实登录（无头 chromium）。"""
    email = email or ADMIN[0]
    password = password or ADMIN[1]
    page.goto(WEB + "/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill(email)
    page.get_by_label("密码").fill(password)
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=20000)
    page.wait_for_timeout(1500)


class NetCapture:
    """记录命中关键字的响应（方法/URL/status/原始 body）。"""

    KEYS = ("/jds", "/profile", "/auth/login")

    def __init__(self, page):
        self.events = []
        page.on("response", self._on_response)

    def _on_response(self, resp):
        url = resp.url
        if not any(k in url for k in self.KEYS):
            return
        try:
            body = resp.text()
        except Exception as exc:  # noqa: BLE001
            body = "<unreadable: %s>" % exc
        self.events.append({
            "method": resp.request.method,
            "url": url,
            "status": resp.status,
            "body": body[:2000],
        })

    def find(self, method=None, path_fragment=None):
        out = []
        for e in self.events:
            if method and e["method"] != method:
                continue
            if path_fragment and path_fragment not in e["url"]:
                continue
            out.append(e)
        return out

    def dump(self):
        return "\n".join(
            "  %s %s -> %s\n    %s" % (e["method"], e["url"], e["status"], e["body"][:600])
            for e in self.events
        ) or "  (无命中请求)"


def visible_buttons(page):
    """页面上所有可见 button / a 的文本（用于盘点缺失控件）。"""
    texts = []
    loc = page.locator("button, a")
    for i in range(loc.count()):
        try:
            el = loc.nth(i)
            if el.is_visible():
                t = (el.inner_text() or "").strip()
                if t:
                    texts.append(t)
        except Exception:  # noqa: BLE001
            continue
    return texts


def body_text(page):
    try:
        return page.locator("body").inner_text()
    except Exception:  # noqa: BLE001
        return ""


def prepare_jd(cookie, prefix, suffix):
    status, jd = api("POST", "/jds", cookie=cookie, body={
        "role": "%s-%s" % (prefix, suffix),
        "company": "%s-公司-%s" % (prefix, suffix),
        "body": "%s 正文 %s：负责核心系统开发，主导性能优化。" % (prefix, suffix),
        "tags": ["%s-tag" % prefix],
    })
    assert status == 201, (status, jd)
    return jd


def create_resume(cookie, prefix, suffix, fact_id=None):
    s, templates = api("GET", "/templates", cookie=cookie)
    template_id = templates[0]["id"] if isinstance(templates, list) and templates else ""
    sections = []
    if fact_id:
        sections = [{
            "id": "sec_%s" % suffix,
            "kind": "experience",
            "title": "职业经历",
            "entries": [{
                "id": "ent_%s" % suffix,
                "title": "%s-被引用经历" % prefix,
                "bullets": ["引用事实"],
                "provenance": {"kind": "profile_fact", "label": "来自主档", "factId": fact_id},
            }],
        }]
    s, resume = api("POST", "/resumes", cookie=cookie, body={
        "title": "%s-简历-%s" % (prefix, suffix),
        "template_id": template_id,
        "target_role": "",
        "tags": [],
        "document": {"basics": {"full_name": "%s-姓名" % prefix}, "sections": sections},
    })
    assert s == 201, (s, resume)
    if fact_id:
        # 提交文档生成版本，让 reference_index 能通过 version.snapshot 找到引用
        s2, r2 = api("PUT", "/resumes/%s/document" % resume["id"], cookie=cookie, body={
            "document": resume["document"], "message": "e2e 建立引用"})
        print("  PUT document ->", s2, "current_version_id=", r2.get("current_version_id") if isinstance(r2, dict) else r2)
    return resume
