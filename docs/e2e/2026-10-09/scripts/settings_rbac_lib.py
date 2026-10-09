"""settings-rbac E2E 私有脚手架（仅本 area 使用，不改共享 e2e_lib.py）。

提供：REST 封装（走 /auth/* 真实前缀）、注册+邮件验证、UI 登录、权限树三态读取等。
"""
import email as email_mod
import glob
import http.cookiejar
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "http://127.0.0.1:8000"
WEB = "http://127.0.0.1:5173"
MAIL_DIR = "/tmp/resumate-e2e-mail"
E2E_DIR = Path("<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09")
AREA_DIR = E2E_DIR / "areas" / "settings-rbac"
AREA_DIR.mkdir(parents=True, exist_ok=True)


def api(method, path, *, cookie=None, body=None, timeout=90):
    """直接打后端 REST，返回 (status, parsed_or_text)。"""
    headers = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    # 后端是 uvicorn --reload，另一个工作流改代码时会短暂重启（Connection refused）：
    # 对连接层失败做重试，避免把环境噪声记成产品失败。
    last_exc = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode("utf-8", "replace")
                return resp.status, _maybe_json(text)
        except urllib.error.HTTPError as exc:
            return exc.code, _maybe_json(exc.read().decode("utf-8", "replace"))
        except (urllib.error.URLError, ConnectionError, OSError) as exc:
            last_exc = exc
            time.sleep(1.0 + attempt)
    return 0, {"connection_error": str(last_exc)}


def _maybe_json(text):
    try:
        return json.loads(text)
    except Exception:
        return text


def login_cookie(email, password):
    """走真实 /auth/login，返回 (cookie 串, 响应体, 状态码)。"""
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(
        API + "/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    status, body = 0, None
    for attempt in range(6):
        try:
            with opener.open(req, timeout=30) as resp:
                body = _maybe_json(resp.read().decode("utf-8", "replace"))
                status = resp.status
            break
        except urllib.error.HTTPError as exc:
            body = _maybe_json(exc.read().decode("utf-8", "replace"))
            status = exc.code
            break
        except (urllib.error.URLError, ConnectionError, OSError) as exc:
            body = {"connection_error": str(exc)}
            time.sleep(1.0 + attempt)
    cookie = "; ".join("%s=%s" % (c.name, c.value) for c in jar)
    return cookie, body, status


def register(email, password, display_name):
    return api("POST", "/auth/register", body={"email": email, "password": password, "display_name": display_name})


def find_verification_token(email_addr, timeout=25):
    """从 /tmp/resumate-e2e-mail/*.eml 找到发给该地址的验证 token（最新一封优先）。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        files = sorted(glob.glob(os.path.join(MAIL_DIR, "*.eml")), reverse=True)
        for path in files:
            try:
                msg = email_mod.message_from_file(open(path, encoding="utf-8", errors="replace"))
            except Exception:
                continue
            if email_addr not in (msg.get("To") or ""):
                continue
            text = ""
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == "text/plain":
                        payload = part.get_payload(decode=True)
                        if payload:
                            text += payload.decode("utf-8", "replace")
            else:
                payload = msg.get_payload(decode=True)
                if payload:
                    text = payload.decode("utf-8", "replace")
            match = re.search(r"token=([A-Za-z0-9_\-]+)", text)
            if match:
                return match.group(1), os.path.basename(path)
        time.sleep(0.5)
    return None, None


def verify_email(token):
    return api("POST", "/auth/verification/verify", body={"token": token})


def register_and_verify(email_addr, password, display_name):
    """注册 → 读邮件 token → 验证；返回 (用户响应体, 原始步骤记录)。"""
    steps = []
    s, b = register(email_addr, password, display_name)
    steps.append({"call": "POST /auth/register", "status": s, "body": b})
    token, mailfile = find_verification_token(email_addr)
    steps.append({"call": "read mail", "mail": mailfile, "token_found": bool(token)})
    if not token:
        return None, steps
    s2, b2 = verify_email(token)
    steps.append({"call": "POST /auth/verification/verify", "status": s2, "body": b2})
    return b2, steps


def ui_login(page, email_addr, password, timeout=20000):
    """浏览器真实登录。返回 (是否进入应用, 页面错误文案)。"""
    page.goto(WEB + "/login", wait_until="networkidle", timeout=45000)
    page.get_by_label("邮箱").fill(email_addr)
    page.get_by_label("密码").fill(password)
    page.get_by_role("button", name="登录", exact=True).click()
    try:
        page.wait_for_url(re.compile(r"^http://127\.0\.0\.1:5173/(\?.*)?$"), timeout=timeout)
        page.wait_for_timeout(1200)
        return True, ""
    except Exception:
        page.wait_for_timeout(800)
        alerts = page.locator('[role="alert"]')
        text = alerts.first.inner_text() if alerts.count() else ""
        return False, text


PERM_TREE_READ_JS = """() => {
  const list = document.querySelector('ul[aria-label="权限树"]');
  if (!list) return null;
  return [...list.querySelectorAll('li')].map((li) => {
    const input = li.querySelector('input[type="checkbox"]');
    if (!input) return null;
    const labelSpan = li.querySelector('span.truncate');
    const codeSpan = li.querySelector('span.font-mono');
    const folderBtn = li.querySelector('button[aria-label]');
    return {
      label: labelSpan ? labelSpan.textContent : '',
      code: codeSpan ? codeSpan.textContent : null,
      isFolder: !!folderBtn,
      checked: input.checked,
      indeterminate: input.indeterminate,
      disabled: input.disabled,
    };
  }).filter(Boolean);
}"""

PERM_TREE_TOGGLE_JS = """(code) => {
  const list = document.querySelector('ul[aria-label="权限树"]');
  if (!list) return false;
  const rows = [...list.querySelectorAll('li')];
  const row = rows.find((li) => {
    const c = li.querySelector('span.font-mono');
    return c && c.textContent === code;
  });
  if (!row) return false;
  row.querySelector('input[type="checkbox"]').click();
  return true;
}"""


def read_perm_tree(page):
    return page.evaluate(PERM_TREE_READ_JS)


def toggle_perm(page, code):
    ok = page.evaluate(PERM_TREE_TOGGLE_JS, code)
    page.wait_for_timeout(180)
    return ok


def group_state(rows, label):
    for row in rows or []:
        if row["isFolder"] and row["label"] == label:
            return row
    return None


def leaf_state(rows, code):
    for row in rows or []:
        if row["code"] == code:
            return row
    return None


def dump(path, obj):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(obj, str):
        p.write_text(obj, encoding="utf-8")
    else:
        p.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(p)

class StepLog:
    """收集单个功能的步骤证据，落盘为 steps-<feature>.json，最后统一重放进 Recorder。"""

    def __init__(self, feature):
        self.feature = feature
        self.steps = []
        self.counter = 0

    def add(self, title, expected, actual, ok, evidence=""):
        self.counter += 1
        rec = {"n": self.counter, "title": title, "expected": str(expected),
               "actual": str(actual), "ok": bool(ok), "evidence": str(evidence)}
        self.steps.append(rec)
        print("[%s] %s | expected=%s | actual=%s | %s" % (
            "PASS" if ok else "FAIL", title, expected, actual, evidence), flush=True)
        return ok

    def save(self):
        return dump(str(AREA_DIR / ("steps-%s.json" % self.feature)), self.steps)
