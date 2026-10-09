import json, urllib.request, urllib.error, http.cookiejar
API="http://127.0.0.1:8000"
jar=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
req=urllib.request.Request(API+"/auth/login", data=json.dumps({"email":"admin@resumate.dev","password":"resumate-admin"}).encode(), headers={"Content-Type":"application/json"}, method="POST")
op.open(req, timeout=30).read()
req=urllib.request.Request(API+"/models/catalog", headers={"Cookie":"; ".join("%s=%s"%(c.name,c.value) for c in jar)})
d=json.loads(urllib.request.urlopen(req, timeout=60).read())
for p in d["providers"]:
    ids=[m["id"] for m in p["models"]]
    print(p["id"], "|", p["label"], "|", len(ids), "models", "|", [i for i in ids if "flash" in i or "deepseek" in i.lower() or "chat" in i.lower()][:8])
    if p["id"]=="deepseek":
        print("  deepseek models:", json.dumps(p["models"], ensure_ascii=False)[:1200])
