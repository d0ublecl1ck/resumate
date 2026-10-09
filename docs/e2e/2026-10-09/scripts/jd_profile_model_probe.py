
import json, sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from e2e_lib import api
import http.cookiejar, urllib.request
def login_cookie(email, password):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request("http://127.0.0.1:8000/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with opener.open(req, timeout=30) as resp: resp.read()
    return "; ".join("%s=%s" % (c.name, c.value) for c in jar)
cookie = login_cookie("admin@resumate.dev", "resumate-admin")
for path in ["/models/config", "/settings", "/agent/config"]:
    s, b = api("GET", path, cookie=cookie)
    print("### GET", path, "->", s)
    print(json.dumps(b, ensure_ascii=False, indent=2)[:3000])
