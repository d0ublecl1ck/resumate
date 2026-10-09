# agent-turn E2E 证据

| # | 步骤 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | 准备：带章节的简历 | 200 | status=200 resume=res_5d03043b283b base=ver_427a9d3f1964 | PASS |  |
| 2 | P1 发起真实 Agent 轮次 | 202 run_id | status=202 body={"runId": "run_c6625c2f4197", "status": "started"} | PASS |  |
| 3 | P1 轮次结束状态 | 能拿到结束状态（真实模型凭证可用时应产生 Diff） | state=cancelled result={"state": "cancelled", "resumeId": "res_5d03043b283b", "versionId": null, "changeCount": 0, "affectedSections": [], "message": "runtime aborted: MODEL_ERROR", "idempotentReplay": false, "baseRebased": false} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/agent-turn/raw/02-run-turn.json |
| 4 | P2 创建轮次（审批模式） | 201 且 executionMode=approval | status=201 id=turn_cfee76cfe619 mode=approval | PASS |  |
| 5 | P2 非法补丁校验 | valid=false 且带错误码 | status=200 {"valid": false, "errors": [{"opIndex": 0, "code": "SECTION_NOT_FOUND", "message": "章节 sec_missing 不存在"}]} | PASS |  |
| 6 | P2 preview 生成 Diff 与待办 | valid=true + diff 非空 + 审批模式下有待办 | status=200 valid=True diff=1 pendingAction=pa_17300f37cde3 requiresConfirmation=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/agent-turn/raw/05-preview.json |
| 7 | P2 未审批 apply 被拒 | 409 PENDING_ACTION_NOT_APPROVED | status=409 body={"code": "PENDING_ACTION_NOT_APPROVED", "message": "审批模式下需要先预览并通过审批的待办"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/agent-turn/raw/06-apply-unapproved.json |
| 8 | P2 审批待办 | 200 state=approved | status=200 state=approved | PASS |  |
| 9 | P2 审批后内容被篡改的 apply 被拒 | 409 PENDING_ACTION_STALE（防篡改） | status=409 body={"code": "PENDING_ACTION_STALE", "message": "应用内容与批准的预览不一致"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/agent-turn/raw/06b-apply-tampered.json |
| 10 | P2 审批后 apply | 200 applied=true 且 working_revision>=1 | status=200 applied=True rev=1 sections=['工作经历'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/agent-turn/raw/08-apply.json |
| 11 | P2 同 idempotencyKey 重放 | 200 idempotent_replay=true 且 revision 不变 | status=200 replay=True rev=1 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/agent-turn/raw/09-apply-replay.json |
| 12 | P2 工作副本已更新 | working-document 含 E2E 修订标题 | status=200 dirty=True rev=1 title=高级前端工程师（E2E 修订） | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/agent-turn/raw/10-working-document.json |
| 13 | P2 finalize 落成 agent 版本 | 200 且新增 source=agent 版本 | status=200 agent_versions=1 messages=['创建简历', 'E2E 初始文档', 'E2E finalize'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/agent-turn/raw/11-finalize.json |
| 14 | P2 finalize 幂等重放 | 同 key 重放不新增版本 | status=200 versions_before=3 versions_after=3 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/agent-turn/raw/11-finalize.json |
| 15 | P3 SSE 首帧与心跳 | 连接后立即有 event 帧，长连期间有心跳帧 | 耗时=19.0s events=['event: snapshot'] heartbeats=1 head=retry: 3000 \|  \| id: 1 \| event: snapshot \| data: {"id":"turn_cfee76cfe619","scope":"resume","resumeId":"res_5d03043b283b","clientId":"external","source":"agent","execut | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/agent-turn/raw/12-sse.txt |

合计：15 通过 / 0 失败

简历 id：res_5d03043b283b / turn id：turn_cfee76cfe619