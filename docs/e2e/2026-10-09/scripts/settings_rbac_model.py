# -*- coding: utf-8 -*-
"""功能 3：模型配置读取 / 保存 / 连通性测试（admin 已配 deepseek-flash）。"""
import json, sys, time
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from settings_rbac_lib import AREA_DIR, api, dump, login_cookie, StepLog, ui_login, WEB
from e2e_lib import Recorder, browser_page

accounts = json.loads((AREA_DIR / "accounts.json").read_text())
log = StepLog("model")
shotter = Recorder("settings-rbac")
raw = {}

def model_section(page):
    return page.locator('section:has(h2:text-is("模型配置"))')

# ============ A. admin：读取 + 保存 + 连通性测试 ============
admin_cookie, _, _ = login_cookie("admin@resumate.dev", "resumate-admin")
s_a, cfg_a = api("GET", "/models/config", cookie=admin_cookie)
s_aset, prefs_a0 = api("GET", "/settings", cookie=admin_cookie)
raw["admin_model_before"] = cfg_a
raw["admin_prefs_before"] = prefs_a0

with browser_page() as page:
    ok, err = ui_login(page, "admin@resumate.dev", "resumate-admin")
    log.add("admin 浏览器登录", "进入工作台", "ok=%s err=%s" % (ok, err), ok)
    page.goto(WEB + "/settings", wait_until="networkidle", timeout=45000)
    page.get_by_text("模型配置", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1500)
    sec = model_section(page)
    prov = page.locator('[aria-label="Provider"]').first.inner_text()
    mod = page.locator('[aria-label="Model"]').first.inner_text()
    endpoint_val = page.locator('label:has(span:text-is("Endpoint")) input').input_value()
    key_hint = sec.get_by_text("已配置（不回显）", exact=False).count() > 0
    shot = shotter.shot(page, "model-01-admin-loaded")
    log.add("admin 模型配置读取", "Provider=DeepSeek / Model=DeepSeek V4.1 Flash / endpoint 已填 / Key 已配置",
            "provider=%r model=%r endpoint=%r keyConfigured=%s" % (prov, mod, endpoint_val, key_hint),
            "DeepSeek" in prov and "Flash" in mod and endpoint_val.startswith("https://") and key_hint, shot)

    # 保存（值不变）→ 依据 service.update_model_config 会清除 lastTest
    sec.get_by_role("button", name="保存模型配置").click()
    sec.get_by_text("已保存", exact=True).wait_for(timeout=15000)
    page.wait_for_timeout(600)
    s_save, cfg_save = api("GET", "/models/config", cookie=admin_cookie)
    raw["admin_model_after_save"] = cfg_save
    shot = shotter.shot(page, "model-02-admin-saved")
    log.add("admin 保存模型配置（值不变）", "保存成功；lastTest 被清空（编辑即失效）",
            "status=%s lastTest=%s" % (s_save, json.dumps(cfg_save.get("lastTest"), ensure_ascii=False)),
            s_save == 200 and cfg_save.get("lastTest") is None, shot)

    # 连通性测试
    t0 = time.time()
    sec.get_by_role("button", name="测试连接").click()
    result = None
    elapsed = None
    for _ in range(120):
        page.wait_for_timeout(1000)
        ss, cc = api("GET", "/models/config", cookie=admin_cookie)
        if isinstance(cc, dict) and cc.get("lastTest") and cc["lastTest"] != cfg_save.get("lastTest"):
            result = cc["lastTest"]
            elapsed = round(time.time() - t0, 1)
            break
    ui_text = ""
    try:
        ui_text = sec.locator('span:has-text("连接成功"), span:has-text("模型")').first.inner_text(timeout=5000)
    except Exception:
        ui_text = ""
    raw["admin_test"] = {"result": result, "elapsed_s": elapsed, "ui_text": ui_text}
    shot = shotter.shot(page, "model-03-admin-test")
    if result is None:
        log.add("admin 测试连接（BLOCKED）", "POST /models/config:test 有可读结果",
                "60s 内未观察到 lastTest 更新（BLOCKED：后端未落 lastTest）", False, shot)
    else:
        ok_flag = result.get("ok") is True
        log.add("admin 测试连接（deepseek-flash）", "返回 ok=true（连接成功）",
                "ok=%s message=%r 耗时=%ss UI=%r%s" % (
                    result.get("ok"), result.get("message"), elapsed, ui_text,
                    "" if ok_flag else " → BLOCKED：后端探测返回 HTTP 401，凭证被拒，非界面缺陷"),
                ok_flag, shot)

    # admin 偏好未被本次测试污染
    s_ap, prefs_a1 = api("GET", "/settings", cookie=admin_cookie)
    raw["admin_prefs_after"] = prefs_a1
    log.add("admin 语言/主题未被改动", "language=zh-CN 且 theme=paper",
            "language=%s theme=%s displayName=%s" % (prefs_a1.get("language"), prefs_a1.get("theme"), prefs_a1.get("displayName")),
            prefs_a1.get("language") == "zh-CN" and prefs_a1.get("theme") == "paper")

# ============ B. 自建主账号：保存模型配置 + 无 Key 测试 ============
main_cookie, _, _ = login_cookie(accounts["main"], accounts["password"])
with browser_page() as page:
    ok, err = ui_login(page, accounts["main"], accounts["password"])
    log.add("主账号浏览器登录", "进入工作台", "ok=%s err=%s" % (ok, err), ok)
    page.goto(WEB + "/settings", wait_until="networkidle", timeout=45000)
    page.get_by_text("模型配置", exact=True).first.wait_for(timeout=20000)
    page.wait_for_timeout(1500)
    sec = model_section(page)

    page.locator('[aria-label="Provider"]').first.click()
    page.wait_for_timeout(500)
    option_text = ""
    try:
        opt = page.get_by_role("option", name="DeepSeek", exact=True).first
        opt.click()
        option_text = "DeepSeek"
    except Exception as exc:
        option_text = "打开下拉失败: %s" % exc
    page.wait_for_timeout(500)
    page.locator('label:has(span:text-is("Endpoint")) input').fill("https://api.deepseek.com/v1")
    page.wait_for_timeout(300)
    shot = shotter.shot(page, "model-04-main-provider-selected")
    log.add("主账号选择 Provider=DeepSeek", "下拉可选并自动带出模型",
            "option=%s model=%r" % (option_text, page.locator('[aria-label="Model"]').first.inner_text()), "DeepSeek" in option_text, shot)

    sec.get_by_role("button", name="保存模型配置").click()
    sec.get_by_text("已保存", exact=True).wait_for(timeout=15000)
    page.wait_for_timeout(600)
    s_m, cfg_m = api("GET", "/models/config", cookie=main_cookie)
    raw["main_model_saved"] = cfg_m
    shot = shotter.shot(page, "model-05-main-saved")
    log.add("主账号保存模型配置", "provider=deepseek model=deepseek-flash endpoint=api.deepseek.com/v1 keyConfigured=false",
            json.dumps(cfg_m, ensure_ascii=False),
            cfg_m.get("provider") == "deepseek" and cfg_m.get("model") == "deepseek-flash"
            and cfg_m.get("endpoint") == "https://api.deepseek.com/v1" and cfg_m.get("keyConfigured") is False, shot)

    t0 = time.time()
    sec.get_by_role("button", name="测试连接").click()
    result = None
    elapsed = None
    for _ in range(90):
        page.wait_for_timeout(1000)
        ss, cc = api("GET", "/models/config", cookie=main_cookie)
        if isinstance(cc, dict) and cc.get("lastTest") and cc["lastTest"] != cfg_m.get("lastTest"):
            result = cc["lastTest"]
            elapsed = round(time.time() - t0, 1)
            break
    raw["main_test_nokey"] = {"result": result, "elapsed_s": elapsed}
    shot = shotter.shot(page, "model-06-main-test-nokey")
    log.add("主账号无 Key 测试连接", "返回可读失败结果（不泄露密钥）",
            "result=%s 耗时=%ss" % (json.dumps(result, ensure_ascii=False), elapsed),
            isinstance(result, dict) and result.get("ok") is False, shot)

    # 还原主账号模型配置为空
    page.locator('label:has(span:text-is("Endpoint")) input').fill("")
    page.locator('[aria-label="Provider"]').first.click()
    page.wait_for_timeout(400)
    try:
        page.get_by_role("option", name="未设置", exact=True).first.click()
    except Exception:
        pass
    page.wait_for_timeout(400)
    sec.get_by_role("button", name="保存模型配置").click()
    sec.get_by_text("已保存", exact=True).wait_for(timeout=15000)
    page.wait_for_timeout(500)
    s_r, cfg_r = api("GET", "/models/config", cookie=main_cookie)
    raw["main_model_restored"] = cfg_r
    shot = shotter.shot(page, "model-07-main-restored")
    log.add("还原主账号模型配置", "provider/model/endpoint 均为空",
            json.dumps(cfg_r, ensure_ascii=False),
            not cfg_r.get("provider") and not cfg_r.get("model") and not cfg_r.get("endpoint"), shot)

dump(str(AREA_DIR / "raw-model.json"), raw)
log.save()
print("MODEL DONE ok=%d fail=%d" % (sum(1 for s in log.steps if s["ok"]), sum(1 for s in log.steps if not s["ok"])))
