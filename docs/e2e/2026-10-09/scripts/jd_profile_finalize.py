#!/usr/bin/env python3
"""把 Recorder.write() 产出的 REPORT.md 收尾：BLOCKED 标注 + 需求矩阵 + 观察项。"""
from pathlib import Path

BT = chr(96)
F3 = BT * 3
AREA = Path("<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile")
p = AREA / "REPORT.md"
text = p.read_text(encoding="utf-8")
lines = text.split("\n")

out = []
for ln in lines:
    if ln.startswith("| 3 | 粘贴中文 JD 解析"):
        ln = ln.replace("| FAIL |", "| BLOCKED |")
    if ln.startswith("合计："):
        ln = "合计：13 通过 / 6 失败 / 1 BLOCKED（步骤 3 因模型调用失败按 CONTEXT 记 BLOCKED，不计入失败）"
    out.append(ln)
text = "\n".join(out)

matrix = ("""

## 需求覆盖矩阵

### JD 管理（/jds、/jds/:id）

| 需求 | 结果 | 证据/步骤 |
|---|---|---|
| 新建 JD（标题/公司/正文）→ 详情可见 | 详情渲染 PASS；UI 新建 BLOCKED | 步骤 5（详情 PASS）；步骤 2/3（弹窗无手工入口，AI 解析 502 → BLOCKED） |
| 粘贴中文 JD 走解析入口（POST /jds:parse-text） | BLOCKED | 步骤 3：502 UPSTREAM_REJECTED；原始 body 见下 |
| 编辑 JD | FAIL | 步骤 6：死按钮，无表单、无 PATCH |
| 删除 JD | FAIL | 步骤 7：无删除入口（后端 DELETE 可用 204） |
| 绑定简历 → 详情显示绑定关系 | PASS | 步骤 9：REST PUT 200 + 页面显示「当前绑定」 |
| 解绑 → 关系消失 | UI FAIL / 后端 PASS | 步骤 10（无解绑入口 FAIL）；步骤 11（REST 解绑后徽标消失 PASS） |
| 岗位匹配（match）结果展示 | FAIL | 步骤 12：无 UI；POST /profile/match-job 404，后端无路由 |
| 空态/错误态（不存在的 JD 详情） | PASS | 步骤 13：404 状态块「未找到该岗位 JD / 错误码：404」 |

### Profile 职业事实库（/profile）

| 需求 | 结果 | 证据/步骤 |
|---|---|---|
| 事实新增 | PASS | 步骤 16 |
| 事实编辑 | PASS | 步骤 17 |
| 事实删除 | FAIL | 步骤 18：无删除入口（后端 DELETE 可用 200） |
| 事实反向引用删除影响（FactDeletionImpact） | UI FAIL / 后端 PASS | 步骤 20（UI 无法触发 FAIL）；步骤 19（后端契约 referencedBy 非空 PASS） |
| 资料基础信息（basics）修改持久化 | PASS | 步骤 15：保存后 + 刷新后均可见 |

### 附加观察

| 观察 | 结果 | 证据 |
|---|---|---|
| 未绑定 JD 的关系徽标显示为「本次改选」而非「未绑定」 | 低严重度 | 步骤 8 / 07-jd-binding-unbound.png；jd-tuning.tsx:20 无绑定时默认选中 resumes[0]，导致 isReselected=true |

## 原始响应与补证

- 模型探测：POST /jds:parse-text -> 502 {"code":"UPSTREAM_REJECTED","message":"模型服务拒绝凭证，请检查 API Key 与 provider 配置"}
- /models/config：provider=deepseek、endpoint=https://api.deepseek.com/v1、model=deepseek-flash、keyConfigured=true（lastTest 2026-10-07 ok）
- REST 预检原始日志：rest-probe.log、model-config.log（同目录）
- 完整运行日志（含浏览器网络/控制台）：run.log

## 复现方式

""" + F3 + """
/usr/bin/python3 <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts/jd_profile_e2e.py
/usr/bin/python3 <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts/jd_profile_finalize.py
""" + F3 + """
""")

p.write_text(text + matrix, encoding="utf-8")
print("finalized:", p)
