// SCR-007 版本历史与比较 + SCR-103 恢复确认 Modal。
// 恢复通过新版本表达，不覆盖历史（C-03）。可比较非相邻两版。

import { Link } from "react-router-dom"
import { useState } from "react"
import type { Resume, ResumeVersion } from "@/lib/types"
import { VersionTimeline } from "@/components/kit/version-timeline"
import { PageHeader } from "@/components/kit/toolbar"
import { StateBlock } from "@/components/kit/state-block"
import { ArrowLeft, GitCompare, X } from "lucide-react"

export function VersionHistory({ resume }: { resume: Resume }) {
  const [selected, setSelected] = useState<string[]>([])
  const [restoreTarget, setRestoreTarget] = useState<ResumeVersion | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string>("all")

  const versions = resume.versions.filter((v) => (sourceFilter === "all" ? true : v.source === sourceFilter))

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? [prev[1], id] : [...prev, id]))
  }

  const compareA = resume.versions.find((v) => v.id === selected[0])
  const compareB = resume.versions.find((v) => v.id === selected[1])

  return (
    <div className="space-y-6">
      <PageHeader
        title="版本历史与比较"
        description={`${resume.title} · 不可变版本记录来源、作者、模式与父子关系。恢复会生成新版本，历史保留。`}
        actions={
          <Link to={`/resumes/${resume.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <ArrowLeft className="size-4" aria-hidden /> 返回编辑
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">按来源筛选：</span>
        {[
          { k: "all", l: "全部" },
          { k: "manual", l: "手动" },
          { k: "agent", l: "Agent" },
          { k: "restore", l: "恢复" },
        ].map((f) => (
          <button
            key={f.k}
            onClick={() => setSourceFilter(f.k)}
            aria-pressed={sourceFilter === f.k}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${sourceFilter === f.k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary"}`}
          >
            {f.l}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {versions.length ? (
          <VersionTimeline versions={versions} currentVersionId={resume.currentVersionId} selected={selected} onToggleSelect={toggle} onRestore={(id) => setRestoreTarget(resume.versions.find((v) => v.id === id) ?? null)} />
        ) : (
          <StateBlock kind="empty" title="没有该来源的版本" description="切换筛选条件查看其它来源的版本。" />
        )}

        {/* 比较区 */}
        <aside className="card-soft h-fit p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <GitCompare className="size-4 text-cobalt" aria-hidden /> 版本比较
          </div>
          {selected.length < 2 ? (
            <p className="text-sm text-muted-foreground">在时间线中选择两个版本（可非相邻）进行比较。已选 {selected.length}/2。</p>
          ) : compareA && compareB ? (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                比较 <code className="font-mono text-foreground">{compareA.id}</code> ↔ <code className="font-mono text-foreground">{compareB.id}</code>
              </p>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-foreground">{compareB.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">较早：{compareA.message}</p>
                <p className="mt-2 text-xs text-muted-foreground">变更章节：{Array.from(new Set([...compareA.affectedSections, ...compareB.affectedSections])).join("、") || "无"}</p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {restoreTarget ? <RestoreModal version={restoreTarget} onClose={() => setRestoreTarget(null)} /> : null}
    </div>
  )
}

function RestoreModal({ version, onClose }: { version: ResumeVersion; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-foreground/40" aria-label="关闭" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="restore-title" className="relative z-10 w-full max-w-md card-frame p-6">
        <div className="flex items-start justify-between">
          <h2 id="restore-title" className="font-serif text-xl font-bold text-foreground">恢复到此版本？</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label="关闭"><X className="size-5" /></button>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          将以 <code className="font-mono text-foreground">{version.id}</code>（{version.message}）为目标恢复。
        </p>
        <ul className="mt-3 space-y-1.5 rounded-lg bg-secondary p-3 text-xs leading-5 text-secondary-foreground">
          <li>· 恢复会生成一个来源为「恢复」的新版本，不会覆盖任何历史版本。</li>
          <li>· 当前未提交的草稿会先 flush，再以新的编辑会话提交恢复结果。</li>
          <li>· 即使在 Full Access 模式下，此高影响操作仍需确认。</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">取消</button>
          <button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">确认恢复为新版本</button>
        </div>
      </div>
    </div>
  )
}
