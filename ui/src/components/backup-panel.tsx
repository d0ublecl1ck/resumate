// SCR-012 备份与迁移 + SCR-112 导入预览 Modal。
// 用「新增资源」与「不会覆盖的现有资源」分栏；同名资源不覆盖。
// 确认前不创建部分可见资源；历史 actor 仅作来源。

import { useState } from "react"
import type { ImportPreview } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AlertTriangle, Download, FileJson, FileText, Upload, X } from "lucide-react"

export function BackupPanel({ preview }: { preview: ImportPreview }) {
  const [importOpen, setImportOpen] = useState(false)
  return (
    <div className="space-y-6">
      <section className="card-soft p-5">
        <h2 className="text-sm font-bold text-foreground">导出完整备份</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          JSON 是完整恢复的权威载荷，包含 Profile/Resume/JD 全部版本、父子关系、事实来源、选材关联与时间/作者出处。Markdown 仅提供可读索引，不等价于完整备份。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <FileJson className="size-4" aria-hidden /> 导出 JSON（权威）
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <FileText className="size-4" aria-hidden /> 导出 Markdown 索引
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <Download className="size-4" aria-hidden /> 下载证据附件
          </button>
        </div>
      </section>

      <section className="card-soft p-5">
        <h2 className="text-sm font-bold text-foreground">导入结构化备份</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          导入前会校验格式版本与引用完整性，并预览新增资源与 ID 映射。确认后恢复为当前用户拥有的新资源，不覆盖同名的现有资源。
        </p>
        <button onClick={() => setImportOpen(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary">
          <Upload className="size-4" aria-hidden /> 选择备份文件并校验
        </button>
      </section>

      {importOpen ? <ImportModal preview={preview} onClose={() => setImportOpen(false)} /> : null}
    </div>
  )
}

function ImportModal({ preview, onClose }: { preview: ImportPreview; onClose: () => void }) {
  const c = preview.manifest.resourceCounts
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-foreground/40" aria-label="关闭" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="relative z-10 w-full max-w-xl card-frame max-h-[88vh] overflow-auto p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="import-title" className="font-serif text-xl font-bold text-foreground">导入预览</h2>
            <p className="mt-1 text-xs text-muted-foreground">格式 {preview.manifest.formatVersion} · 简历 {c.resumes} / 版本 {c.versions} / Profile {c.profiles} / 事实 {c.facts} / JD {c.jds}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label="关闭"><X className="size-5" /></button>
        </div>

        {preview.status === "has_issues" ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-coral/40 bg-coral/5 p-3 text-xs leading-5 text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-coral" aria-hidden />
            <div>
              <p className="font-medium text-coral">存在需注意的问题</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                {preview.missingReferences.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cobalt">将新增的资源</p>
            <ul className="space-y-1.5">
              {preview.newResources.map((r) => (
                <li key={r.title} className="rounded-md border border-cobalt/30 bg-cobalt/5 px-2.5 py-1.5 text-xs text-foreground">
                  <span className="text-muted-foreground">{r.type}</span> · {r.title}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">不会覆盖的现有资源</p>
            <p className="rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs leading-5 text-muted-foreground">同名资源不会被合并或覆盖，导入始终创建新资源并重新映射 ID。</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">绑定关系恢复</p>
          <ul className="space-y-1.5">
            {preview.bindingRestores.map((b) => (
              <li key={b.jd} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs">
                <span className="text-foreground">{b.jd} → {b.resume}</span>
                <span className={cn("rounded px-1.5 py-0.5 font-medium", b.status === "mapped" ? "bg-cobalt/10 text-cobalt" : "bg-gold/25 text-foreground")}>
                  {b.status === "mapped" ? "已映射" : "未绑定"}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">附件可迁移性</p>
          <ul className="space-y-1">
            {preview.manifest.attachments.map((a) => (
              <li key={a.name} className="flex items-center justify-between text-xs">
                <span className="text-foreground">{a.name}</span>
                <span className={a.downloadable ? "text-cobalt" : "text-muted-foreground"}>{a.downloadable ? "可迁移" : "不可导出"}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">取消</button>
          <button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">确认导入为新资源</button>
        </div>
      </div>
    </div>
  )
}
