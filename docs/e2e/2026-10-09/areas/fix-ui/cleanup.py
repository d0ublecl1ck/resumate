import sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from e2e_lib import api, api_login
cookie = api_login("admin@resumate.dev", "resumate-admin")
removed = []
for r in api("GET", "/resumes", cookie=cookie)[1]:
    if r["title"].startswith("e2e-fixui-"):
        api("DELETE", "/resumes/%s" % r["id"], cookie=cookie); removed.append("res:" + r["title"])
for j in api("GET", "/jds", cookie=cookie)[1]:
    if j["role"].startswith("e2e-fixui-"):
        api("DELETE", "/jds/%s" % j["id"], cookie=cookie); removed.append("jd:" + j["role"])
for f in api("GET", "/profile/facts", cookie=cookie)[1]:
    if f["title"].startswith("e2e-fixui-"):
        api("DELETE", "/profile/facts/%s" % f["id"], cookie=cookie); removed.append("fact:" + f["title"])
print("removed", removed)
