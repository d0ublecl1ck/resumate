#!/usr/bin/env python3
"""简历编辑器 E2E：章节/条目编辑、10 秒空闲自动保存、版本列表、任意两版对比、恢复某版。"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import Recorder, api, api_login, browser_page

TS = time.strftime("%m%d-%H%M%S")
rec = Recorder("resume-editor")
cookie = api_login("admin@resumate.dev", "resumate-admin")

# --- 准备：新建简历并写入一份含章节/条目的文档（后续全部操作都在 UI 里做） ---
status, tpl = api("GET", "/templates", cookie=cookie)
tpl_id = tpl[0]["id"] if isinstance(tpl, list) and tpl else "tpl_classic"
status, resume = api("POST", "/resumes", cookie=cookie,
                     body={"title": "e2e-editor-%s" % TS, "templateId": tpl_id, "targetRole": "E2E 校验"})
assert status == 201, (status, resume)
rid = resume["id"]
doc = {
    "basics": {"fullName": "E2E 测试者", "headline": "前端工程师", "email": "e2e@example.com", "phone": "13800000000", "location": "上海", "links": []},
    "sections": [
        {"id": "sec_sum_e2e", "kind": "summary", "title": "个人简介", "text": "初始简介文本", "entries": []},
        {"id": "sec_exp_e2e", "kind": "experience", "title": "工作经历", "entries": [
            {"id": "entry_e2e_1", "title": "高级前端工程师", "period": "2021-2024", "bullets": ["要点一"]}
        ]},
    ],
}
st, res2 = api("PUT", "/resumes/%s/document" % rid, cookie=cookie,
               body={"document": doc, "baseVersionId": resume["currentVersionId"], "message": "E2E 初始文档"})
assert st == 200, (st, res2)
current_version = res2["currentVersionId"]
rec.step("准备：造一份有章节/条目的简历", "200 且生成初始版本",
         "status=%s id=%s base=%s" % (st, rid, current_version), True, "REST POST /resumes + PUT /resumes/{id}/document")


def versions():
    return api("GET", "/resumes/%s/versions" % rid, cookie=cookie)


def resume_state():
    st, body = api("GET", "/resumes/%s" % rid, cookie=cookie)
    return body


with browser_page() as page:
    page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill("admin@resumate.dev")
    page.get_by_label("密码").fill("resumate-admin")
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.goto("http://127.0.0.1:5173/resumes/%s" % rid, wait_until="networkidle")
    page.wait_for_timeout(1500)
    rec.shot(page, "editor-open")

    has_edit = page.locator("section[aria-label='结构化编辑']").count() == 1
    has_chat = page.locator("section[aria-label='对话与 Run']").count() == 1
    has_prev = page.locator("section[aria-label='预览']").count() == 1
    rec.step("A 编辑器三栏渲染", "结构化编辑/对话与Run/预览 三栏都在",
             "edit=%s chat=%s preview=%s" % (has_edit, has_chat, has_prev), has_edit and has_chat and has_prev,
             rec.shot(page, "editor-three-columns"))

    basic_inputs = page.locator("section.card-soft input[aria-label^='章节标题']").count()
    rec.step("A2 章节与条目渲染", "2 个章节标题输入框 + 条目'条目标题' + 要点",
             "sectionTitle=%d entryTitle=%d bullet=%d" % (basic_inputs,
                 page.locator("input[aria-label='条目标题']").count(),
                 page.locator("textarea[aria-label='要点 1']").count()),
             basic_inputs == 2, rec.shot(page, "editor-structured"))

    # B. 条目/章节编辑：章节标题 + 条目标题 + 要点 + 新增要点
    marker = "E2E%s" % TS
    st_input = page.locator("input[aria-label^='章节标题']").first
    st_input.fill(st_input.input_value() + marker)
    entry_input = page.locator("input[aria-label='条目标题']").first
    entry_input.fill(entry_input.input_value() + "-" + marker)
    bullet = page.locator("textarea[aria-label='要点 1']").first
    bullet.fill(bullet.input_value() + " 修改于 " + marker)
    page.get_by_role("button", name="添加要点").first.click()
    page.wait_for_timeout(400)
    badge = page.locator("text=本地未送达").count()
    state = resume_state()
    rec.step("B 有效输入立即标记本地未送达", "出现「本地未送达」徽标；REST save_state=local_unsynced",
             "badge=%s save_state=%s" % (badge, state.get("saveState")), badge >= 1,
             rec.shot(page, "editor-local-unsynced"))

    # B2. 章节上下移动（稳定 ID 不变）
    first_title_before = page.locator("input[aria-label^='章节标题']").first.input_value()
    page.get_by_role("button", name="下移章节").first.click()
    page.wait_for_timeout(400)
    first_title_after = page.locator("input[aria-label^='章节标题']").first.input_value()
    rec.step("B2 章节下移", "第一章节标题变化（顺序调换）",
             "before=%s after=%s" % (first_title_before[:12], first_title_after[:12]),
             first_title_before != first_title_after, rec.shot(page, "editor-move-section"))

    # C. 停顿后同步到服务端草稿缓冲
    page.wait_for_timeout(2600)
    synced = page.locator("text=已同步草稿").count()
    state = resume_state()
    rec.step("C 停顿后草稿同步到服务端缓冲", "徽标「已同步草稿」，REST save_state=synced_draft",
             "badge=%s save_state=%s" % (synced, state.get("saveState")),
             synced >= 1 and state.get("saveState") == "synced_draft", rec.shot(page, "editor-synced-draft"))

    # D. 空闲 10 秒自动保存
    page.mouse.move(10, 10)
    t0 = time.time()
    saved = False
    body = []
    for _ in range(40):
        page.wait_for_timeout(1000)
        st, body = versions()
        if isinstance(body, list) and any(v.get("message") == "自动保存" for v in body):
            saved = True
            break
    elapsed = round(time.time() - t0, 1)
    rec.step("D 空闲 10 秒自动保存", "约 10~15 秒内生成 message=自动保存 的新版本",
             "耗时=%ss messages=%s" % (elapsed, [v.get("message") for v in body]), saved,
             rec.shot(page, "editor-autosaved"))

    # E. 手动 flush
    bullet = page.locator("textarea[aria-label='要点 1']").first
    bullet.fill(bullet.input_value() + " manual-flush")
    page.wait_for_timeout(400)
    page.get_by_role("button", name="保存（flush）").click()
    page.wait_for_timeout(3000)
    st, body = versions()
    rec.step("E 手动 flush 生成版本", "出现 message=手动编辑 的新版本",
             "messages=%s" % [v.get("message") for v in body],
             any("手动编辑" in (v.get("message") or "") for v in body), rec.shot(page, "editor-manual-flush"))

    # F. 版本页：来源筛选 + 任意两版对比
    page.goto("http://127.0.0.1:5173/resumes/%s/versions" % rid, wait_until="networkidle")
    page.wait_for_timeout(1200)
    items = page.locator("ol > li").count()
    rec.shot(page, "versions-timeline")
    page.get_by_role("button", name="手动编辑").first.click() if page.get_by_role("button", name="手动编辑").count() else None
    page.wait_for_timeout(400)
    filter_n = page.locator("ol > li").count()
    page.get_by_role("button", name="全部").first.click()
    page.wait_for_timeout(400)
    selects = page.get_by_role("button", name="选择比较")
    n = selects.count()
    if n >= 2:
        selects.nth(0).click()
        selects.nth(n - 1).click()
    page.wait_for_timeout(600)
    compare_text = page.locator("aside.card-soft").inner_text()
    ok_compare = ("↔" in compare_text) and ("变更章节" in compare_text)
    rec.step("F 任意两版对比", "选中两版后比较区显示两个版本 id 与变更章节",
             "items=%d filter_items=%d selects=%d compare=%s" % (items, filter_n, n, compare_text.replace("\n", " / ")[:200]),
             ok_compare, rec.shot(page, "versions-compare"))

    # G. 恢复某版
    restore_btns = page.get_by_role("button", name="恢复为新版本")
    rb_count = restore_btns.count()
    rec.shot(page, "versions-before-restore")
    st_before, body_before = versions()
    before = [(v.get("id"), v.get("source"), v.get("message")) for v in (body_before or [])]
    if rb_count:
        target_id = body_before[0].get("id")
        restore_btns.last.click()
        page.wait_for_timeout(600)
        dlg_visible = page.locator("[role=dialog]").count() == 1
        rec.shot(page, "restore-dialog")
        page.get_by_role("button", name="确认恢复为新版本").click()
        page.wait_for_timeout(3000)
        st_after, body_after = versions()
        after = [(v.get("id"), v.get("source"), v.get("message")) for v in (body_after or [])]
        new_restore = [v for v in (body_after or []) if v.get("source") == "restore"]
        rec.shot(page, "versions-after-restore")
        rec.step("G 恢复某版生成新版本", "确认后生成 source=restore 的新版本，历史全部保留",
                 "dialog=%s before=%s after=%s restore_count=%d" % (dlg_visible, before, after, len(new_restore)),
                 len(new_restore) >= 1)
    else:
        rec.step("G 恢复某版生成新版本", "时间线每条非当前版本都有「恢复为新版本」按钮", "按钮数=0", False)

    errs = [c for c in page.console_log if c.startswith("pageerror")]
    rec.step("控制台无 JS 异常", "无 pageerror", "pageerror=%s" % errs[:2], len(errs) == 0)

print(rec.write("简历 id：%s" % rid))
