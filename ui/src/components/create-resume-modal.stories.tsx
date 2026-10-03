// Storybook 确认件：SCR-101 新建简历弹窗。两条链路（从现有简历复制 / 完全新开）+ 两个边界态。
// 用真实组件 + 注入数据，不接端点、不动路由；文案由组件自身 i18n 提供。
import { Screen } from "@/storybook/screen"
import { CreateResumeModal } from "@/components/create-resume-modal"
import { RESUMES, TEMPLATES } from "@/lib/content"

export default {
  title: "Components/CreateResumeModal",
  parameters: { layout: "fullscreen" },
}

export const Default = {
  render: () => (
    <Screen path="/resumes" chrome={false}>
      <CreateResumeModal open onClose={() => {}} resumes={RESUMES} templates={TEMPLATES} />
    </Screen>
  ),
}

export const NoSourceResume = {
  render: () => (
    <Screen path="/resumes" chrome={false}>
      <CreateResumeModal open onClose={() => {}} resumes={[]} templates={TEMPLATES} />
    </Screen>
  ),
}

export const NoPublishedTemplate = {
  render: () => (
    <Screen path="/resumes" chrome={false}>
      <CreateResumeModal
        open
        onClose={() => {}}
        resumes={RESUMES}
        templates={TEMPLATES.filter((template) => template.status !== "published")}
      />
    </Screen>
  ),
}
