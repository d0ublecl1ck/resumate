#!/usr/bin/env python3
"""jd-profile REST 预检：解析模型、绑定、匹配、事实删除影响。只读/准备性质，不做源码改动。"""
import json, sys, time
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from e2e_lib import api

TS = time.strftime("%Y%m%d-%H%M%S")
PREFIX = "e2e-jd-profile-" + TS
print("PREFIX", PREFIX)

def login_cookie(email, password):
    import http.cookiejar, urllib.request
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request("http://127.0.0.1:8000/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with opener.open(req, timeout=30) as resp:
        print("LOGIN", resp.status, resp.read().decode()[:200])
    return "; ".join("%s=%s" % (c.name, c.value) for c in jar)

cookie = login_cookie("admin@resumate.dev", "resumate-admin")

def show(label, status, body):
    print("\n### %s -> %s" % (label, status))
    print(json.dumps(body, ensure_ascii=False, indent=2) if not isinstance(body, str) else body[:2000])

show("POST /jds:parse-text", *api("POST", "/jds:parse-text", cookie=cookie, body={
    "text": "岗位：高级前端工程师\n公司：星辰科技有限公司\n职责：负责 C 端核心页面开发，主导性能优化；参与前端工程化。\n要求：5 年以上经验，精通 React 与 TypeScript。"
}))

s, jd = api("POST", "/jds", cookie=cookie, body={
    "role": PREFIX + "-角色", "company": PREFIX + "-公司",
    "body": PREFIX + " 正文：负责核心系统开发。", "tags": [PREFIX + "-tag"]})
show("POST /jds", s, jd)
jd_id = jd.get("id") if isinstance(jd, dict) else None
print("JD_ID", jd_id)

s, resumes = api("GET", "/resumes", cookie=cookie)
show("GET /resumes", s, resumes if not isinstance(resumes, list) else [{"id": r.get("id"), "title": r.get("title")} for r in resumes])
rid = resumes[0]["id"] if isinstance(resumes, list) and resumes else None
print("RESUME_ID", rid)
if jd_id and rid:
    show("PUT /jds/{id}/binding", *api("PUT", "/jds/%s/binding" % jd_id, cookie=cookie, body={"resume_id": rid}))
    show("DELETE /jds/{id}/binding", *api("DELETE", "/jds/%s/binding" % jd_id, cookie=cookie))

show("POST /profile/match-job", *api("POST", "/profile/match-job", cookie=cookie, body={"jdId": jd_id}))

s, fact = api("POST", "/profile/facts", cookie=cookie, body={
    "type": "skill", "title": PREFIX + "-事实", "content": PREFIX + "-内容",
    "tags": [], "visibility": "private", "evidence": {"status": "unverified"}})
show("POST /profile/facts", s, fact)
fid = fact.get("id") if isinstance(fact, dict) else None
print("FACT_ID", fid)
if fid:
    show("DELETE /profile/facts/{id}", *api("DELETE", "/profile/facts/%s" % fid, cookie=cookie))
    show("GET /profile/facts/{id} after delete", *api("GET", "/profile/facts/%s" % fid, cookie=cookie))

if jd_id:
    print("\nCLEANUP delete jd", api("DELETE", "/jds/%s" % jd_id, cookie=cookie)[0])
