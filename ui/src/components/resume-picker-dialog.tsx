// SCR-101 第二步：从现有简历复制时的大弹层选择器（网格卡片）。
// 纯选择组件：不发起任何请求，选中的 id 交给调用方创建副本。
// 模态交互（Esc 关闭、焦点陷阱、背景 inert）全部交给 ui/components/ui/modal.tsx 原语，
// 本组件不手写遮罩与焦点管理；组件挂载期间即弹层打开，关闭由父级卸载完成。

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { SaveStateBadge } from "@/components/kit/badges"
import { Modal } from "@/components/ui/modal"
import type { Resume } from "@/lib/types"

export function ResumePickerDialog({
  resumes,
  selectedId,
  onSelect,
  onCancel,
  onConfirm,
  busy,
  error,
}: {
  resumes: Resume[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCancel: () => void
  onConfirm: () => void
  busy: boolean
  error: string | null
}) {
  const { t } = useTranslation()

  return (
    <Modal
      open
      onOpenChange={(next) => {
        // Esc、关闭按钮与遮罩点击都走这里；父级收到 onCancel 后卸载弹层。
        if (!next) onCancel()
      }}
      title={t("resume.create.copyPick.title")}
      description={t("resume.create.copyPick.description")}
      className="max-w-5xl"
    >
      {resumes.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">{t("resume.create.copyPick.empty")}</p>
      ) : (
        <ul
          role="group"
          aria-label={t("resume.create.copyPick.title")}
          className="mt-5 grid max-h-[60vh] gap-4 overflow-auto sm:grid-cols-2 lg:grid-cols-3"
        >
          {resumes.map((resume) => {
            const selected = selectedId === resume.id
            return (
              <li key={resume.id}>
                <button
                  onClick={() => onSelect(resume.id)}
                  disabled={busy}
                  aria-pressed={selected}
                  className={cn(
                    "h-full w-full rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    selected ? "border-cobalt bg-cobalt/5" : "border-border bg-card hover:bg-secondary",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 font-serif text-base font-bold text-foreground">{resume.title}</span>
                    <SaveStateBadge state={resume.saveState} className="shrink-0" />
                  </span>
                  {resume.targetRole.trim() ? (
                    <span className="mt-1.5 block text-xs text-muted-foreground">
                      {t("resume.library.targetRole", { role: resume.targetRole })}
                    </span>
                  ) : null}
                  {resume.tags.length ? (
                    <span className="mt-2.5 flex flex-wrap gap-1.5">
                      {resume.tags.map((tag) => (
                        <span key={tag} className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                          {tag}
                        </span>
                      ))}
                    </span>
                  ) : null}
                  <span className="mt-3 block text-[11px] text-muted-foreground">
                    {t("resume.library.templateRevision", { revision: resume.templateVersion })}
                    {" · "}
                    {t("resume.library.lastEdited", { date: resume.updatedAt.slice(0, 16).replace("T", " ") })}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {error ? <p role="alert" className="mt-4 text-sm text-coral">{error}</p> : null}

      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">
          {t("common.actions.cancel")}
        </button>
        <button
          onClick={onConfirm}
          disabled={!selectedId || busy}
          aria-busy={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t("resume.create.submitting") : t("resume.create.copyPick.confirm")}
        </button>
      </div>
    </Modal>
  )
}
