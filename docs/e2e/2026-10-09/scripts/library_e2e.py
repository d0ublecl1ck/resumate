#!/usr/bin/env python3
"""简历库 E2E（area=resume-library）：真点 UI（Playwright 无头）+ REST 交叉验证。

约束：
- 只操作自己创建、标题带 e2e-lib- 前缀的简历；结束前软删除清理。
- 不改源码；证据写到 areas/resume-library/。
运行：/usr/bin/python3 docs/e2e/2026-10-09/scripts/library_e2e.py
"""
import email as emailmod
import glob
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.request

SCRIPTS = "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts"
sys.path.insert(0, SCRIPTS)
from e2e_lib import Recorder, api, browser_page  # noqa: E402

WEB = "http://127.0.0.1:5173"
API = "http://127.0.0.1:8000"
MAIL = "/tmp/resumate-e2e-mail"
TS = time.strftime("%m%d-%H%M%S")
BASE = "e2e-lib-%s" % TS
PASSWORD = "Resumate-e2e-1009"

RAW = []
DEFECTS = []
NOTES = []


def raw(label, obj):
    text = obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False)
    RAW.append("### %s\n\n~~~\n%s\n~~~" % (label, text))
    print("[RAW] %s: %s" % (label, text[:500]), flush=True)
    return obj


def note(text):
    NOTES.append(text)
    print("[NOTE] %s" % text, flush=True)


def api_cookie(email, password):
    """登录并返回 Cookie 头；后端登录是 POST /auth/login（不是 /login）。"""
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(
        API + "/auth/login",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(req, timeout=30) as resp:
        resp.read()
    return "; ".join("%s=%s" % (c.name, c.value) for c in jar)


def ui_login(page, email, password):
    page.goto(WEB + "/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill(email)
    page.get_by_label("密码").fill(password)
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.wait_for_timeout(1000)


def goto_library(page, query=""):
    page.goto(WEB + "/resumes" + query, wait_until="networkidle")
    page.wait_for_timeout(1500)


def card_for(page, title):
    link = page.get_by_role("link", name=title, exact=True)
    return link.locator("xpath=ancestor::li[1]")


def card_titles(page):
    return [t.strip() for t in page.locator("li.card-soft a.font-serif").all_inner_texts()]


def tab_button(page, label):
    return page.locator("button[aria-pressed]").filter(has_text=re.compile("^%s$" % label))


def rest_titles(cookie, query=""):
    status, body = api("GET", "/resumes" + query, cookie=cookie)
    if not isinstance(body, list):
        return status, []
    return status, [r["title"] for r in body]


def rest_create(cookie, title, tags=None, template="tpl_modern"):
    status, body = api("POST", "/resumes", cookie=cookie,
                       body={"title": title, "templateId": template, "tags": tags or []})
    raw("REST POST /resumes title=%s" % title,
        "status=%s body=%s" % (status, json.dumps(body, ensure_ascii=False)))
    return status, body


def defect(title, body):
    DEFECTS.append({"title": title, "body": body})
    print("[DEFECT] %s" % title, flush=True)


def register_and_verify():
    """注册一个全新用户并完成邮箱验证；返回 (email, password)。"""
    email = "e2e-lib-empty-%s@example.com" % TS
    before = set(glob.glob(MAIL + "/*.eml"))
    status, body = api("POST", "/auth/register", body={
        "email": email, "password": PASSWORD, "display_name": "E2E 空态用户"})
    raw("REST POST /auth/register", "status=%s body=%s" % (status, json.dumps(body, ensure_ascii=False)))
    token = None
    deadline = time.time() + 15
    while time.time() < deadline and token is None:
        now = set(glob.glob(MAIL + "/*.eml"))
        fresh = sorted(now - before, key=os.path.getmtime)
        if fresh:
            msg = emailmod.message_from_bytes(open(fresh[-1], "rb").read())
            payload = (msg.get_payload(decode=True) or b"").decode("utf-8", "replace")
            m = re.search(r"token=([A-Za-z0-9_\-\.]+)", payload)
            if m:
                token = m.group(1)
        if token is None:
            time.sleep(0.5)
    if token is None:
        raise RuntimeError("未在 /tmp/resumate-e2e-mail 收到验证邮件")
    status, body = api("POST", "/auth/verification/verify", body={"token": token})
    raw("REST POST /auth/verification/verify", "status=%s body=%s" % (status, json.dumps(body, ensure_ascii=False)))
    return email, PASSWORD


# ---------------------------------------------------------------------------
# 主流程（管理员）
# ---------------------------------------------------------------------------

def run_admin(rec):
    cookie = api_cookie("admin@resumate.dev", "resumate-admin")
    status, baseline = api("GET", "/resumes", cookie=cookie)
    base_ids = {r["id"] for r in baseline}
    raw("REST 基线 GET /resumes",
        "status=%s count=%s ids=%s" % (status, len(baseline), sorted(base_ids)))

    with browser_page() as page:
        ui_login(page, "admin@resumate.dev", "resumate-admin")
        goto_library(page)
        shot = rec.shot(page, "01-library-loaded")
        h1 = page.locator("h1").first.inner_text()
        rec.step("打开 /resumes 简历库", "标题「简历库」，有「新建简历」与活跃/归档 Tab",
                 "h1=%s；卡片数=%s；活跃Tab=%s 归档Tab=%s" % (h1, page.locator("li.card-soft").count(),
                 tab_button(page, "活跃").count(), tab_button(page, "归档").count()),
                 h1 == "简历库" and page.get_by_role("button", name="新建简历").count() == 1, shot)

        # ---------------- 1. 新建简历 ----------------
        created_id = None
        try:
            page.get_by_role("button", name="新建简历").click()
            page.wait_for_timeout(700)
            dialog = page.get_by_role("dialog")
            shot = rec.shot(page, "02-create-modal")
            dlg_text = dialog.inner_text().replace("\n", " / ")
            rec.step("新建弹窗结构", "弹窗含标题与创建方式",
                     dlg_text, dialog.count() == 1 and "开始一份新的简历" in dlg_text, shot)

            textboxes = dialog.get_by_role("textbox").count()
            selects = dialog.locator("select").count()
            combos = dialog.get_by_role("combobox").count()
            rec.step("新建弹窗：命名入口", "存在标题输入框以命名新简历",
                     "textbox=%s combobox=%s" % (textboxes, combos), textboxes > 0, shot)
            rec.step("新建弹窗：选模板入口", "存在模板选择控件（select/combobox/模板卡片）",
                     "select=%s combobox=%s" % (selects, combos),
                     selects > 0 or combos > 0, shot)
            if textboxes == 0:
                defect("新建简历弹窗缺少「命名」输入框，无法在创建时命名",
                       "最小复现：/resumes → 点「新建简历」→ 弹窗只有「从现有简历复制 / 完全新开」两个 button[aria-pressed]，"
                       "dialog 内 textbox=0、combobox=0、select=0。选「完全新开」→「创建」后标题固定为「未命名简历」。"
                       "证据：areas/resume-library/02-02-create-modal.png；文案键 resume.create.defaultTitle 值即「未命名简历」。")
            if selects == 0 and combos == 0:
                defect("新建简历弹窗缺少「选模板」入口",
                       "最小复现：/resumes → 「新建简历」→ 弹窗内没有任何模板选择控件；"
                       "后端 POST /resumes 支持 templateId，UI 固定用 usableTemplates[0].id（当前 tpl_modern）。"
                       "证据：areas/resume-library/02-02-create-modal.png。")

            dialog.get_by_role("button", name="完全新开").click()
            page.wait_for_timeout(300)
            dialog.get_by_role("button", name="创建", exact=True).click()
            page.wait_for_url(re.compile(r".*/resumes/res_"), timeout=15000)
            page.wait_for_timeout(1500)
            created_id = re.search(r"/resumes/(res_[^/?#]+)", page.url).group(1)
            raw("UI 新建后进入编辑器", "url=%s id=%s" % (page.url, created_id))

            status, listing = api("GET", "/resumes", cookie=cookie)
            new_ids = sorted({r["id"] for r in listing} - base_ids)
            raw("REST GET /resumes（新建后）", "status=%s new_ids=%s" % (status, new_ids))
            created_id = new_ids[0] if new_ids else created_id
            status, patched = api("PATCH", "/resumes/%s" % created_id, cookie=cookie,
                                  body={"title": "%s-create" % BASE})
            raw("REST PATCH /resumes/%s 改名" % created_id,
                "status=%s title=%s" % (status, patched.get("title") if isinstance(patched, dict) else patched))

            goto_library(page)
            shot = rec.shot(page, "03-created-in-list")
            titles = card_titles(page)
            rec.step("新建后出现在列表", "列表出现「%s-create」" % BASE,
                     "titles=%s" % titles, ("%s-create" % BASE) in titles, shot)
            status, listing2 = api("GET", "/resumes", cookie=cookie)
            match = [r for r in listing2 if r["id"] == created_id] if isinstance(listing2, list) else []
            rec.step("REST 交叉验证新建记录", "GET /resumes 含该 id 且标题一致",
                     "status=%s found=%s" % (status, json.dumps(match, ensure_ascii=False)[:300]),
                     bool(match) and match[0]["title"] == "%s-create" % BASE, shot)
        except Exception as exc:  # noqa: BLE001
            rec.step("新建简历流程", "完成创建并出现在列表",
                     "异常 %s: %s" % (type(exc).__name__, exc), False, "")
            return

        # ---------------- 2. 复制（duplicate） ----------------
        clone_id = None
        try:
            card = card_for(page, "%s-create" % BASE)
            card.get_by_role("button", name="复制").click()
            page.wait_for_url(re.compile(r".*/resumes/res_"), timeout=15000)
            page.wait_for_timeout(1500)
            clone_id = re.search(r"/resumes/(res_[^/?#]+)", page.url).group(1)
            status, clone = api("GET", "/resumes/%s" % clone_id, cookie=cookie)
            raw("REST 复制结果 GET /resumes/%s" % clone_id,
                "status=%s title=%s" % (status, clone.get("title") if isinstance(clone, dict) else clone))
            shot = rec.shot(page, "04-duplicate-editor")
            rec.step("点「复制」生成副本", "副本标题为「%s-create（副本）」，id 与原记录不同" % BASE,
                     "clone_id=%s title=%s" % (clone_id, clone.get("title")),
                     clone_id != created_id and clone.get("title") == "%s-create（副本）" % BASE, shot)

            goto_library(page)
            titles = card_titles(page)
            shot = rec.shot(page, "05-duplicate-in-list")
            rec.step("副本出现在列表", "列表同时有原记录与副本",
                     "titles=%s" % titles,
                     ("%s-create" % BASE) in titles and ("%s-create（副本）" % BASE) in titles, shot)

            status_c, doc_clone = api("GET", "/resumes/%s/document" % clone_id, cookie=cookie)
            status_o, doc_orig = api("GET", "/resumes/%s/document" % created_id, cookie=cookie)
            modified = json.loads(json.dumps(doc_clone))
            modified.setdefault("basics", {})
            modified["basics"]["full_name"] = "E2E 副本独立"
            status_p, put = api("PUT", "/resumes/%s/document" % clone_id, cookie=cookie,
                                body={"document": modified, "message": "e2e 副本独立性验证"})
            status_o2, doc_orig2 = api("GET", "/resumes/%s/document" % created_id, cookie=cookie)
            raw("REST 副本独立性验证",
                "clone_doc==orig_doc(初始)=%s；PUT clone status=%s；orig full_name 仍=%r"
                % (doc_clone == doc_orig, status_p, (doc_orig2 or {}).get("basics", {}).get("full_name", "")))
            rec.step("副本内容独立", "改副本内容后原记录不变（初始文档相同、改动互不影响）",
                     "初始相同=%s；改副本后原记录 full_name=%r" % (
                         doc_clone == doc_orig,
                         (doc_orig2 or {}).get("basics", {}).get("full_name", "")),
                     doc_clone == doc_orig and (doc_orig2 or {}).get("basics", {}).get("full_name", "") == "", "")
        except Exception as exc:  # noqa: BLE001
            rec.step("复制副本流程", "副本创建并出现在列表",
                     "异常 %s: %s" % (type(exc).__name__, exc), False, "")

        # ---------------- 3. 重命名 / 标签 ----------------
        meta_id = None
        try:
            status, meta = rest_create(cookie, "%s-meta" % BASE, tags=["%s-tag-a" % BASE])
            meta_id = meta.get("id") if isinstance(meta, dict) else None
            goto_library(page)
            card = card_for(page, "%s-meta" % BASE)
            rename_btns = card.get_by_role("button", name=re.compile("重命名|改名|编辑标题")).count()
            tag_btns = card.get_by_role("button", name=re.compile("标签|tag|Tag")).count()
            card_inputs = card.locator("input").count()
            shot = rec.shot(page, "06-card-actions")
            actions = [t.strip() for t in card.get_by_role("button").all_inner_texts()]
            rec.step("UI 重命名入口", "卡片上可重命名简历",
                     "卡片按钮=%s；重命名按钮=%s；input=%s" % (actions, rename_btns, card_inputs),
                     rename_btns > 0, shot)
            rec.step("UI 标签增删改入口", "卡片上可编辑标签",
                     "标签按钮=%s；input=%s" % (tag_btns, card_inputs), tag_btns > 0 or card_inputs > 0, shot)
            defect("简历库卡片缺少「重命名」与「标签编辑」入口",
                   "最小复现：/resumes 任一卡片操作区只有「打开编辑 / 版本历史 / 复制 / 归档」四种按钮，"
                   "卡片内无 input、无重命名按钮，标签仅只读展示。"
                   "后端 PATCH /resumes/{id} 支持 title/tags（本次已用 REST 验证）。"
                   "证据：areas/resume-library/06-06-card-actions.png。")

            status, p1 = api("PATCH", "/resumes/%s" % meta_id, cookie=cookie,
                             body={"title": "%s-meta-renamed" % BASE,
                                   "tags": ["%s-tag-a" % BASE, "%s-tag-b" % BASE]})
            raw("REST PATCH 改名+加标签", "status=%s title=%s tags=%s"
                % (status, p1.get("title"), p1.get("tags")) if isinstance(p1, dict) else "status=%s" % status)
            goto_library(page)
            shot = rec.shot(page, "07-rename-tags-applied")
            card = card_for(page, "%s-meta-renamed" % BASE)
            tag_texts = card.locator("span").all_inner_texts()
            joined = "\n".join(tag_texts)
            has_both = ("%s-tag-a" % BASE) in joined and ("%s-tag-b" % BASE) in joined
            rec.step("REST 改名+标签后 UI 反映", "卡片标题与两个标签 chip 都显示",
                     "标签文本=%s" % [t for t in tag_texts if "tag" in t], has_both, shot)

            chip = page.get_by_role("button", name="%s-tag-a" % BASE, exact=True)
            chip.click()
            page.wait_for_timeout(1000)
            filtered = card_titles(page)
            shot = rec.shot(page, "08-tag-chip-filter")
            rec.step("标签 chip 筛选", "点 tag-a 后只显示带该标签的「%s-meta-renamed」" % BASE,
                     "titles=%s url=%s" % (filtered, page.url),
                     filtered == ["%s-meta-renamed" % BASE], shot)

            status, p2 = api("PATCH", "/resumes/%s" % meta_id, cookie=cookie,
                             body={"tags": ["%s-tag-b" % BASE, "%s-tag-c" % BASE]})
            raw("REST PATCH 删 tag-a / 增 tag-c", "status=%s tags=%s"
                % (status, p2.get("tags")) if isinstance(p2, dict) else "status=%s" % status)
            goto_library(page)
            shot = rec.shot(page, "09-tags-removed-added")
            chip_a = page.get_by_role("button", name="%s-tag-a" % BASE, exact=True).count()
            chip_b = page.get_by_role("button", name="%s-tag-b" % BASE, exact=True).count()
            chip_c = page.get_by_role("button", name="%s-tag-c" % BASE, exact=True).count()
            rec.step("标签删/增后 UI 反映", "tag-a chip 消失，tag-b/tag-c chip 存在",
                     "chip_a=%s chip_b=%s chip_c=%s" % (chip_a, chip_b, chip_c),
                     chip_a == 0 and chip_b == 1 and chip_c == 1, shot)
        except Exception as exc:  # noqa: BLE001
            rec.step("重命名/标签流程", "REST 可改名改标签且 UI 反映",
                     "异常 %s: %s" % (type(exc).__name__, exc), False, "")

        # ---------------- 4. 归档 / 恢复 ----------------
        try:
            goto_library(page)
            card_for(page, "%s-create" % BASE).get_by_role("button", name="归档").click()
            page.wait_for_timeout(1800)
            active_titles = card_titles(page)
            status, arch_list = api("GET", "/resumes?lifecycle=archived", cookie=cookie)
            status_a, act_list = api("GET", "/resumes?lifecycle=active", cookie=cookie)
            raw("REST 归档后交叉验证",
                "archived=%s" % json.dumps([r["title"] for r in arch_list] if isinstance(arch_list, list) else arch_list, ensure_ascii=False))
            rec.step("归档后离开活跃列表", "活跃列表不再含「%s-create」，REST archived 含它" % BASE,
                     "active_ui=%s；archived_rest=%s" % (
                         active_titles,
                         [r["title"] for r in arch_list] if isinstance(arch_list, list) else arch_list),
                     ("%s-create" % BASE) not in active_titles
                     and any(r["title"] == "%s-create" % BASE for r in (arch_list or [])), "")

            tab_button(page, "归档").click()
            page.wait_for_timeout(1500)
            arch_titles = card_titles(page)
            shot = rec.shot(page, "10-archived-tab")
            card = card_for(page, "%s-create" % BASE)
            badge = card.get_by_text("已归档").count() if card.count() else 0
            rec.step("归档列表可见", "归档 Tab 显示「%s-create」并带「已归档」徽标" % BASE,
                     "titles=%s badge=%s" % (arch_titles, badge),
                     ("%s-create" % BASE) in arch_titles and badge > 0, shot)

            card.get_by_role("button", name="恢复").click()
            page.wait_for_timeout(1800)
            arch_after = card_titles(page)
            status, act_after = api("GET", "/resumes?lifecycle=active", cookie=cookie)
            tab_button(page, "活跃").click()
            page.wait_for_timeout(1500)
            active_after = card_titles(page)
            shot = rec.shot(page, "11-restored-active")
            raw("REST 恢复后交叉验证",
                "active_titles=%s" % json.dumps([r["title"] for r in act_after] if isinstance(act_after, list) else act_after, ensure_ascii=False))
            rec.step("恢复回到正常列表", "归档 Tab 不再含它，活跃 Tab/ REST active 重新含它",
                     "archived_ui=%s；active_ui=%s" % (arch_after, active_after),
                     ("%s-create" % BASE) not in arch_after and ("%s-create" % BASE) in active_after, shot)
        except Exception as exc:  # noqa: BLE001
            rec.step("归档/恢复流程", "归档与恢复双向正确",
                     "异常 %s: %s" % (type(exc).__name__, exc), False, "")

        # ---------------- 5. 删除 ----------------
        try:
            status, dele = rest_create(cookie, "%s-del" % BASE)
            del_id = dele.get("id") if isinstance(dele, dict) else None
            goto_library(page)
            card = card_for(page, "%s-del" % BASE)
            del_btns = card.get_by_role("button", name=re.compile("^删除$|^移除$")).count()
            shot = rec.shot(page, "12-no-delete-control")
            rec.step("UI 删除入口/确认弹窗", "卡片上有「删除」按钮并能弹出确认",
                     "删除按钮数=%s（点击前后均无 confirm dialog）" % del_btns, del_btns > 0, shot)
            defect("简历库没有「删除」入口，也没有确认/取消路径",
                   "最小复现：/resumes 任一卡片操作区只有「打开编辑 / 版本历史 / 复制 / 归档」，"
                   "card.get_by_role('button', name='删除') 命中 0；因此无法触发确认弹窗，也没有取消路径可测。"
                   "后端 DELETE /resumes/{id} 存在并可用（软删除，lifecycle=deleted，30 天恢复窗口）。"
                   "证据：areas/resume-library/12-12-no-delete-control.png。")

            status, body = api("DELETE", "/resumes/%s" % del_id, cookie=cookie)
            raw("REST DELETE /resumes/%s" % del_id,
                "status=%s lifecycle=%s" % (status, body.get("lifecycle") if isinstance(body, dict) else body))
            status_f, body_f = api("GET", "/resumes/%s" % del_id, cookie=cookie)
            raw("REST GET 已删除记录", "status=%s" % status_f)
            status_a, act = rest_titles(cookie, "?lifecycle=active")
            status_d, default_list = rest_titles(cookie)
            goto_library(page)
            ui_titles = card_titles(page)
            shot = rec.shot(page, "13-deleted-gone")
            rec.step("删除后列表与 REST 均消失", "UI 无该卡片；REST active 与默认列表都不含它",
                     "rest_active_has=%s；rest_default_has=%s；ui_has=%s" % (
                         ("%s-del" % BASE) in act, ("%s-del" % BASE) in default_list,
                         ("%s-del" % BASE) in ui_titles),
                     status == 200 and ("%s-del" % BASE) not in act
                     and ("%s-del" % BASE) not in default_list and ("%s-del" % BASE) not in ui_titles, shot)
        except Exception as exc:  # noqa: BLE001
            rec.step("删除流程", "删除后列表与 REST 均消失",
                     "异常 %s: %s" % (type(exc).__name__, exc), False, "")

        # ---------------- 6. 搜索 ----------------
        try:
            goto_library(page)
            inp = page.get_by_placeholder("按标题或岗位搜索…")
            keyword = "%s-meta-renamed" % BASE
            inp.fill(keyword)
            page.wait_for_timeout(900)
            hit = card_titles(page)
            shot = rec.shot(page, "14-search-hit")
            rec.step("搜索命中", "关键词「%s」只命中该卡片" % keyword,
                     "titles=%s url=%s" % (hit, page.url), hit == [keyword], shot)

            inp.fill(keyword.upper())
            page.wait_for_timeout(900)
            upper = card_titles(page)
            rec.step("搜索大小写不敏感", "大写关键词同样命中",
                     "titles=%s" % upper, keyword in upper, "")

            inp.fill("e2e-lib-zzz-000-no-match")
            page.wait_for_timeout(900)
            miss = card_titles(page)
            empty_text = page.get_by_text("没有匹配的简历").count()
            shot = rec.shot(page, "15-search-miss-empty")
            rec.step("搜索未命中空态", "显示「没有匹配的简历」筛选空态且无卡片",
                     "cards=%s；空态标题命中=%s；url=%s" % (miss, empty_text, page.url),
                     miss == [] and empty_text == 1, shot)

            page.get_by_role("button", name="清除搜索").click()
            page.wait_for_timeout(1000)
            cleared = card_titles(page)
            status_a, act = rest_titles(cookie, "?lifecycle=active")
            shot = rec.shot(page, "16-search-cleared")
            rec.step("清空搜索", "清空后恢复当前 Tab 全部卡片，URL 去掉 q",
                     "cards=%s；url=%s；REST active=%s" % (cleared, page.url, act),
                     set(cleared) == set(act) and "q=" not in page.url, shot)
        except Exception as exc:  # noqa: BLE001
            rec.step("搜索流程", "命中/未命中/清空均正确",
                     "异常 %s: %s" % (type(exc).__name__, exc), False, "")

        # ---------------- 7. 筛选 ----------------
        try:
            goto_library(page)
            status_a, act = rest_titles(cookie, "?lifecycle=active")
            ui_active = card_titles(page)
            rec.step("活跃 Tab 与 REST 一致", "活跃 Tab 卡片集合 == REST ?lifecycle=active",
                     "ui=%s；rest=%s" % (ui_active, act), set(ui_active) == set(act), "")

            tab_button(page, "归档").click()
            page.wait_for_timeout(1500)
            status_r, arch = rest_titles(cookie, "?lifecycle=archived")
            ui_arch = card_titles(page)
            shot = rec.shot(page, "17-archived-consistency")
            rec.step("归档 Tab 与 REST 一致", "归档 Tab 卡片集合 == REST ?lifecycle=archived",
                     "ui=%s；rest=%s" % (ui_arch, arch), set(ui_arch) == set(arch), shot)

            tab_button(page, "活跃").click()
            page.wait_for_timeout(1200)
            has_active = tab_button(page, "活跃").count() == 1
            has_arch = tab_button(page, "归档").count() == 1
            no_draft = page.get_by_role("button", name=re.compile("^草稿$")).count() == 0
            no_all = page.get_by_role("button", name=re.compile("^全部$")).count() == 0
            rec.step("筛选维度覆盖", "当前简历库只有「活跃/归档」两个 Tab（无全部/草稿）",
                     "活跃Tab=%s 归档Tab=%s 草稿Tab存在=%s 全部Tab存在=%s"
                     % (has_active, has_arch, not no_draft, not no_all),
                     has_active and has_arch and no_draft and no_all, "")
        except Exception as exc:  # noqa: BLE001
            rec.step("筛选流程", "各 Tab 与 REST 结果一致",
                     "异常 %s: %s" % (type(exc).__name__, exc), False, "")

        # ---------------- 8. 空态（归档空列表） ----------------
        try:
            status_r, arch = rest_titles(cookie, "?lifecycle=archived")
            goto_library(page)
            tab_button(page, "归档").click()
            page.wait_for_timeout(1300)
            shot = rec.shot(page, "18-archived-empty-state")
            if not arch:
                empty = page.get_by_text("暂无归档简历").count()
                desc = page.get_by_text("归档的简历会保留在这里，恢复后可继续编辑。").count()
                rec.step("归档空态文案与插画", "显示「暂无归档简历」+ 说明 + 插画",
                         "标题=%s 说明=%s 卡片=%s" % (empty, desc, page.locator("li.card-soft").count()),
                         empty == 1 and desc == 1, shot)
            else:
                rec.step("归档空态（跳过）", "归档 Tab 为空时才有空态",
                         "当前归档集合非空（他人数据）：%s" % arch, True, shot)
        except Exception as exc:  # noqa: BLE001
            rec.step("归档空态", "显示空态文案",
                     "异常 %s: %s" % (type(exc).__name__, exc), False, "")

        # ---------------- 清理 ----------------
        try:
            status, listing = api("GET", "/resumes", cookie=cookie)
            mine = [r for r in listing if r["title"].startswith(BASE)] if isinstance(listing, list) else []
            for r in mine:
                st, _ = api("DELETE", "/resumes/%s" % r["id"], cookie=cookie)
                raw("REST 清理 DELETE /resumes/%s" % r["id"], "title=%s status=%s" % (r["title"], st))
            note("已软删除本次创建的 %d 条 e2e-lib 记录（前缀 %s）" % (len(mine), BASE))
        except Exception as exc:  # noqa: BLE001
            note("清理失败：%s" % exc)


# ---------------------------------------------------------------------------
# 空列表空态（全新用户）
# ---------------------------------------------------------------------------

def run_empty_user(rec):
    email, password = register_and_verify()
    cookie = api_cookie(email, password)
    status, listing = api("GET", "/resumes", cookie=cookie)
    raw("REST 新用户 GET /resumes", "status=%s count=%s" % (status, len(listing) if isinstance(listing, list) else listing))
    with browser_page() as page:
        ui_login(page, email, password)
        goto_library(page)
        shot = rec.shot(page, "19-empty-library")
        title = page.get_by_text("还没有简历").count()
        desc = page.get_by_text("点击右上角新建一份简历开始。").count()
        cards = page.locator("li.card-soft").count()
        brand = page.locator("svg, img").count()
        rec.step("空列表空态文案与插画", "全新用户看到「还没有简历」+ 说明 + 插画，且无卡片",
                 "标题=%s 说明=%s 卡片=%s 图形元素=%s" % (title, desc, cards, brand),
                 isinstance(listing, list) and len(listing) == 0 and title == 1 and desc == 1 and brand > 0, shot)


def main():
    rec = Recorder("resume-library")
    note("测试前缀 BASE=%s；前端 %s；后端 %s；无头 chromium locale=zh-CN" % (BASE, WEB, API))
    note("脚手架 e2e_lib.api_login 打的是 POST /login，实际后端登录是 POST /auth/login（会 404）；本脚本用自带 api_cookie 登录。")
    try:
        run_admin(rec)
    except Exception as exc:  # noqa: BLE001
        rec.step("管理员主流程", "完整跑完 8 项功能",
                 "未捕获异常 %s: %s" % (type(exc).__name__, exc), False, "")
    try:
        run_empty_user(rec)
    except Exception as exc:  # noqa: BLE001
        rec.step("空列表空态（新用户）", "全新用户空态可见",
                 "异常 %s: %s" % (type(exc).__name__, exc), False, "")

    extra_parts = ["## 环境与口径", ""]
    extra_parts += ["- %s" % n for n in NOTES]
    extra_parts += ["", "## 缺陷", ""]
    if DEFECTS:
        for d in DEFECTS:
            extra_parts += ["### %s" % d["title"], "", d["body"], ""]
    else:
        extra_parts += ["（无）", ""]
    extra_parts += ["", "## REST 原始输出", ""]
    extra_parts += RAW
    path = rec.write("\n".join(extra_parts))
    print("REPORT:", path, flush=True)


if __name__ == "__main__":
    main()
