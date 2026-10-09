import json, sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from settings_rbac_lib import api, login_cookie
cookie, me, st = login_cookie("admin@resumate.dev", "resumate-admin")
s, b = api("GET", "/templates", cookie=cookie)
print("templates", s)
if isinstance(b, list):
    for t in b[:10]:
        print(t.get("id"), "|", t.get("name"), "|", t.get("status"))
else:
    print(b)
