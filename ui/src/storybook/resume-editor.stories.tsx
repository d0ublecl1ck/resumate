// Components/ResumeEditor：服务端已更新提示条（issue 3fdec）的 Storybook 确认件。
// harness 先输入本地未保存内容，再让服务端签名（currentVersionId + saveState）变化，
// 让 story 一打开就停在「提示条 + 载入服务端版本」；不点按钮不会覆盖本地输入。
// 偏好查询走 preview 的 MSW handlers，不接真实后端。
import { useEffect, useState } from "react"
import { MemoryRouter } from "react-router-dom"
import { ResumeEditor } from "@/components/resume-editor"
import { RESUMES } from "@/lib/content"
import type { Resume } from "@/lib/types"

export default { title: "Components/ResumeEditor" }

const BASE = RESUMES[0]

function setName(root: ParentNode, value: string) {
  const label = [...root.querySelectorAll("label")].find((node) => node.textContent?.includes("姓名"))
  const input = label?.querySelector("input")
  if (!input) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function ServerUpdatedHarness() {
  const [resume, setResume] = useState<Resume>({ ...BASE, saveState: "committed" })

  useEffect(() => {
    const typed = window.setTimeout(() => setName(document, "本地未保存的姓名"), 350)
    const bumped = window.setTimeout(() => {
      setResume({
        ...BASE,
        saveState: "uncommitted",
        currentVersionId: "v_fe_9",
        document: { ...BASE.document, basics: { ...BASE.document.basics, fullName: "服务端写入的名字" } },
      })
    }, 900)
    return () => {
      window.clearTimeout(typed)
      window.clearTimeout(bumped)
    }
  }, [])

  return (
    <MemoryRouter>
      <div className="h-[760px] bg-background p-4">
        <ResumeEditor resume={resume} templateName="经典单栏" boundJds={[]} />
      </div>
    </MemoryRouter>
  )
}

/** 服务端已更新提示态：本地有未保存输入 + 服务端签名变化 → 金色提示条 + 「载入服务端版本」。 */
export const ServerUpdatedWhileDirty = {
  render: () => <ServerUpdatedHarness />,
}
