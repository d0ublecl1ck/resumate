// Storybook 确认件：SCR-101 从现有简历复制时的简历选择层（大弹层 + 网格卡片）。
// 纯展示选择组件：注入数据，点击卡片只改变选中态，不接端点、不创建资源。
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

function Demo({ resumes }: { resumes: Resume[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  return (
    <ResumePickerDialog
      resumes={resumes}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onCancel={() => {}}
      onConfirm={() => {}}
      busy={false}
      error={null}
    />
  )
}

export const Default = { render: () => <Demo resumes={ACTIVE} /> }

export const Empty = { render: () => <Demo resumes={[]} /> }

export const Submitting = {
  render: () => (
    <ResumePickerDialog
      resumes={ACTIVE}
      selectedId={ACTIVE[0].id}
      onSelect={() => {}}
      onCancel={() => {}}
      onConfirm={() => {}}
      busy
      error={null}
    />
  ),
}

export const Failed = {
  render: () => (
    <ResumePickerDialog
      resumes={ACTIVE}
      selectedId={ACTIVE[0].id}
      onSelect={() => {}}
      onCancel={() => {}}
      onConfirm={() => {}}
      busy={false}
      error={i18n.t("resume.create.errors.sourceMissing")}
    />
  ),
}
