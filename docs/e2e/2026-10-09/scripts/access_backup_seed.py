#!/usr/bin/env python3
"""开放接入 + 备份 E2E：准备阶段（REST）。

注册全新账号 e2e-bak-<ts>@example.com -> 从 /tmp/resumate-e2e-mail 取 token 验邮
-> 用该账号建几条自己的数据（profile fact / resume x2 / jd x1）。
**绝不使用 admin 账号做导入。** 所有改动都落在本 area 的 state.json。

注：共享脚手架 e2e_lib.api_login 打的是 POST /login，本实例真实路由是 /auth/login，
所以这里自带 login_cookie（不改共享文件）。
"""
import http.cookiejar
import json
import re
import sys
import time
import urllib.request
from email import message_from_bytes
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import api, API, E2E_DIR

MAIL_DIR = Path("/tmp/resumate-e2e-mail")
AREA = E2E_DIR / "areas" / "access-backup"
AREA.mkdir(parents=True, exist_ok=True)
STATE = AREA / "state.json"

ts = time.strftime("%Y%m%d-%H%M%S")
prefix = "E2E-BAK-" + ts
email = "e2e-bak-%s@example.com" % ts
password = "E2E-bak-Passw0rd!"
display_name = "E2E 备份用户 " + ts


def log(msg):
    print(msg, flush=True)


def login_cookie(email, password):
    """POST /auth/login，返回可放进 Cookie 头的会话串。"""
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


def find_token(email, since):
    deadline = time.time() + 30
    while time.time() < deadline:
        for path in sorted(MAIL_DIR.glob("*.eml")):
            if path.stat().st_mtime < since - 1:
                continue
            raw = path.read_bytes()
            candidates = []
            try:
                msg = message_from_bytes(raw)
                for part in msg.walk():
                    payload = part.get_payload(decode=True)
                    if payload:
                        candidates.append(payload.decode("utf-8", "replace"))
                candidates.append(msg.get("X-Envelope-To", ""))
            except Exception:
                pass
            candidates.append(raw.decode("utf-8", "replace"))
            blob = "\n".join(candidates)
            if email not in blob:
                continue
            match = re.search(r"token=([A-Za-z0-9_\-]+)", blob)
            if match:
                return path, match.group(1), blob
        time.sleep(1)
    return None, None, None


def main():
    started = time.time()
    state = {"ts": ts, "prefix": prefix, "email": email, "password": password,
             "displayName": display_name, "steps": []}

    status, body = api("POST", "/auth/register", body={"email": email, "password": password, "displayName": display_name})
    state["steps"].append({"step": "register", "status": status, "body": body})
    log("register -> %s %s" % (status, body))
    assert status == 202, "注册失败"

    mail_path, token, blob = find_token(email, started)
    state["steps"].append({"step": "mail", "file": str(mail_path) if mail_path else None,
                           "token": token, "blobHead": (blob or "")[:400]})
    log("mail -> %s token=%s" % (mail_path, token))
    assert token, "未在 /tmp/resumate-e2e-mail 找到验证 token"

    status, body = api("POST", "/auth/verification/verify", body={"token": token})
    state["steps"].append({"step": "verify", "status": status, "body": body})
    log("verify -> %s %s" % (status, body))
    assert status == 200, "验邮失败"

    cookie = login_cookie(email, password)
    state["cookie"] = cookie
    status, me = api("GET", "/auth/me", cookie=cookie)
    state["me"] = me
    log("me -> %s %s" % (status, json.dumps(me, ensure_ascii=False)))
    assert status == 200
    state["userId"] = me["id"]

    fact_title = prefix + " 项目事实"
    status, fact = api("POST", "/profile/facts", cookie=cookie, body={
        "type": "project", "title": fact_title,
        "content": "E2E 备份导入导出验证用事实", "tags": ["e2e"], "visibility": "private"})
    state["fact"] = {"status": status, "body": fact}
    log("fact -> %s %s" % (status, json.dumps(fact, ensure_ascii=False)[:300]))
    assert status == 201, "建事实失败"

    resumes = []
    for suffix in ("简历A", "简历B"):
        title = "%s %s" % (prefix, suffix)
        status, resume = api("POST", "/resumes", cookie=cookie, body={
            "title": title, "templateId": "tpl_classic", "targetRole": "前端工程师", "tags": ["e2e"]})
        state.setdefault("resumeResponses", []).append({"status": status, "body": resume})
        log("resume -> %s %s" % (status, json.dumps(resume, ensure_ascii=False)[:240]))
        assert status == 201, "建简历失败"
        resumes.append({"id": resume["id"], "title": resume["title"]})
    state["resumes"] = resumes

    jd_title = prefix + " 岗位"
    status, jd = api("POST", "/jds", cookie=cookie, body={
        "role": jd_title, "company": "E2E 公司", "body": "负责 E2E 备份链路验证。", "tags": ["e2e"]})
    state["jd"] = {"status": status, "body": jd}
    log("jd -> %s %s" % (status, json.dumps(jd, ensure_ascii=False)[:240]))
    assert status == 201, "建岗位失败"

    status, listing = api("GET", "/resumes", cookie=cookie)
    state["resumeCountAfterSeed"] = len(listing) if isinstance(listing, list) else None
    state["resumeListAfterSeed"] = listing
    log("my resumes -> %s count=%s" % (status, state["resumeCountAfterSeed"]))

    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    log("STATE -> %s" % STATE)
    log(json.dumps({k: state[k] for k in ("userId", "email", "prefix", "resumes", "resumeCountAfterSeed")}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
