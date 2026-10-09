# -*- coding: utf-8 -*-
"""功能 2：Agent 配置 nextRunMode / budget 保存与非法值校验。"""
import json, sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from settings_rbac_lib import AREA_DIR, api, dump, login_cookie, StepLog, ui_login, WEB
from e2e_lib import Recorder, browser_page

accounts = json.loads((AREA_DIR / "accounts.json").read_text())
EMAIL, PWD = accounts["main"], accounts["password"]
log = StepLog("agent")
shotter = Recorder("settings-rbac")
raw = {}

cookie, _, st = login_cookie(EMAIL, PWD)

def agent_section(page):
    return page.locator('section:has(h2:text-is("Agent 运行模式"))')

def budget_input(page, label):
    return page.locator('label:has(span:text-is("%s")) input' % label)

with browser_page() as page:
    ok, err = ui_login(page, EMAIL, PWD)
    log.add("浏览器登录主账号", "进入工作台", "ok=%s err=%s" % (ok, err), ok)
    page.goto(WEB + "/settings", wait_until="networkidle", timeout=45000)
    page.get_by_text("Agent 运行模式", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1200)

    s0, cfg0 = api("GET", "/agent/config", cookie=cookie)
    raw["agent_before"] = cfg0
    log.add("读取 Agent 配置（初始）", "nextRunMode=approval, budget=20000/8/0.5",
            "status=%s %s" % (s0, json.dumps(cfg0, ensure_ascii=False)),
            cfg0.get("nextRunMode") == "approval" and cfg0["budget"] == {"maxTokens": 20000, "maxTurns": 8, "maxCostUsd": 0.5})

    full_btn = page.get_by_role("button", name="Full Access", exact=True)
    approval_btn = page.get_by_role("button", name="Approval 逐项确认", exact=True)
    page.wait_for_timeout(200)
    log.add("默认选中 Approval 模式", "Approval 按钮 aria-pressed=true, Full Access=false",
            "approval=%s full=%s" % (approval_btn.get_attribute("aria-pressed"), full_btn.get_attribute("aria-pressed")),
            approval_btn.get_attribute("aria-pressed") == "true" and full_btn.get_attribute("aria-pressed") == "false")

    full_btn.click()
    page.wait_for_timeout(400)
    notice_visible = page.get_by_text("Full Access 免确认范围：", exact=False).count() > 0
    shot = shotter.shot(page, "agent-01-full-access-selected")
    log.add("切换到 Full Access", "按钮 aria-pressed 翻转且出现免确认范围说明",
            "full=%s notice=%s" % (full_btn.get_attribute("aria-pressed"), notice_visible),
            full_btn.get_attribute("aria-pressed") == "true" and notice_visible, shot)

    budget_input(page, "Token 预算上限").fill("50000")
    budget_input(page, "最大轮次").fill("12")
    budget_input(page, "成本上限（USD）").fill("2.5")
    page.wait_for_timeout(200)
    agent_section(page).get_by_role("button", name="保存 Agent 配置").click()
    agent_section(page).get_by_text("已保存", exact=True).wait_for(timeout=15000)
    page.wait_for_timeout(600)
    shot = shotter.shot(page, "agent-02-saved")
    log.add("保存 Agent 配置（full_access, 50000/12/2.5）", "出现「已保存」", "已出现「已保存」", True, shot)

    s1, cfg1 = api("GET", "/agent/config", cookie=cookie)
    raw["agent_after_save"] = cfg1
    ok = cfg1.get("nextRunMode") == "full_access" and cfg1["budget"] == {"maxTokens": 50000, "maxTurns": 12, "maxCostUsd": 2.5}
    log.add("REST 交叉验证 GET /agent/config", "full_access, 50000/12/2.5", json.dumps(cfg1, ensure_ascii=False), ok,
            "areas/settings-rbac/raw-agent.json")

    page.reload(wait_until="networkidle")
    page.get_by_text("Agent 运行模式", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1500)
    full_btn = page.get_by_role("button", name="Full Access", exact=True)
    vals = (budget_input(page, "Token 预算上限").input_value(),
            budget_input(page, "最大轮次").input_value(),
            budget_input(page, "成本上限（USD）").input_value())
    shot = shotter.shot(page, "agent-03-after-reload")
    ok = full_btn.get_attribute("aria-pressed") == "true" and vals == ("50000", "12", "2.5")
    log.add("刷新后 Agent 配置回显", "Full Access 选中且 50000/12/2.5",
            "full=%s budget=%s" % (full_btn.get_attribute("aria-pressed"), vals), ok, shot)

    # --- 非法值校验 ---
    cases = [("Token 预算上限", "0", {"maxTokens": 0, "maxTurns": 12, "maxCostUsd": 2.5}),
             ("最大轮次", "101", {"maxTokens": 50000, "maxTurns": 101, "maxCostUsd": 2.5}),
             ("成本上限（USD）", "-1", {"maxTokens": 50000, "maxTurns": 12, "maxCostUsd": -1})]
    for label, bad, payload in cases:
        budget_input(page, label).fill(bad)
        page.wait_for_timeout(150)
        agent_section(page).get_by_role("button", name="保存 Agent 配置").click()
        page.wait_for_timeout(1200)
        err_text = ""
        try:
            err_text = agent_section(page).locator('span:has-text("请求参数校验失败")').first.inner_text(timeout=5000)
        except Exception:
            err_text = "[未出现错误提示]"
        shot = shotter.shot(page, "agent-04-invalid-%s" % bad.replace("-", "neg"))
        rs, rb = api("PATCH", "/agent/config", cookie=cookie, body={"budget": payload})
        raw["invalid_%s" % bad] = {"ui_text": err_text, "rest_status": rs, "rest_body": rb}
        log.add("非法 %s=%s 校验" % (label, bad), "后端 422 且界面显示中文校验文案",
                "UI=%r REST=%s %s" % (err_text, rs, json.dumps(rb, ensure_ascii=False)),
                rs == 422 and "请求参数校验失败" in err_text, shot)
        # 还原该字段
        budget_input(page, label).fill({"Token 预算上限": "50000", "最大轮次": "12", "成本上限（USD）": "2.5"}[label])
        page.wait_for_timeout(150)

    # --- 还原默认 ---
    page.get_by_role("button", name="Approval 逐项确认", exact=True).click()
    budget_input(page, "Token 预算上限").fill("20000")
    budget_input(page, "最大轮次").fill("8")
    budget_input(page, "成本上限（USD）").fill("0.5")
    agent_section(page).get_by_role("button", name="保存 Agent 配置").click()
    agent_section(page).get_by_text("已保存", exact=True).wait_for(timeout=15000)
    page.wait_for_timeout(500)
    s2, cfg2 = api("GET", "/agent/config", cookie=cookie)
    raw["agent_restored"] = cfg2
    shot = shotter.shot(page, "agent-05-restored")
    log.add("还原 Agent 配置为默认", "approval, 20000/8/0.5",
            json.dumps(cfg2, ensure_ascii=False),
            cfg2.get("nextRunMode") == "approval" and cfg2["budget"] == {"maxTokens": 20000, "maxTurns": 8, "maxCostUsd": 0.5}, shot)

dump(str(AREA_DIR / "raw-agent.json"), raw)
log.save()
print("AGENT DONE ok=%d fail=%d" % (sum(1 for s in log.steps if s["ok"]), sum(1 for s in log.steps if not s["ok"])))
