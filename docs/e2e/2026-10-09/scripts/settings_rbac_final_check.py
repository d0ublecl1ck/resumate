import json, sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from settings_rbac_lib import api, login_cookie, AREA_DIR
root, _, _ = login_cookie("admin@resumate.dev", "resumate-admin")
print("admin /settings:", json.dumps(api("GET","/settings",cookie=root)[1], ensure_ascii=False))
print("admin /models/config:", json.dumps(api("GET","/models/config",cookie=root)[1], ensure_ascii=False))
print("admin /agent/config:", json.dumps(api("GET","/agent/config",cookie=root)[1], ensure_ascii=False))
_, roles = api("GET","/auth/roles",cookie=root)
print("roles:", [(r["code"], r["isSystem"]) for r in roles])
accounts = json.loads((AREA_DIR/"accounts.json").read_text())
for k in ("main","good","admin2"):
    _, b = api("GET","/auth/users",cookie=root)
    u = next((x for x in b if x["email"]==accounts[k]), None)
    print(k, u["role"], "banned=", u["isBanned"], "perms=", len(u["permissions"]))
cm, _, _ = login_cookie(accounts["main"], accounts["password"])
print("main /settings:", json.dumps({x: api("GET","/settings",cookie=cm)[1][x] for x in ("theme","language","autosave","autosaveIntervalSeconds","defaultTemplateId")}, ensure_ascii=False))
print("main /models/config:", json.dumps(api("GET","/models/config",cookie=cm)[1], ensure_ascii=False))
