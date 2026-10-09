import json, time, re, glob, os, urllib.request, urllib.error, email, http.cookiejar

API="http://127.0.0.1:8000"
MAIL="/tmp/resumate-e2e-mail"

def api(method, path, cookie=None, body=None):
    h={}; data=None
    if body is not None:
        data=json.dumps(body).encode(); h["Content-Type"]="application/json"
    if cookie: h["Cookie"]=cookie
    req=urllib.request.Request(API+path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, r.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()

ts=int(time.time())
em=f"e2e-settings-rbac-probe-{ts}@example.com"
s,b=api("POST","/auth/register",body={"email":em,"password":"resumate-e2e-pass","display_name":"E2E Probe"})
print("register", s, b)
# find mail
token=None
for _ in range(20):
    for p in sorted(glob.glob(MAIL+"/*.eml")):
        msg=email.message_from_file(open(p, encoding="utf-8"))
        if em in (msg.get("To") or ""):
            body_txt=""
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type()=="text/plain":
                        body_txt=part.get_payload(decode=True).decode("utf-8","replace")
            else:
                body_txt=msg.get_payload(decode=True).decode("utf-8","replace")
            m=re.search(r"token=([A-Za-z0-9_\-]+)", body_txt)
            if m: token=m.group(1); print("mail file:", os.path.basename(p)); break
    if token: break
    time.sleep(0.5)
print("token:", token)
if token:
    s,b=api("POST","/auth/verification/verify",body={"token":token})
    print("verify", s, b[:400])
