// SCR-006 JD 详情与岗位微调。顶部固定摘要锁定「JD revision + Resume 基线 + 操作方式」。
// 改选微调目标不自动换绑（C-13 / BR-D12）；复制创建需确认（BR-D11）；
// JD revision 与 Resume 基线双重校验（BR-D08）。

import { Link, useNavigate } from "react-router-dom"
import { useState } from "react"
import type { JobDescription, Resume } from "@/lib/types"
import { JdBindingBadge } from "@/components/kit/badges"
import { PageHeader } from "@/components/kit/toolbar"
import { cn } from "@/lib/utils"
import { ArrowLeft, Building2, Copy, Link2, PencilLine } from "lucide-react"

type Op = "direct" | "copy"

export function JdTuning({ jd, resumes }: { jd: JobDescription; resumes: Resume[] }) {
  const navigate = useNavigate()
  const boundAvailable = jd.boundResumeId && jd.boundResumeAvailable !== false
  const [targetId, setTargetId] = useState(boundAvailable ? jd.boundResumeId! : resumes[0]?.id ?? "")
  const [op, setOp] = useState<Op>("direct")
  const [rebind, setRebind] = useState(false)

  const target = resumes.find((r) => r.id === targetId)
  const isReselected = targetId !== jd.boundResumeId
  const multiRef = (target?.boundByJdIds.length ?? 0) > 1

  function launch() {
    // 前端演示：真实实现会创建绑定 JD 的 Agent 任务，并进入编辑工作台的 Run 面板。
    navigate(`/resumes/${targetId}?panel=run`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${jd.role}${jd.company ? " · " + jd.company : ""}`}
        description="查看岗位原文，明确微调目标与操作方式，再进入岗位相关 Diff。"
        actions={
          <Link to="/jds" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <ArrowLeft className="size-4" aria-hidden /> 返回 JD 库
          </Link>
        }
      />

      {/* 顶部固定摘要：锁定写入目标 */}
      <div className="card-frame sticky top-2 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 p-3 text-xs">
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">JD</span><code className="font-mono text-foreground">rev.{jd.revision}</code></span>
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">写入目标</span><span className="font-medium text-foreground">{target?.title ?? "未选择"}</span></span>
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">基线</span><code className="font-mono text-foreground">{target?.currentVersionId ?? "—"}</code></span>
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">操作方式</span><span className="font-medium text-foreground">{op === "direct" ? "直接微调" : "复制后微调"}</span></span>
        {isReselected ? <JdBindingBadge kind="reselected" /> : jd.boundResumeId ? <JdBindingBadge kind="bound" /> : <JdBindingBadge kind="unbound" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* 左：JD 原文 */}
        <article className="card-soft p-5">
          <div className="flex flex-wrap items-center gap-2">
            {jd.company ? <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Building2 className="size-3.5" aria-hidden /> {jd.company}</span> : null}
            <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">rev.{jd.revision}</span>
            {jd.sourceUrl ? (
              <a href={jd.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-cobalt hover:underline">
                <Link2 className="size-3" aria-hidden /> 来源
              </a>
            ) : null}
          </div>
          <h2 className="mt-3 text-sm font-semibold text-foreground">岗位描述</h2>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-7 text-foreground/90">{jd.body}</p>
          <div className="mt-4 flex gap-2 border-t border-border pt-3">
            <button className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
              <PencilLine className="size-3.5" aria-hidden /> 编辑（生成新 revision）
            </button>
          </div>
        </article>

        {/* 右：微调目标选择（SCR-104 内联） */}
        <aside className="card-soft h-fit space-y-4 p-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">选择微调目标简历</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.id === jd.boundResumeId ? "（当前绑定）" : ""}
                  {r.lifecycle === "archived" ? "（已归档）" : ""}
                </option>
              ))}
            </select>
            {isReselected ? <p className="mt-1.5 text-xs text-gold">已改选目标，不会自动替换 JD 的当前绑定。</p> : null}
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-foreground">操作方式</legend>
            <div className="grid gap-2">
              {([
                { k: "direct", l: "直接微调所选简历", d: "在该简历上产生新版本" },
                { k: "copy", l: "复制后微调", d: "创建副本，原稿不变（需确认创建）" },
              ] as { k: Op; l: string; d: string }[]).map((o) => (
                <button
                  key={o.k}
                  onClick={() => setOp(o.k)}
                  aria-pressed={op === o.k}
                  className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors", op === o.k ? "border-cobalt bg-cobalt/5" : "border-border hover:bg-secondary")}
                >
                  {o.k === "copy" ? <Copy className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : <PencilLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span>
                    <span className="block text-sm font-medium text-foreground">{o.l}</span>
                    <span className="block text-xs text-muted-foreground">{o.d}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {op === "direct" && multiRef ? (
            <div className="rounded-lg border border-gold/60 bg-gold/15 p-2.5 text-xs leading-5 text-foreground">
              该简历被 {target?.boundByJdIds.length} 个 JD 引用。直接修改会影响所有关联岗位；如需隔离，请选择「复制后微调」。
            </div>
          ) : null}

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={rebind} onChange={(e) => setRebind(e.target.checked)} className="mt-0.5" />
            同时把此简历显式绑定为该 JD 的当前绑定
          </label>

          <button onClick={launch} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            {op === "copy" ? "确认复制并发起微调" : "发起岗位微调"}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">提交前会校验 JD revision 与 Resume 基线；任一变化会使旧确认失效并重新预览。</p>
        </aside>
      </div>
    </div>
  )
}
