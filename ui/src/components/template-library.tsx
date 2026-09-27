// SCR-008 模板库（管理员）。突出「可新选用」与「已有引用仍可用」的区别。
// 已引用模板不能物理删除（BR-D15）；新修订不改变已有 Resume 的模板版本（BR-D16）。

import { Link } from "react-router-dom"
import { useState } from "react"
import type { ResumeTemplate, TemplateStatus } from "@/lib/types"
import { PageHeader } from "@/components/kit/toolbar"
import { cn } from "@/lib/utils"
import { AlertTriangle, Plus } from "lucide-react"

const STATUS_META: Record<TemplateStatus, { label: string; tone: string }> = {
  draft: { label: "草稿", tone: "text-muted-foreground border-border bg-muted" },
  validating: { label: "校验中", tone: "text-cobalt border-cobalt/40 bg-cobalt/5" },
  validation_failed: { label: "校验失败", tone: "text-coral border-coral/40 bg-coral/5" },
  published: { label: "已发布", tone: "text-cobalt border-cobalt/40 bg-cobalt/5" },
  retired: { label: "已下架", tone: "text-muted-foreground border-border bg-muted" },
}

export function TemplateLibrary({ templates }: { templates: ResumeTemplate[] }) {
  const [filter, setFilter] = useState<string>("all")
  const items = templates.filter((t) => (filter === "all" ? true : t.status === filter))

  return (
    <div className="space-y-6">
      <PageHeader
        title="模板库"
        description="管理员管理模板集合。此页只呈现模板资源，不加载求职者私有 Profile / Resume。"
        actions={
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> 新建模板
          </button>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {[
          { k: "all", l: "全部" },
          { k: "published", l: "已发布" },
          { k: "draft", l: "草稿" },
          { k: "retired", l: "已下架" },
        ].map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            aria-pressed={filter === f.k}
            className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", filter === f.k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary")}
          >
            {f.l}
          </button>
        ))}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((t) => (
          <li key={t.id} className="card-soft p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link to={`/admin/templates/${t.id}`} className="font-serif text-lg font-bold text-foreground hover:underline">{t.name}</Link>
                <p className="mt-0.5 text-xs text-muted-foreground">当前修订 rev.{t.revision} · 发布者 {t.publisher}</p>
              </div>
              <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium", STATUS_META[t.status].tone)}>{STATUS_META[t.status].label}</span>
            </div>

            <p className="mt-3 text-sm text-foreground">
              被 <span className="font-semibold">{t.referenceCount}</span> 份简历引用
              {t.referenceCount > 0 ? <span className="text-muted-foreground">（不能物理删除）</span> : null}
            </p>
            {t.status === "retired" && t.retiredReason ? <p className="mt-1 text-xs text-muted-foreground">下架原因：{t.retiredReason}</p> : null}
            {t.validationErrors.length ? (
              <div className="mt-2 flex items-start gap-1.5 rounded-md border border-coral/40 bg-coral/5 p-2 text-xs text-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                <span>{t.validationErrors.length} 个校验问题待处理</span>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              <Link to={`/admin/templates/${t.id}`} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">编辑与校验</Link>
              {t.status === "published" ? (
                <button className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">下架</button>
              ) : t.status === "retired" ? (
                <button className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">重新上架</button>
              ) : null}
              <button
                disabled={t.referenceCount > 0}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                title={t.referenceCount > 0 ? "已被引用，需先下架" : undefined}
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
