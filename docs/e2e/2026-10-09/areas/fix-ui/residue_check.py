import sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from e2e_lib import api, api_login
cookie = api_login("admin@resumate.dev", "resumate-admin")
res = [r["title"] for r in api("GET", "/resumes", cookie=cookie)[1] if r["title"].startswith("e2e-fixui-")]
jds = [j["role"] for j in api("GET", "/jds", cookie=cookie)[1] if j["role"].startswith("e2e-fixui-")]
facts = [f["title"] for f in api("GET", "/profile/facts", cookie=cookie)[1] if f["title"].startswith("e2e-fixui-")]
print("residue:", res, jds, facts)
