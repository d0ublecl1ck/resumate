import json, sys, urllib.request, urllib.error, http.cookiejar

API = "http://127.0.0.1:8000"

def login_cookie(email, password):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(API + "/auth/login", data=json.dumps({"email": email, "password": password}).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with opener.open(req, timeout=30) as resp:
        body = json.loads(resp.read().decode())
    return "; ".join("%s=%s" % (c.name, c.value) for c in jar), body

def api(method, path, cookie=None, body=None):
    h = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode(); h["Content-Type"]="application/json"
    if cookie: h["Cookie"]=cookie
    req = urllib.request.Request(API+path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

cookie, me = login_cookie("admin@resumate.dev", "resumate-admin")
print("LOGIN OK, me.role=", me.get("role"), "perms:", len(me.get("permissions", [])))
for path in ["/settings", "/agent/config", "/models/config"]:
    s, b = api("GET", path, cookie)
    print("\n===", path, s, "===")
    print(json.dumps(json.loads(b), ensure_ascii=False, indent=1)[:1500])
s, b = api("GET", "/auth/roles", cookie)
print("\n=== /auth/roles", s, "===")
print(json.dumps(json.loads(b), ensure_ascii=False, indent=1)[:3000])
s, b = api("GET", "/auth/users", cookie)
print("\n=== /auth/users", s, "===")
print(b[:2000])
