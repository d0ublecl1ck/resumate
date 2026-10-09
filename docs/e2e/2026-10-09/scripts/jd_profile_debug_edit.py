#!/usr/bin/env python3
import sys, re
ROOT = "<本机用户名>/resumate-worktrees/zj-fwwb-2026"
sys.path.insert(0, ROOT + "/docs/e2e/2026-10-09/scripts")
from e2e_lib import browser_page, api
from jd_profile_common import login_cookie, ui_login, body_text

cookie = login_cookie()
with browser_page() as page:
    ui_login(page)
    page.goto("http://127.0.0.1:5173/profile", wait_until="networkidle")
    page.wait_for_timeout(2000)
    txt = body_text(page)
    m = re.search(r"(e2e-jd-profile-[\d-]+-技能事实)", txt)
    print("FACT_TITLE:", m.group(1) if m else None)
    print("textarea count before:", page.locator("textarea").count())
    print("aria-labels:", page.locator("[aria-label]").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")[:40])
    if m:
        page.get_by_label("编辑「%s」" % m.group(1)).click()
        page.wait_for_timeout(1200)
        print("--- after click ---")
        print("textarea count:", page.locator("textarea").count())
        print("first textarea visible:", page.locator("textarea").first.is_visible() if page.locator("textarea").count() else "n/a")
        labels = page.locator("label").evaluate_all("els => els.map(e => (e.innerText||'').trim()).filter(Boolean)")
        print("labels:", labels[:30])
        print("get_by_label 内容 exact count:", page.get_by_label("内容", exact=True).count())
        print("get_by_label 内容 count:", page.get_by_label("内容").count())
        try:
            names = page.get_by_label("内容").evaluate_all("els => els.map(e => e.tagName + ':' + (e.getAttribute('aria-label')||''))")
            print("matched els:", names)
        except Exception as exc:
            print("eval err", exc)
        page.screenshot(path=ROOT + "/docs/e2e/2026-10-09/areas/jd-profile/debug-fact-edit.png", full_page=True)
