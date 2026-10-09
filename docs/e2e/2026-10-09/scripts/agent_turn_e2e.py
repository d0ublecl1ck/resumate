#!/usr/bin/env python3
"""Agent 轮次 E2E：真实 CLI 轮次 -> patch 校验/预览 Diff/未审批 409/approve/apply/幂等重放/finalize + SSE。"""
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import Recorder, api, api_login

TS = time.strftime("%m%d-%H%M%S")
rec = Recorder("agent-turn")
raw_dir = rec.dir / "raw"
raw_dir.mkdir(exist_ok=True)
cookie = api_login("admin@resumate.dev", "resumate-admin")


def dump(name, obj):
    (raw_dir / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


status, tpl = api("GET", "/templates", cookie=cookie)
resume = api("POST", "/resumes", cookie=cookie,
             body={"title": "e2e-run-%s" % TS, "templateId": tpl[0]["id"], "targetRole": "E2E"})[1]
rid = resume["id"]
doc = {
    "basics": {"fullName": "E2E 运行者", "headline": "前端工程师", "email": "e2e@example.com", "phone": "", "location": "上海", "links": []},
    "sections": [
        {"id": "sec_sum_e2e", "kind": "summary", "title": "个人简介", "text": "初始简介", "entries": []},
        {"id": "sec_exp_e2e", "kind": "experience", "title": "工作经历",
         "entries": [{"id": "entry_e2e_1", "title": "高级前端工程师", "period": "2021-2024", "bullets": ["要点一"]}]},
    ],
}
st, res2 = api("PUT", "/resumes/%s/document" % rid, cookie=cookie,
               body={"document": doc, "baseVersionId": resume["currentVersionId"], "message": "E2E 初始文档"})
base_version = res2["currentVersionId"]
rec.step("准备：带章节的简历", "200", "status=%s resume=%s base=%s" % (st, rid, base_version), st == 200)

# ---------------- Phase 1：真实轮次（真实模型凭证） ----------------
st, run = api("POST", "/resumes/%s/runs" % rid, cookie=cookie,
              body={"prompt": "把我的个人简介改成一句话，突出性能优化经验"})
dump("01-run-start.json", {"status": st, "body": run})
rec.step("P1 发起真实 Agent 轮次", "202 run_id",
         "status=%s body=%s" % (st, json.dumps(run, ensure_ascii=False)[:200]), st == 202)
turn = None
if st == 202:
    deadline = time.time() + 90
    while time.time() < deadline:
        time.sleep(3)
        stt, turns = api("GET", "/resumes/%s/turns" % rid, cookie=cookie)
        if isinstance(turns, list) and turns and turns[0].get("state") in ("finalized", "closed", "failed", "cancelled"):
            turn = turns[0]
            break
        if isinstance(turns, list) and turns:
            turn = turns[0]
    dump("02-run-turn.json", turn)
    state = (turn or {}).get("state")
    result = (turn or {}).get("result")
    rec.step("P1 轮次结束状态", "能拿到结束状态（真实模型凭证可用时应产生 Diff）",
             "state=%s result=%s" % (state, json.dumps(result, ensure_ascii=False)[:300] if result else None),
             state in ("finalized", "closed", "failed", "cancelled"),
             str(raw_dir / "02-run-turn.json"))

# ---------------- Phase 2：patch 全链路（真实 HTTP 契约） ----------------
st, t2 = api("POST", "/turns", cookie=cookie,
             body={"scope": "resume", "resumeId": rid, "executionMode": "approval", "message": "E2E 补丁链路"})
dump("03-turn-create.json", {"status": st, "body": t2})
turn_id = t2.get("id") if isinstance(t2, dict) else None
rec.step("P2 创建轮次（审批模式）", "201 且 executionMode=approval",
         "status=%s id=%s mode=%s" % (st, turn_id, (t2 or {}).get("executionMode")), st == 201 and (t2 or {}).get("executionMode") == "approval")

bad = [{"op": "upsertEntry", "sectionId": "sec_missing", "entry": {"id": "e1", "title": "x", "bullets": []}}]
st, val = api("POST", "/turns/%s/patches:validate" % turn_id, cookie=cookie, body={"ops": bad, "reason": "坏补丁"})
dump("04-validate-bad.json", {"status": st, "body": val})
rec.step("P2 非法补丁校验", "valid=false 且带错误码",
         "status=%s %s" % (st, json.dumps(val, ensure_ascii=False)[:200]), st == 200 and val.get("valid") is False and val.get("errors"))

REASON = "E2E 预览"
good = [{"op": "upsertEntry", "sectionId": "sec_exp_e2e",
         "entry": {"id": "entry_e2e_1", "title": "高级前端工程师（E2E 修订）", "period": "2021-2024",
                   "bullets": ["要点一", "E2E 新增要点：首屏 LCP 优化至 1.2s"]}}]
st, pv = api("POST", "/turns/%s/patches:preview" % turn_id, cookie=cookie,
             body={"ops": good, "reason": REASON, "baseVersionId": base_version})
dump("05-preview.json", {"status": st, "body": pv})
diff_n = len((pv or {}).get("diff") or [])
action_id = (pv or {}).get("pendingActionId") or (pv or {}).get("pending_action_id")
rec.step("P2 preview 生成 Diff 与待办", "valid=true + diff 非空 + 审批模式下有待办",
         "status=%s valid=%s diff=%d pendingAction=%s requiresConfirmation=%s" % (
             st, (pv or {}).get("valid"), diff_n, action_id, (pv or {}).get("requiresConfirmation")),
         st == 200 and (pv or {}).get("valid") and diff_n >= 1 and bool(action_id),
         str(raw_dir / "05-preview.json"))

st, ap409 = api("POST", "/turns/%s/patches:apply" % turn_id, cookie=cookie,
                body={"ops": good, "reason": REASON, "baseVersionId": base_version})
dump("06-apply-unapproved.json", {"status": st, "body": ap409})
rec.step("P2 未审批 apply 被拒", "409 PENDING_ACTION_NOT_APPROVED",
         "status=%s body=%s" % (st, json.dumps(ap409, ensure_ascii=False)[:200]),
         st == 409 and ap409.get("code") == "PENDING_ACTION_NOT_APPROVED", str(raw_dir / "06-apply-unapproved.json"))


if action_id:
    st, dec = api("POST", "/pending-actions/%s/approve" % action_id, cookie=cookie, body={})
    dump("07-approve.json", {"status": st, "body": dec})
    rec.step("P2 审批待办", "200 state=approved",
             "status=%s state=%s" % (st, (dec or {}).get("state")), st == 200 and (dec or {}).get("state") in ("approved", "consumed"))

st, tamper = api("POST", "/turns/%s/patches:apply" % turn_id, cookie=cookie,
                 body={"ops": good, "reason": "被篡改的理由", "baseVersionId": base_version, "pendingActionId": action_id})
dump("06b-apply-tampered.json", {"status": st, "body": tamper})
rec.step("P2 审批后内容被篡改的 apply 被拒", "409 PENDING_ACTION_STALE（防篡改）",
         "status=%s body=%s" % (st, json.dumps(tamper, ensure_ascii=False)[:160]),
         st == 409 and tamper.get("code") == "PENDING_ACTION_STALE", str(raw_dir / "06b-apply-tampered.json"))

# 篡改会让待办失效，必须重新预览并审批
st, pv2 = api("POST", "/turns/%s/patches:preview" % turn_id, cookie=cookie,
              body={"ops": good, "reason": REASON, "baseVersionId": base_version})
action_id = (pv2 or {}).get("pendingActionId")
st, dec2 = api("POST", "/pending-actions/%s/approve" % action_id, cookie=cookie, body={})
dump("06c-repreview-approve.json", {"preview": pv2, "approve": dec2})

st, ap = api("POST", "/turns/%s/patches:apply" % turn_id, cookie=cookie,
             body={"ops": good, "reason": REASON, "baseVersionId": base_version,
                   "pendingActionId": action_id, "idempotencyKey": "e2e-apply-%s" % TS})
dump("08-apply.json", {"status": st, "body": ap})
rec.step("P2 审批后 apply", "200 applied=true 且 working_revision>=1",
         "status=%s applied=%s rev=%s sections=%s" % (st, (ap or {}).get("applied"), (ap or {}).get("workingRevision"), (ap or {}).get("affectedSections")),
         st == 200 and (ap or {}).get("applied") is True, str(raw_dir / "08-apply.json"))

st, ap2 = api("POST", "/turns/%s/patches:apply" % turn_id, cookie=cookie,
              body={"ops": good, "reason": REASON, "baseVersionId": base_version,
                    "pendingActionId": action_id, "idempotencyKey": "e2e-apply-%s" % TS})
dump("09-apply-replay.json", {"status": st, "body": ap2})
rec.step("P2 同 idempotencyKey 重放", "200 idempotent_replay=true 且 revision 不变",
         "status=%s replay=%s rev=%s" % (st, (ap2 or {}).get("idempotentReplay"), (ap2 or {}).get("workingRevision")),
         st == 200 and (ap2 or {}).get("idempotentReplay") is True and (ap2 or {}).get("workingRevision") == (ap or {}).get("workingRevision"),
         str(raw_dir / "09-apply-replay.json"))

st, wd = api("GET", "/resumes/%s/working-document" % rid, cookie=cookie)
dump("10-working-document.json", {"status": st, "body": wd})
title = ""
for sec in ((wd or {}).get("document") or {}).get("sections", []):
    for e in sec.get("entries", []):
        if e.get("id") == "entry_e2e_1":
            title = e.get("title")
rec.step("P2 工作副本已更新", "working-document 含 E2E 修订标题",
         "status=%s dirty=%s rev=%s title=%s" % (st, (wd or {}).get("dirty"), (wd or {}).get("workingRevision"), title),
         "E2E 修订" in title, str(raw_dir / "10-working-document.json"))

st, fin = api("POST", "/turns/%s/finalize" % turn_id, cookie=cookie,
              body={"message": "E2E finalize", "idempotencyKey": "e2e-fin-%s" % TS})
dump("11-finalize.json", {"status": st, "body": fin})
st_v, versions = api("GET", "/resumes/%s/versions" % rid, cookie=cookie)
agent_versions = [v for v in (versions or []) if v.get("source") == "agent"]
rec.step("P2 finalize 落成 agent 版本", "200 且新增 source=agent 版本",
         "status=%s agent_versions=%d messages=%s" % (st, len(agent_versions), [v.get("message") for v in (versions or [])]),
         st == 200 and len(agent_versions) >= 1, str(raw_dir / "11-finalize.json"))

st, fin2 = api("POST", "/turns/%s/finalize" % turn_id, cookie=cookie,
               body={"message": "E2E finalize", "idempotencyKey": "e2e-fin-%s" % TS})
st_v2, versions2 = api("GET", "/resumes/%s/versions" % rid, cookie=cookie)
rec.step("P2 finalize 幂等重放", "同 key 重放不新增版本",
         "status=%s versions_before=%d versions_after=%d" % (st, len(versions or []), len(versions2 or [])),
         len(versions2 or []) == len(versions or []), str(raw_dir / "11-finalize.json"))

# ---------------- Phase 3：SSE ----------------
sse_out = raw_dir / "12-sse.txt"
cmd = ["curl", "-sS", "-N", "--max-time", "19", "-H", "Cookie: %s" % cookie,
       "http://127.0.0.1:8000/turns/%s/events" % turn_id]
t0 = time.time()
proc = subprocess.run(cmd, capture_output=True, text=True)
elapsed = round(time.time() - t0, 1)
sse_out.write_text(proc.stdout, encoding="utf-8")
first_frame_at = None
for line in proc.stdout.splitlines():
    if line.startswith("event:"):
        break
events = [l for l in proc.stdout.splitlines() if l.startswith("event:")]
heartbeats = [l for l in proc.stdout.splitlines() if "heartbeat" in l]
rec.step("P3 SSE 首帧与心跳", "连接后立即有 event 帧，长连期间有心跳帧",
         "耗时=%ss events=%s heartbeats=%d head=%s" % (elapsed, events[:4], len(heartbeats), proc.stdout[:160].replace(chr(10), " | ")),
         len(events) >= 1, str(sse_out))

print(rec.write("简历 id：%s / turn id：%s" % (rid, turn_id)))