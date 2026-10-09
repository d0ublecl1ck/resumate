#!/usr/bin/env python3
import sys
ROOT = "<本机用户名>/resumate-worktrees/zj-fwwb-2026"
sys.path.insert(0, ROOT + "/docs/e2e/2026-10-09/scripts")
from e2e_lib import api
from jd_profile_common import login_cookie
cookie = login_cookie()
s, jds = api("GET", "/jds", cookie=cookie)
for j in (jds if isinstance(jds, list) else []):
    if str(j.get("role","")).startswith("e2e-jd-profile-"):
        print("DEL jd", j["id"], api("DELETE", "/jds/%s" % j["id"], cookie=cookie)[0])
s, rs = api("GET", "/resumes", cookie=cookie)
for r in (rs if isinstance(rs, list) else []):
    if str(r.get("title","")).startswith("e2e-jd-profile-"):
        print("DEL resume", r["id"], api("DELETE", "/resumes/%s" % r["id"], cookie=cookie)[0])
s, prof = api("GET", "/profile", cookie=cookie)
for fct in (prof.get("facts", []) if isinstance(prof, dict) else []):
    if str(fct.get("title","")).startswith("e2e-jd-profile-"):
        print("DEL fact", fct["id"], api("DELETE", "/profile/facts/%s" % fct["id"], cookie=cookie)[0])
print("cleanup done")
