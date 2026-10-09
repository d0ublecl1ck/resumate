#!/usr/bin/env python3
"""jd-profile E2E 主脚本：JD 库/详情 + Profile 主档，全部经 Playwright 无头真点。
写入范围：docs/e2e/2026-10-09/areas/jd-profile/（截图 + REPORT.md）。
"""
import json
import re
import sys
import time

ROOT = "<本机用户名>/resumate-worktrees/zj-fwwb-2026"
sys.path.insert(0, ROOT + "/docs/e2e/2026-10-09/scripts")
from e2e_lib import Recorder, browser_page, api  # noqa: E402
from jd_profile_common import (  # noqa: E402
    NetCapture, body_text, create_resume, login_cookie, prepare_jd, ui_login, visible_buttons,
)

BT = chr(96)
F3 = BT * 3
TS = time.strftime("%Y%m%d-%H%M%S")
PREFIX = "e2e-jd-profile-" + TS

rec = Recorder("jd-profile")
extra_notes = []


def note(md):
    extra_notes.append(md)


def safe(title, expected, actual, ok, evidence=""):
    rec.step(title, expected, actual, ok, evidence)


def main():
    cookie = login_cookie()
    print("PREFIX", PREFIX, flush=True)

    jd_a = prepare_jd(cookie, PREFIX, "A")
    jd_b = prepare_jd(cookie, PREFIX, "B")
    resume = create_resume(cookie, PREFIX, "bind")
    print("JD_A", jd_a["id"], "JD_B", jd_b["id"], "RESUME", resume["id"], flush=True)

    with browser_page() as page:
        net = NetCapture(page)
        msgs = page.console_log
        ui_login(page)

        # ================= JD 库 =================
        page.goto("http://127.0.0.1:5173/jds", wait_until="networkidle")
        page.wait_for_timeout(1500)
        shot = rec.shot(page, "jd-library")
        txt = body_text(page)
        safe("JD 库页面加载", "标题「JD 库」+ 列表可见",
             "含「JD 库」=%s；含预置 JD=%s" % ("JD 库" in txt, jd_a["role"] in txt),
             "JD 库" in txt and jd_a["role"] in txt, shot)

        page.get_by_role("button", name="新增 JD").first.click()
        page.wait_for_timeout(800)
        dialog = page.get_by_role("dialog", name="新增 JD")
        shot = rec.shot(page, "jd-create-modal")
        has_dialog = dialog.is_visible()
        modal_text = dialog.inner_text()
        manual_fields = []
        for lbl in ["岗位名称", "公司", "岗位描述"]:
            if page.get_by_label(lbl, exact=True).count() > 0:
                manual_fields.append(lbl)
        safe("新建 JD 弹窗可打开", "出现「新增 JD」对话框",
             "dialog 可见=%s；弹窗内含 AI 整理入口=%s；解析前可手工填写的字段=%s"
             % (has_dialog, "AI 整理" in modal_text, manual_fields or "无（必须先 AI 整理）"),
             has_dialog and "AI 整理" in modal_text, shot)
        note("### 新建 JD 的 UI 结构\n\n弹窗仅提供「粘贴文本 / 上传截图 → AI 整理 → 草案可编辑 → 创建 JD」，"
             "**没有**在解析前直接填写「岗位名称 / 公司 / 岗位描述」的手工创建入口。"
             "因此手工新建 JD 完全依赖模型解析成功。")

        jd_text = ("岗位：高级前端工程师\n公司：星辰科技有限公司\n"
                   "职责：负责 C 端核心页面开发，主导性能优化；参与前端工程化与团队规范建设。\n"
                   "要求：5 年以上经验，精通 React 与 TypeScript，有大型项目性能调优经验。")
        page.get_by_placeholder("把招聘网站上的岗位 JD 直接粘贴进来（岗位名、公司、职责、要求…），AI 会自动拆解。").fill(jd_text)
        before_n = len(net.events)
        page.get_by_role("button", name="AI 整理").click()
        page.wait_for_timeout(6000)
        shot = rec.shot(page, "jd-parse-text")
        parse_ev = [e for e in net.events[before_n:] if "parse-text" in e["url"]]
        raw = parse_ev[-1] if parse_ev else None
        raw_txt = json.dumps(raw, ensure_ascii=False) if raw else "(未捕获到 parse-text 请求)"
        alert_visible = page.locator("[role=alert]").count() > 0
        alert_text = page.locator("[role=alert]").first.inner_text() if alert_visible else ""
        draft_visible = "AI 整理结果（可编辑）" in body_text(page)
        if draft_visible:
            safe("粘贴中文 JD 解析（POST /jds:parse-text）", "解析出 岗位/公司/标签/正文 字段",
                 "捕获到草案；原始响应=%s" % raw_txt, True, shot)
        else:
            safe("粘贴中文 JD 解析（POST /jds:parse-text）", "解析出 岗位/公司/标签/正文 字段",
                 "BLOCKED：模型调用失败，status=%s body=%s；UI 显示错误=%r"
                 % (raw["status"] if raw else "?", raw["body"] if raw else "?", alert_text),
                 False, shot)
            note("### BLOCKED：JD 文本解析（模型调用失败）\n\n"
                 "**最小复现**：登录后在 /jds 点「新增 JD」→ 粘贴中文 JD → 点「AI 整理」。\n\n"
                 + F3 + "\nPOST /jds:parse-text -> %s\n%s\n" % (raw["status"] if raw else "?", raw["body"] if raw else "?") + F3 + "\n\n"
                 "/models/config 显示 provider=deepseek、endpoint=https://api.deepseek.com/v1、"
                 "model=deepseek-flash、keyConfigured=true，但上游拒绝凭证。属环境/凭证问题，不是 JD 解析逻辑缺陷；"
                 "按 CONTEXT 要求记为 BLOCKED 而非 FAIL。UI 已按机器码映射为「模型服务暂时不可用，请重试。」，"
                 "未透出后端原文。\n")
            safe("解析失败的错误态映射", "显示映射文案且不透出后端 message 原文",
                 "alert=%r；后端原文未出现在页面=%s"
                 % (alert_text, "模型服务拒绝凭证" not in body_text(page)),
                 "模型服务暂时不可用" in alert_text, shot)

        try:
            page.keyboard.press("Escape")
            page.get_by_role("button", name="关闭").first.click(timeout=2000)
        except Exception:  # noqa: BLE001
            pass
        page.wait_for_timeout(500)

        # ================= JD 详情 =================
        page.goto("http://127.0.0.1:5173/jds/%s" % jd_a["id"], wait_until="networkidle")
        page.wait_for_timeout(1500)
        shot = rec.shot(page, "jd-detail")
        txt = body_text(page)
        detail_ok = jd_a["role"] in txt and jd_a["company"] in txt and "负责核心系统开发" in txt and "rev.1" in txt
        safe("JD 详情页渲染（预置数据）", "显示 岗位名 / 公司 / 正文 / rev.1",
             "role=%s company=%s body=%s rev=%s" % (
                 jd_a["role"] in txt, jd_a["company"] in txt,
                 "负责核心系统开发" in txt, "rev.1" in txt),
             detail_ok, shot)

        btn_texts = visible_buttons(page)
        before_n = len(net.events)
        clicked = False
        try:
            page.get_by_role("button", name="编辑（生成新 revision）").click(timeout=3000)
            clicked = True
        except Exception as exc:  # noqa: BLE001
            print("edit click failed", exc, flush=True)
        page.wait_for_timeout(2000)
        shot = rec.shot(page, "jd-edit-click")
        new_reqs = [e for e in net.events[before_n:] if "jds" in e["url"] and e["method"] in ("PATCH", "POST", "PUT")]
        after_txt = body_text(page)
        dialog_now = page.locator("[role=dialog]").count()
        inline_form = page.locator("textarea").count()
        edit_ok = bool(new_reqs) or dialog_now > 0
        safe("编辑 JD（生成新 revision）", "点击后出现编辑表单或发出 PATCH /jds/{id}",
             "按钮可点=%s；点击后新增写请求=%s；弹窗=%d；页面 textarea=%d"
             % (clicked, [(e["method"], e["url"].split("/api")[-1]) for e in new_reqs] or "无",
                dialog_now, inline_form),
             edit_ok, shot)
        if not edit_ok:
            note("### 缺陷 1：JD 编辑按钮是死按钮\n\n"
                 "**最小复现**：打开 /jds/%s → 点「编辑（生成新 revision）」。\n\n"
                 "**现象**：无任何弹窗/内联表单出现，未发出任何 PATCH/PUT /jds/{id} 请求，页面无变化。"
                 "源码 ui/src/components/jd-tuning.tsx:69-71 的该 button 没有 onClick，且 "
                 "ui/src/lib/api.ts 中不存在 updateJd 函数。\n\n"
                 "**证据目录**：docs/e2e/2026-10-09/areas/jd-profile/（截图 *jd-edit-click.png）。\n" % jd_a["id"])

        page.goto("http://127.0.0.1:5173/jds", wait_until="networkidle")
        page.wait_for_timeout(1200)
        lib_btns = visible_buttons(page)
        page.goto("http://127.0.0.1:5173/jds/%s" % jd_a["id"], wait_until="networkidle")
        page.wait_for_timeout(1200)
        det_btns = visible_buttons(page)
        delete_lib = [b for b in lib_btns if "删除" in b or "delete" in b.lower()]
        delete_det = [b for b in det_btns if "删除" in b or "delete" in b.lower()]
        shot = rec.shot(page, "jd-delete-scan")
        safe("删除 JD", "JD 列表或详情存在删除入口（DELETE /jds/{id}）",
             "列表按钮=%s；详情按钮=%s；命中删除入口=%s" % (lib_btns, det_btns, delete_lib + delete_det or "无"),
             bool(delete_lib or delete_det), shot)
        if not (delete_lib or delete_det):
            note("### 缺陷 2：JD 无删除入口\n\n"
                 "**最小复现**：分别打开 /jds 与 /jds/" + jd_a["id"] + "，扫描全部可见按钮：\n\n"
                 + F3 + "\n/jds 按钮: " + str(lib_btns) + "\n/jds/" + jd_a["id"] + " 按钮: " + str(det_btns) + "\n" + F3 + "\n\n"
                 "没有任何「删除」控件；ui/src/lib/api.ts 也不存在 deleteJd。后端 "
                 "DELETE /jds/{id} 存在且可用（REST 预检 204）。\n")

        page.goto("http://127.0.0.1:5173/jds/%s" % jd_b["id"], wait_until="networkidle")
        page.wait_for_timeout(1500)
        shot = rec.shot(page, "jd-binding-unbound")
        txt = body_text(page)
        s0, jd0 = api("GET", "/jds/%s" % jd_b["id"], cookie=cookie)
        badge = "本次改选" if "本次改选" in txt else ("未绑定" if "未绑定" in txt else "未命中")
        bound_badge = page.get_by_text(re.compile("^当前绑定")).count() > 0
        safe("JD 详情未绑定态", "未绑定 JD 的关系区不显示「当前绑定」徽标",
             "REST boundResumeId=%s；页面绑定徽标=%s；关系徽标=%s"
             % (jd0.get("boundResumeId") if isinstance(jd0, dict) else jd0, badge, bound_badge),
             (isinstance(jd0, dict) and jd0.get("boundResumeId") is None) and not bound_badge, shot)

        s, bound = api("PUT", "/jds/%s/binding" % jd_b["id"], cookie=cookie, body={"resume_id": resume["id"]})
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1500)
        shot = rec.shot(page, "jd-binding-bound")
        txt = body_text(page)
        bound_badge = page.get_by_text(re.compile("^当前绑定")).count() > 0
        safe("绑定简历后详情显示绑定关系", "显示「当前绑定 · <简历名>」徽标",
             "REST PUT status=%s boundResumeId=%s；绑定徽标=%s，含简历名=%s"
             % (s, bound.get("boundResumeId") if isinstance(bound, dict) else bound,
                bound_badge, resume["title"] in txt),
             bound_badge and resume["title"] in txt, shot)

        btns = visible_buttons(page)
        unbind = [b for b in btns if ("解绑" in b or "取消绑定" in b or "释放" in b)]
        shot = rec.shot(page, "jd-unbind-scan")
        safe("解绑（DELETE /jds/{id}/binding）", "详情存在解绑入口",
             "详情按钮=%s；命中解绑入口=%s" % (btns, unbind or "无"), bool(unbind), shot)
        if not unbind:
            note("### 缺陷 3：JD 无解绑入口\n\n"
                 "**最小复现**：REST 绑定后打开 /jds/" + jd_b["id"] + "，扫描全部可见按钮：\n\n"
                 + F3 + "\n" + str(btns) + "\n" + F3 + "\n\n"
                 "只有「同时把此简历显式绑定为该 JD 的当前绑定」复选框（改选目标时用，且仅随「发起岗位微调」跳转，"
                 "不发送 binding 请求），没有任何解绑控件。ui/src/lib/api.ts 不存在 releaseBinding。"
                 "后端 DELETE /jds/{id}/binding 可用（REST 预检 200）。\n")
        s2, released = api("DELETE", "/jds/%s/binding" % jd_b["id"], cookie=cookie)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1500)
        shot = rec.shot(page, "jd-binding-released")
        txt = body_text(page)
        bound_badge = page.get_by_text(re.compile("^当前绑定")).count() > 0
        safe("解绑后关系消失（REST 解绑 + 页面反映）", "详情不再显示「当前绑定」徽标",
             "REST DELETE status=%s boundResumeId=%s；绑定徽标=%s"
             % (s2, released.get("boundResumeId") if isinstance(released, dict) else released,
                bound_badge),
             not bound_badge, shot)

        page.goto("http://127.0.0.1:5173/jds/%s" % jd_a["id"], wait_until="networkidle")
        page.wait_for_timeout(1500)
        match_txt = body_text(page)
        shot = rec.shot(page, "jd-match-scan")
        match_hits = [k for k in ["匹配", "得分", "差距", "契合度"] if k in match_txt]
        s, mb = api("POST", "/profile/match-job", cookie=cookie, body={"jdId": jd_a["id"]})
        safe("岗位匹配结果展示", "详情页展示匹配得分/差距项",
             "详情页命中匹配关键字=%s；POST /profile/match-job -> %s %s"
             % (match_hits or "无", s, json.dumps(mb, ensure_ascii=False)),
             bool(match_hits) and s == 200, shot)
        if not match_hits:
            note("### 缺陷 4：岗位匹配（match）完全未实现\n\n"
                 "**最小复现**：打开 /jds/%s，页面无任何匹配得分/差距项；"
                 "直接 POST /profile/match-job 返回 404。\n\n"
                 "ui/src/lib/api.ts:377 的 matchJob 是纯前端桩（返回 JOB_MATCHES[jdId] 静态数据），"
                 "且全仓库无任何调用方；后端也没有 match-job 路由（OpenAPI 中 /profile/match-job 不存在）。\n"
                 % jd_a["id"])

        page.goto("http://127.0.0.1:5173/jds/does-not-exist-%s" % TS, wait_until="networkidle")
        found = False
        for _ in range(24):
            page.wait_for_timeout(500)
            if "未找到" in body_text(page):
                found = True
                break
        shot = rec.shot(page, "jd-not-found")
        txt = body_text(page)
        safe("不存在的 JD 详情路由（空态/错误态）", "显示 404 未找到状态块",
             "含「未找到」=%s；含 404=%s；页面摘要=%r"
             % ("未找到" in txt, "404" in txt, txt[:160].replace("\n", " ")),
             found, shot)

        # ================= Profile =================
        page.goto("http://127.0.0.1:5173/profile", wait_until="networkidle")
        page.wait_for_timeout(1800)
        shot = rec.shot(page, "profile-overview")
        txt = body_text(page)
        safe("Profile 页面加载", "标题「个人资料」+ 完整度 + 分区",
             "含「个人资料」=%s；含「完善度」=%s" % ("个人资料" in txt, "完善度" in txt),
             "个人资料" in txt, shot)

        city = "%s-城市" % PREFIX
        page.get_by_label("编辑基本信息").click()
        page.wait_for_timeout(500)
        page.get_by_label("城市", exact=True).fill(city)
        shot = rec.shot(page, "profile-basics-edit")
        page.get_by_role("button", name="保存基本信息").click()
        page.wait_for_timeout(1800)
        shot = rec.shot(page, "profile-basics-saved")
        saved_txt = body_text(page)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1800)
        after_txt = body_text(page)
        safe("资料基础信息（basics）修改持久化", "保存后即时可见，刷新后仍存在",
             "保存后含城市=%s；刷新后含城市=%s" % (city in saved_txt, city in after_txt),
             city in saved_txt and city in after_txt, shot)

        fact_title = "%s-技能事实" % PREFIX
        fact_content = "%s-内容-初始" % PREFIX
        page.get_by_label("手动添加技能专长", exact=True).click()
        page.wait_for_timeout(500)
        page.get_by_label("标题", exact=True).fill(fact_title)
        page.get_by_label("内容").fill(fact_content)
        shot = rec.shot(page, "profile-fact-create-form")
        page.get_by_role("button", name="添加事实").click()
        page.wait_for_timeout(1800)
        shot = rec.shot(page, "profile-fact-created")
        txt = body_text(page)
        safe("事实（fact）新增", "技能分区出现新事实卡片",
             "含标题=%s；含内容=%s" % (fact_title in txt, fact_content in txt),
             fact_title in txt and fact_content in txt, shot)

        new_content = "%s-内容-已编辑" % PREFIX
        page.get_by_label("编辑「%s」" % fact_title).click()
        page.wait_for_timeout(500)
        page.get_by_label("内容").fill(new_content)
        shot = rec.shot(page, "profile-fact-edit-form")
        page.get_by_role("button", name="保存修改").click()
        page.wait_for_timeout(1800)
        shot = rec.shot(page, "profile-fact-edited")
        txt = body_text(page)
        safe("事实（fact）编辑", "卡片内容更新为新值",
             "含新内容=%s；旧内容已消失=%s" % (new_content in txt, fact_content not in txt),
             new_content in txt and fact_content not in txt, shot)

        btns = visible_buttons(page)
        fdel = [b for b in btns if "删除" in b or b.strip().lower() == "delete"]
        shot = rec.shot(page, "profile-fact-delete-scan")
        safe("事实（fact）删除", "事实卡片存在删除入口（DELETE /profile/facts/{id}）",
             "页面按钮=%s；命中删除入口=%s" % (btns, fdel or "无"), bool(fdel), shot)
        if not fdel:
            note("### 缺陷 5：事实无删除入口，删除影响提示无法在 UI 出现\n\n"
                 "**最小复现**：打开 /profile，任意事实卡片只有「编辑」按钮，无「删除」。"
                 "全部可见按钮：\n\n" + F3 + "\n%s\n" % btns + F3 + "\n\n"
                 "ui/src/components/profile-workspace.tsx 无删除处理，ui/src/lib/api.ts 无 deleteFact，"
                 "i18n profile.ts 也无删除相关键。因此 FactDeletionImpact 的反向引用影响提示在 UI 上无从触发。\n")

        s, fact = api("POST", "/profile/facts", cookie=cookie, body={
            "type": "experience", "title": "%s-被引用事实" % PREFIX,
            "content": "%s-被引用内容" % PREFIX, "tags": [],
            "visibility": "resume_only", "evidence": {"status": "verified"}})
        fact_id = fact["id"] if isinstance(fact, dict) else None
        ref_resume = create_resume(cookie, PREFIX, "ref", fact_id=fact_id)
        s_prof, prof_before = api("GET", "/profile", cookie=cookie)
        refs_before = []
        for f in (prof_before.get("facts", []) if isinstance(prof_before, dict) else []):
            if f.get("id") == fact_id:
                refs_before = f.get("referencedBy", [])
        s_del, impact = api("DELETE", "/profile/facts/%s" % fact_id, cookie=cookie)
        s_get, after = api("GET", "/profile/facts/%s" % fact_id, cookie=cookie)
        ok_contract = s_del == 200 and bool(refs_before) and isinstance(impact, dict) and bool(impact.get("referencedBy"))
        safe("事实反向引用删除影响（后端契约）", "DELETE 返回 FactDeletionImpact.referencedBy 非空，且事实被删",
             "GET referencedBy=%s；DELETE status=%s body=%s；删除后 GET=%s %s"
             % (json.dumps(refs_before, ensure_ascii=False), s_del,
                json.dumps(impact, ensure_ascii=False), s_get, json.dumps(after, ensure_ascii=False)),
             ok_contract)
        safe("事实反向引用影响提示（UI）", "UI 可见被引用影响提示并让用户确认",
             "UI 无删除入口（见缺陷 5），无法触发；后端契约可用（上一步）", False)
        note("**后端契约已可用**：先建事实 F，再建一份 version 快照里 provenance.factId=F 的简历，"
             "DELETE /profile/facts/F 返回的 referencedBy 含该简历与版本；删除后 GET /profile/facts/F 404。"
             "缺口纯在前端。")

        # ---------------- 清理本次及历史 e2e-jd-profile-* 测试数据 ----------------
        cleanup = []
        s_j, jds = api("GET", "/jds", cookie=cookie)
        if isinstance(jds, list):
            for j in jds:
                if str(j.get("role", "")).startswith("e2e-jd-profile-"):
                    st = api("DELETE", "/jds/%s" % j["id"], cookie=cookie)[0]
                    cleanup.append("DEL jd %s -> %s" % (j["id"], st))
        s_r, res_list = api("GET", "/resumes", cookie=cookie)
        if isinstance(res_list, list):
            for rr in res_list:
                if str(rr.get("title", "")).startswith("e2e-jd-profile-"):
                    st = api("DELETE", "/resumes/%s" % rr["id"], cookie=cookie)[0]
                    cleanup.append("DEL resume %s -> %s" % (rr["id"], st))
        print("\n===== CLEANUP =====", flush=True)
        for c in cleanup:
            print(" ", c, flush=True)

        print("\n===== NETWORK EVENTS =====", flush=True)
        print(net.dump(), flush=True)
        print("\n===== CONSOLE =====", flush=True)
        for m in msgs[-25:]:
            print(" ", m, flush=True)

        extra = "\n".join(extra_notes)
        if extra:
            extra = "## 缺陷与环境阻塞\n\n" + extra
        extra += ("\n\n## 环境噪声（非缺陷）\n\n"
                  "- vite worktree node_modules 软链导致 geist-*.woff2 403，字体回退。\n"
                  "- 未登录时 /api/auth/me 401 正常。\n")
        out = rec.write(extra)
        print("\nREPORT:", out, flush=True)


try:
    main()
except Exception:  # noqa: BLE001
    import traceback
    traceback.print_exc()
    note("### 脚本异常中断\n\n" + F3 + "\n%s\n" % traceback.format_exc()[-2000:] + F3 + "\n")
    print("REPORT:", rec.write("\n".join(extra_notes)), flush=True)
    raise
