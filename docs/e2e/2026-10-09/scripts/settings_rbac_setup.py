import json, sys, time
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from settings_rbac_lib import api, login_cookie, register_and_verify, dump, AREA_DIR

PASSWORD = "ResumateE2e!2026"
ts = int(time.time())
accounts = {
    "password": PASSWORD,
    "ts": ts,
    "main": f"e2e-settings-rbac-main-{ts}@example.com",
    "good": f"e2e-settings-rbac-good-{ts}@example.com",
    "admin2": f"e2e-settings-rbac-admin2-{ts}@example.com",
    "names": {"main": "E2E 主账号", "good": "E2E 被管账号", "admin2": "E2E 二级管理员"},
}

log = []
for key in ("main", "good", "admin2"):
    user, steps = register_and_verify(accounts[key], PASSWORD, accounts["names"][key])
    log.append({"key": key, "email": accounts[key], "user": user, "steps": steps})
    print(key, "->", None if not user else (user.get("id"), user.get("role")))

# 超管登录，把 admin2 提升为 admin
cookie, me, st = login_cookie("admin@resumate.dev", "resumate-admin")
print("super_admin login:", st, me.get("role"))
admin2_user = next((l["user"] for l in log if l["key"] == "admin2"), None)
admin2_id = admin2_user["id"]
s, b = api("POST", f"/auth/users/{admin2_id}/role", cookie=cookie, body={"role": "admin"})
log.append({"call": "promote admin2", "status": s, "body": b})
print("promote admin2:", s, b if isinstance(b, str) else (b.get("role"), b.get("roles")))

accounts["ids"] = {l["key"]: l["user"]["id"] for l in log if l.get("user")}
dump(str(AREA_DIR / "accounts.json"), accounts)
dump(str(AREA_DIR / "raw-setup.json"), log)
print("accounts saved")
