#!/usr/bin/env python3
"""父代理独立复验：fix-ui 修复项在真实后端（8000）上端到端点一遍。"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from e2e_lib import Recorder, api, api_login, browser_page

TS = time.strftime("%m%d-%H%M%S")
rec = Recorder("fix-ui-verify")
cookie = api_login("admin@resumate.dev", "resumate-admin")

# 准备：REST 造 JD（UI 新建需要 AI 解析，凭证 BLOCKED），简历走 UI 复制链路
st, jd = api("POST", "/jds", cookie=cookie, body={"role": "E2E复验工程师%d" % int(time.time() % 100000),
                                                  "company": "E2E复验公司", "body": "需要精通 React 与 TypeScript，负责前端性能优化。"})
assert st == 201, (st, jd)
jd_id = jd["id"]
st, first = api("GET", "/resumes?lifecycle=active", cookie=cookie)
src_id = first[0]["id"]
st, clone = api("POST", "/resumes/%s/duplicate" % src_id, cookie=cookie)
my_resume = clone["id"]

with browser_page() as page:
    page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill("admin@resumate.dev")
    page.get_by_label("密码").fill("resumate-admin")
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)

    # ---- 简历卡片：重命名 / 标签 / 删除 ----
    page.goto("http://127.0.0.1:5173/resumes", wait_until="networkidle")
    page.wait_for_timeout(1800)
    card = page.locator("li,article,div").filter(has_text=clone["title"]).first
    rename_btn = page.get_by_role("button", name="重命名").first
    has_rename = rename_btn.count() > 0
    new_title = "E2E复验改名-%s" % TS
    if has_rename:
        rename_btn.click()
        page.wait_for_timeout(600)
        page.get_by_label("简历名称").fill(new_title)
        page.get_by_role("button", name="保存名称").click()
        page.wait_for_timeout(1800)
    st, after = api("GET", "/resumes/%s" % my_resume, cookie=cookie)
    rec.step("V1 简历卡重命名", "弹窗保存后 REST title 变更",
             "按钮=%s REST.title=%s" % (has_rename, after.get("title")), has_rename and after.get("title") == new_title,
             rec.shot(page, "v1-renamed"))

    tag_btn = page.get_by_role("button", name="编辑标签").first
    has_tag = tag_btn.count() > 0
    if has_tag:
        tag_btn.click()
        page.wait_for_timeout(600)
        page.get_by_role("dialog", name="编辑标签").get_by_role("textbox").first.fill("E2E标签%s" % TS)
        page.keyboard.press("Enter")
        page.wait_for_timeout(400)
        page.get_by_role("button", name="保存标签").click()
        page.wait_for_timeout(1800)
    st, after_tag = api("GET", "/resumes/%s" % my_resume, cookie=cookie)
    rec.step("V2 简历卡编辑标签", "保存后 REST tags 含新标签",
             "按钮=%s REST.tags=%s" % (has_tag, after_tag.get("tags")), has_tag and ("E2E标签%s" % TS) in (after_tag.get("tags") or []),
             rec.shot(page, "v2-tags"))

    # ---- JD 详情：编辑 / 解绑 / 删除 ----
    st, resume2 = api("PUT", "/jds/%s/binding" % jd_id, cookie=cookie, body={"resumeId": my_resume})
    page.goto("http://127.0.0.1:5173/jds/%s" % jd_id, wait_until="networkidle")
    page.wait_for_timeout(1800)
    edit_btn = page.get_by_role("button", name="编辑（生成新 revision）")
    has_edit = edit_btn.count() > 0
    rev_before = api("GET", "/jds/%s" % jd_id, cookie=cookie)[1].get("revision")
    if has_edit:
        edit_btn.first.click()
        page.wait_for_timeout(800)
        page.get_by_role("dialog").get_by_role("button", name="保存").first.click()
        page.wait_for_timeout(2000)
    rev_after = api("GET", "/jds/%s" % jd_id, cookie=cookie)[1].get("revision")
    rec.step("V3 JD 编辑按钮不再是死按钮", "点击后有弹窗且 revision 递增",
             "按钮=%s rev=%s→%s" % (has_edit, rev_before, rev_after), has_edit and rev_after > rev_before,
             rec.shot(page, "v3-jd-edited"))

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1800)
    match_panel = page.get_by_text("岗位匹配").count()
    unbind_btn = page.get_by_role("button", name="解除绑定")
    has_unbind = unbind_btn.count() > 0
    if has_unbind:
        unbind_btn.first.click()
        page.wait_for_timeout(1500)
    bound = api("GET", "/jds/%s" % jd_id, cookie=cookie)[1].get("boundResumeId")
    rec.step("V4 JD 详情岗位匹配区块 + 解绑", "匹配区块渲染；解绑后 REST 绑定为空",
             "match区块=%s 解绑按钮=%s boundResumeId=%s" % (match_panel, has_unbind, bound),
             match_panel >= 1 and has_unbind and not bound, rec.shot(page, "v4-match-unbind"))

    del_btn = page.get_by_role("button", name="删除")
    has_del = del_btn.count() > 0
    if has_del:
        del_btn.first.click()
        page.wait_for_timeout(600)
        page.get_by_role("dialog").get_by_role("button", name="确认删除").first.click()
        page.wait_for_timeout(2000)
    st_jd, _ = api("GET", "/jds/%s" % jd_id, cookie=cookie)
    rec.step("V5 JD 删除", "确认后 JD 详情 404",
             "删除按钮=%s GET /jds/{id}=%s" % (has_del, st_jd), has_del and st_jd == 404, rec.shot(page, "v5-jd-deleted"))

    # ---- Profile 事实删除 ----
    st, fact = api("POST", "/profile/facts", cookie=cookie,
                   body={"type": "skill", "title": "E2E复验事实%s" % TS, "content": "用于复验删除入口",
                         "tags": [], "evidence": {"status": "verified"}, "visibility": "private"})
    assert st == 201, (st, fact)
    page.goto("http://127.0.0.1:5173/profile", wait_until="networkidle")
    page.wait_for_timeout(2000)
    fact_del = page.get_by_role("button", name="删除「E2E复验事实%s」" % TS)
    has_fact_del = fact_del.count() > 0
    if has_fact_del:
        fact_del.first.click()
        page.wait_for_timeout(700)
        page.get_by_role("dialog").get_by_role("button", name="确认删除").first.click()
        page.wait_for_timeout(1800)
    st_f, _ = api("GET", "/profile/facts/%s" % fact["id"], cookie=cookie)
    rec.step("V6 事实删除入口", "确认后 GET /profile/facts/{id} 404",
             "删除按钮=%s 详情=%s" % (has_fact_del, st_f), has_fact_del and st_f == 404, rec.shot(page, "v6-fact-deleted"))

    # ---- 清理：删掉复验简历 ----
    api("DELETE", "/resumes/%s" % my_resume, cookie=cookie)
    errs = [c for c in page.console_log if c.startswith("pageerror")]
    rec.step("控制台无 JS 异常", "无 pageerror", "pageerror=%s" % errs[:2], len(errs) == 0)

print(rec.write("jd=%s resume=%s" % (jd_id, my_resume)))