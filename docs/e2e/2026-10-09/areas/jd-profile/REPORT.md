# jd-profile E2E 证据

| # | 步骤 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | JD 库页面加载 | 标题「JD 库」+ 列表可见 | 含「JD 库」=True；含预置 JD=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/01-jd-library.png |
| 2 | 新建 JD 弹窗可打开 | 出现「新增 JD」对话框 | dialog 可见=True；弹窗内含 AI 整理入口=True；解析前可手工填写的字段=无（必须先 AI 整理） | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/02-jd-create-modal.png |
| 3 | 粘贴中文 JD 解析（POST /jds:parse-text） | 解析出 岗位/公司/标签/正文 字段 | BLOCKED：模型调用失败，status=502 body={"code":"UPSTREAM_REJECTED","message":"模型服务拒绝凭证，请检查 API Key 与 provider 配置"}；UI 显示错误='整理失败\n\n模型服务暂时不可用，请重试。\n\n重试' | BLOCKED | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/03-jd-parse-text.png |
| 4 | 解析失败的错误态映射 | 显示映射文案且不透出后端 message 原文 | alert='整理失败\n\n模型服务暂时不可用，请重试。\n\n重试'；后端原文未出现在页面=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/03-jd-parse-text.png |
| 5 | JD 详情页渲染（预置数据） | 显示 岗位名 / 公司 / 正文 / rev.1 | role=True company=True body=True rev=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/04-jd-detail.png |
| 6 | 编辑 JD（生成新 revision） | 点击后出现编辑表单或发出 PATCH /jds/{id} | 按钮可点=True；点击后新增写请求=无；弹窗=0；页面 textarea=0 | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/05-jd-edit-click.png |
| 7 | 删除 JD | JD 列表或详情存在删除入口（DELETE /jds/{id}） | 列表按钮=['Resumate\n对话式简历工作台', '工作台', '简历库', '个人资料', 'JD 库', '模拟面试', '设置与 Agent', '模板库', '角色与权限', '退出登录', '新增 JD', 'e2e-jd-profile-20261009-150054-tag', 'e2e-jd-profile-20261009-150054-B', '发起岗位微调', 'e2e-jd-profile-20261009-150054-A', '发起岗位微调']；详情按钮=['Resumate\n对话式简历工作台', '工作台', '简历库', '个人资料', 'JD 库', '模拟面试', '设置与 Agent', '模板库', '角色与权限', '退出登录', '返回 JD 库', '编辑（生成新 revision）', '直接微调所选简历\n在该简历上产生新版本', '复制后微调\n创建副本，原稿不变（需确认创建）', '发起岗位微调']；命中删除入口=无 | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/06-jd-delete-scan.png |
| 8 | JD 详情未绑定态 | 未绑定 JD 的关系区不显示「当前绑定」徽标 | REST boundResumeId=None；页面绑定徽标=本次改选；关系徽标=False | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/07-jd-binding-unbound.png |
| 9 | 绑定简历后详情显示绑定关系 | 显示「当前绑定 · <简历名>」徽标 | REST PUT status=200 boundResumeId=res_0b9fb8439661；绑定徽标=True，含简历名=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/08-jd-binding-bound.png |
| 10 | 解绑（DELETE /jds/{id}/binding） | 详情存在解绑入口 | 详情按钮=['Resumate\n对话式简历工作台', '工作台', '简历库', '个人资料', 'JD 库', '模拟面试', '设置与 Agent', '模板库', '角色与权限', '退出登录', '返回 JD 库', '编辑（生成新 revision）', '直接微调所选简历\n在该简历上产生新版本', '复制后微调\n创建副本，原稿不变（需确认创建）', '发起岗位微调']；命中解绑入口=无 | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/09-jd-unbind-scan.png |
| 11 | 解绑后关系消失（REST 解绑 + 页面反映） | 详情不再显示「当前绑定」徽标 | REST DELETE status=200 boundResumeId=None；绑定徽标=False | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/10-jd-binding-released.png |
| 12 | 岗位匹配结果展示 | 详情页展示匹配得分/差距项 | 详情页命中匹配关键字=无；POST /profile/match-job -> 404 {"detail": "Not Found"} | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/11-jd-match-scan.png |
| 13 | 不存在的 JD 详情路由（空态/错误态） | 显示 404 未找到状态块 | 含「未找到」=True；含 404=True；页面摘要='Resumate 对话式简历工作台 工作台 简历库 个人资料 JD 库 模拟面试 设置与 Agent 管理员 模板库 角色与权限 管  管理员  超级管理员  退出登录  未找到该岗位 JD  它可能已被删除或从未存在。  错误码：404  返回工作台' | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/12-jd-not-found.png |
| 14 | Profile 页面加载 | 标题「个人资料」+ 完整度 + 分区 | 含「个人资料」=True；含「完善度」=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/13-profile-overview.png |
| 15 | 资料基础信息（basics）修改持久化 | 保存后即时可见，刷新后仍存在 | 保存后含城市=True；刷新后含城市=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/15-profile-basics-saved.png |
| 16 | 事实（fact）新增 | 技能分区出现新事实卡片 | 含标题=True；含内容=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/17-profile-fact-created.png |
| 17 | 事实（fact）编辑 | 卡片内容更新为新值 | 含新内容=True；旧内容已消失=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/19-profile-fact-edited.png |
| 18 | 事实（fact）删除 | 事实卡片存在删除入口（DELETE /profile/facts/{id}） | 页面按钮=['Resumate\n对话式简历工作台', '工作台', '简历库', '个人资料', 'JD 库', '模拟面试', '设置与 Agent', '模板库', '角色与权限', '退出登录', '对话维护资料', '生成简历', '编辑', '手动添加', '编辑', '手动添加', '描述一个你主导或参与的项目及其成果。', '手动添加', '填写你的学历，例如「2018 年硕士毕业于某大学计算机专业」。', '手动添加', '编辑', '编辑', '手动添加', '记录一次获奖或亮眼的量化成果。', '手动添加', '补充你考取的证书或资格认证。']；命中删除入口=无 | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/jd-profile/20-profile-fact-delete-scan.png |
| 19 | 事实反向引用删除影响（后端契约） | DELETE 返回 FactDeletionImpact.referencedBy 非空，且事实被删 | GET referencedBy=[{"resumeId": "res_5eae880be17b", "resumeTitle": "e2e-jd-profile-20261009-150054-简历-ref", "versionId": "ver_5618cf5ecfef"}]；DELETE status=200 body={"factId": "fact_08d08275f14d", "referencedBy": [{"resumeId": "res_5eae880be17b", "resumeTitle": "e2e-jd-profile-20261009-150054-简历-ref", "versionId": "ver_5618cf5ecfef"}]}；删除后 GET=404 {"code": "RESOURCE_NOT_FOUND", "message": "事实 fact_08d08275f14d 不存在"} | PASS |  |
| 20 | 事实反向引用影响提示（UI） | UI 可见被引用影响提示并让用户确认 | UI 无删除入口（见缺陷 5），无法触发；后端契约可用（上一步） | FAIL |  |

合计：13 通过 / 6 失败 / 1 BLOCKED（步骤 3 因模型调用失败按 CONTEXT 记 BLOCKED，不计入失败）

## 缺陷与环境阻塞

### 新建 JD 的 UI 结构

弹窗仅提供「粘贴文本 / 上传截图 → AI 整理 → 草案可编辑 → 创建 JD」，**没有**在解析前直接填写「岗位名称 / 公司 / 岗位描述」的手工创建入口。因此手工新建 JD 完全依赖模型解析成功。
### BLOCKED：JD 文本解析（模型调用失败）

**最小复现**：登录后在 /jds 点「新增 JD」→ 粘贴中文 JD → 点「AI 整理」。

```
POST /jds:parse-text -> 502
{"code":"UPSTREAM_REJECTED","message":"模型服务拒绝凭证，请检查 API Key 与 provider 配置"}
```

/models/config 显示 provider=deepseek、endpoint=https://api.deepseek.com/v1、model=deepseek-flash、keyConfigured=true，但上游拒绝凭证。属环境/凭证问题，不是 JD 解析逻辑缺陷；按 CONTEXT 要求记为 BLOCKED 而非 FAIL。UI 已按机器码映射为「模型服务暂时不可用，请重试。」，未透出后端原文。

### 缺陷 1：JD 编辑按钮是死按钮

**最小复现**：打开 /jds/jd_99d72625952a → 点「编辑（生成新 revision）」。

**现象**：无任何弹窗/内联表单出现，未发出任何 PATCH/PUT /jds/{id} 请求，页面无变化。源码 ui/src/components/jd-tuning.tsx:69-71 的该 button 没有 onClick，且 ui/src/lib/api.ts 中不存在 updateJd 函数。

**证据目录**：docs/e2e/2026-10-09/areas/jd-profile/（截图 *jd-edit-click.png）。

### 缺陷 2：JD 无删除入口

**最小复现**：分别打开 /jds 与 /jds/jd_99d72625952a，扫描全部可见按钮：

```
/jds 按钮: ['Resumate\n对话式简历工作台', '工作台', '简历库', '个人资料', 'JD 库', '模拟面试', '设置与 Agent', '模板库', '角色与权限', '退出登录', '新增 JD', 'e2e-jd-profile-20261009-150054-tag', 'e2e-jd-profile-20261009-150054-B', '发起岗位微调', 'e2e-jd-profile-20261009-150054-A', '发起岗位微调']
/jds/jd_99d72625952a 按钮: ['Resumate\n对话式简历工作台', '工作台', '简历库', '个人资料', 'JD 库', '模拟面试', '设置与 Agent', '模板库', '角色与权限', '退出登录', '返回 JD 库', '编辑（生成新 revision）', '直接微调所选简历\n在该简历上产生新版本', '复制后微调\n创建副本，原稿不变（需确认创建）', '发起岗位微调']
```

没有任何「删除」控件；ui/src/lib/api.ts 也不存在 deleteJd。后端 DELETE /jds/{id} 存在且可用（REST 预检 204）。

### 缺陷 3：JD 无解绑入口

**最小复现**：REST 绑定后打开 /jds/jd_649d532f4f89，扫描全部可见按钮：

```
['Resumate\n对话式简历工作台', '工作台', '简历库', '个人资料', 'JD 库', '模拟面试', '设置与 Agent', '模板库', '角色与权限', '退出登录', '返回 JD 库', '编辑（生成新 revision）', '直接微调所选简历\n在该简历上产生新版本', '复制后微调\n创建副本，原稿不变（需确认创建）', '发起岗位微调']
```

只有「同时把此简历显式绑定为该 JD 的当前绑定」复选框（改选目标时用，且仅随「发起岗位微调」跳转，不发送 binding 请求），没有任何解绑控件。ui/src/lib/api.ts 不存在 releaseBinding。后端 DELETE /jds/{id}/binding 可用（REST 预检 200）。

### 缺陷 4：岗位匹配（match）完全未实现

**最小复现**：打开 /jds/jd_99d72625952a，页面无任何匹配得分/差距项；直接 POST /profile/match-job 返回 404。

ui/src/lib/api.ts:377 的 matchJob 是纯前端桩（返回 JOB_MATCHES[jdId] 静态数据），且全仓库无任何调用方；后端也没有 match-job 路由（OpenAPI 中 /profile/match-job 不存在）。

### 缺陷 5：事实无删除入口，删除影响提示无法在 UI 出现

**最小复现**：打开 /profile，任意事实卡片只有「编辑」按钮，无「删除」。全部可见按钮：

```
['Resumate\n对话式简历工作台', '工作台', '简历库', '个人资料', 'JD 库', '模拟面试', '设置与 Agent', '模板库', '角色与权限', '退出登录', '对话维护资料', '生成简历', '编辑', '手动添加', '编辑', '手动添加', '描述一个你主导或参与的项目及其成果。', '手动添加', '填写你的学历，例如「2018 年硕士毕业于某大学计算机专业」。', '手动添加', '编辑', '编辑', '手动添加', '记录一次获奖或亮眼的量化成果。', '手动添加', '补充你考取的证书或资格认证。']
```

ui/src/components/profile-workspace.tsx 无删除处理，ui/src/lib/api.ts 无 deleteFact，i18n profile.ts 也无删除相关键。因此 FactDeletionImpact 的反向引用影响提示在 UI 上无从触发。

**后端契约已可用**：先建事实 F，再建一份 version 快照里 provenance.factId=F 的简历，DELETE /profile/facts/F 返回的 referencedBy 含该简历与版本；删除后 GET /profile/facts/F 404。缺口纯在前端。

## 环境噪声（非缺陷）

- vite worktree node_modules 软链导致 geist-*.woff2 403，字体回退。
- 未登录时 /api/auth/me 401 正常。


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

```
/usr/bin/python3 <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts/jd_profile_e2e.py
/usr/bin/python3 <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts/jd_profile_finalize.py
```


## 归属判定（排除并发改动）

上述 JD/Profile 缺口在 HEAD（未受 workflow A 并发改动影响）就已存在，不是并发改动导致：

- git show HEAD:ui/src/components/jd-tuning.tsx：编辑按钮同样没有 onClick。
- git show HEAD:ui/src/lib/api.ts：不存在 updateJd / deleteJd / releaseBinding / deleteFact；matchJob 仍是前端桩。
- git show HEAD:ui/src/components/profile-workspace.tsx：无事实删除逻辑。
- git show HEAD:backend/app/modules/profile/api.py：无 match-job 路由。
- git diff HEAD -- ui/src/lib/api.ts：仅 +14 行 interview 增量，无 JD/Profile 删减。

## 数据清理

本次及历史 e2e-jd-profile-* 测试数据（JD / resume / fact）已全部删除，复查残留为 0；
报告中出现的 jd_/res_/fact_ id 是当次运行证据，重新运行脚本会生成新 id。
