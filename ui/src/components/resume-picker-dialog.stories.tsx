// Storybook 确认件：SCR-101 从现有简历复制时的简历选择层（大弹层 + 网格卡片）。
// 纯展示选择组件：注入数据，点击卡片只改变选中态，不接端点、不创建资源。
// issue e1a80：弹层已改用 ui/components/ui/modal.tsx 原语，这里保持状态化，
// 让 Esc / 取消 / 关闭按钮在 Storybook 里真的能关掉弹层（可重新打开）。
import { useState } from "react"
import i18n from "@/i18n"
import { ResumePickerDialog } from "@/components/resume-picker-dialog"
import { RESUMES } from "@/lib/content"
import type { Resume } from "@/lib/types"

export default {
  title: "Components/ResumePickerDialog",
  parameters: { layout: "fullscreen" },
}

const ACTIVE = RESUMES.filter((resume) => resume.lifecycle === "active")

function Demo({ resumes, busy = false, error = null }: { resumes: Resume[]; busy?: boolean; error?: string | null }) {
  const [open, setOpen] = useState(true)
  // 提交中 / 失败态展示的是「已选中来源后」的样子，所以预选第一份。
  const [selectedId, setSelectedId] = useState<string | null>(busy || error ? (resumes[0]?.id ?? null) : null)

  if (!open) {
    return (
      <div className="p-6">
        <button onClick={() => setOpen(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          {i18n.t("resume.create.copyPick.title")}
        </button>
      </div>
    )
  }

  return (
    <ResumePickerDialog
      resumes={resumes}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onCancel={() => setOpen(false)}
      onConfirm={() => setOpen(false)}
      busy={busy}
      error={error}
    />
  )
}

export const Default = { render: () => <Demo resumes={ACTIVE} /> }

export const Empty = { render: () => <Demo resumes={[]} /> }

export const Submitting = { render: () => <Demo resumes={ACTIVE} busy /> }

export const Failed = { render: () => <Demo resumes={ACTIVE} error={i18n.t("resume.create.errors.sourceMissing")} /> }
