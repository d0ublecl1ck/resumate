// SCR-009 模板编辑与校验（管理员）。编辑布局/样式/分页/导出配置，
// 运行渲染校验并提交发布。D-03（预览延迟/PDF 容差）未冻结前只作占位。

import { Link } from "react-router-dom"
import { useState } from "react"
import type { ResumeTemplate } from "@/lib/types"
import { PageHeader } from "@/components/kit/toolbar"
import { cn } from "@/lib/utils"
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"

export function TemplateEditor({ template }: { template: ResumeTemplate }) {
  const [validation, setValidation] = useState<"idle" | "running" | "passed" | "failed">(
    template.validationErrors.length ? "failed" : "idle",
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={`编辑模板：${template.name}`}
        description={`当前修订 rev.${template.revision} · 被 ${template.referenceCount} 份简历引用`}
        actions={
          <Link to="/admin/templates" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <ArrowLeft className="size-4" aria-hidden /> 返回模板库
          </Link>
        }
      />

      <div className="rounded-lg border border-gold/60 bg-gold/15 p-3 text-xs leading-5 text-foreground">
        D-03（预览延迟目标、长简历样本、PDF 视觉容差、测试浏览器）尚未冻结。此页可编辑配置并运行结构校验，但不宣称满足视觉容差验收。
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card-soft space-y-4 p-5">
          <h2 className="text-sm font-bold text-foreground">模板配置</h2>
          {[
            { label: "布局", value: "单栏 · 页边距 18mm" },
            { label: "字体", value: "Noto Serif SC 标题 / Noto Sans SC 正文" },
            { label: "分页", value: "章节不跨页断行" },
            { label: "纸张", value: "A4 · 210 × 297mm" },
            { label: "导出配置", value: "PDF 300dpi · 内嵌字体" },
          ].map((f) => (
            <div key={f.label} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <input defaultValue={f.value} className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm text-foreground outline-none hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/30" />
            </div>
          ))}
        </section>

        <section className="card-soft space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">渲染校验</h2>
            <button
              onClick={() => {
                setValidation("running")
                setTimeout(() => setValidation(template.validationErrors.length ? "failed" : "passed"), 800)
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary"
            >
              运行校验
            </button>
          </div>

          <div className={cn("rounded-lg border p-3 text-sm", validation === "passed" ? "border-cobalt/40 bg-cobalt/5" : validation === "failed" ? "border-coral/40 bg-coral/5" : "border-border")}>
            {validation === "running" ? (
              <p className="inline-flex items-center gap-2 text-cobalt"><Loader2 className="size-4 animate-spin" aria-hidden /> 正在用边界样例校验…</p>
            ) : validation === "passed" ? (
              <p className="inline-flex items-center gap-2 text-cobalt"><CheckCircle2 className="size-4" aria-hidden /> 校验通过，可提交发布</p>
            ) : validation === "failed" ? (
              <div>
                <p className="mb-1.5 inline-flex items-center gap-2 font-medium text-coral"><AlertTriangle className="size-4" aria-hidden /> 存在未解决的渲染问题</p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-foreground">
                  {template.validationErrors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">尚未运行校验。发布前需通过边界样例校验。</p>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">边界样例</p>
            <ul className="mt-1.5 space-y-1 text-xs text-foreground">
              <li>· 超长标题与多行技能标签</li>
              <li>· 两页以上长简历分页</li>
              <li>· 空章节与缺省字段</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">保存草稿</button>
            <button
              disabled={validation !== "passed"}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              发布修订
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">发布新修订不会改变已引用简历的模板版本；旧版本仍可预览、导出。</p>
        </section>
      </div>
    </div>
  )
}
