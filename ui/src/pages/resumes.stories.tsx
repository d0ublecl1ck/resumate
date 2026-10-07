// SCR-002 简历库 story（Storybook 先行，issue e1a80）。
//
// 所有 story 都渲染真实实现：ResumesPage（含 ResumeLibrary）与 ResumePickerDialog，
// 数据由 preview 的 MSW handlers 提供；需要固定状态时用 Screen 的 seed 预置查询缓存，
// 不再保留任何文件内演示组件。
// 覆盖状态：默认列表、网格密度、活跃空态、归档有卡、归档空态、筛选空态、
// 空白岗位方向、归档 chips、搜索大小写不敏感、深链、复制选择弹层。
import { useState } from "react"

import { Screen } from "@/storybook/screen"
import { ResumePickerDialog } from "@/components/resume-picker-dialog"
import i18n from "@/i18n"
import { RESUMES } from "@/lib/content"
import type { Resume } from "@/lib/types"
import { ResumesPage } from "./resumes"

export default { title: "Pages/Resumes" }

const ACTIVE = RESUMES.filter((resume) => resume.lifecycle === "active")
const ARCHIVED = RESUMES.filter((resume) => resume.lifecycle === "archived")

// 网格密度确认：把内置简历样例铺成 6 份，展示 lg:2 / xl:3 的卡片网格与等高操作区。
const GRID: Resume[] = Array.from({ length: 6 }, (_, index) => ({
  ...RESUMES[index % RESUMES.length],
  id: `res_grid_${index}`,
  lifecycle: "active" as const,
}))

// targetRole 为空：不渲染「岗位方向：」行，标题与元数据之间不留空行。标题取默认「未命名简历」。
const NO_TARGET_ROLE: Resume = {
  ...RESUMES[0],
  id: "res_no_target_role",
  title: i18n.t("resume.create.defaultTitle"),
  targetRole: "",
  tags: [],
}

// 搜索大小写不敏感：标题含 QA，用搜索词 qa 命中。
const QA_RESUME: Resume = {
  ...RESUMES[0],
  id: "res_qa_lead",
  title: "QA · " + RESUMES[0].title,
  targetRole: "QA · " + RESUMES[0].targetRole,
  tags: ["QA"],
}

export const Default = {
  render: () => (
    <Screen path="/resumes" routePath="/resumes">
      <ResumesPage />
    </Screen>
  ),
}

export const Grid = {
  render: () => (
    <Screen
      path="/resumes"
      routePath="/resumes"
      seed={[
        [["resumes", "active"], GRID],
        [["resumes", "archived"], []],
      ]}
    >
      <ResumesPage />
    </Screen>
  ),
}

// 活跃空态：归档 Tab 为空时描述与它不同，见 ArchivedEmpty。
export const Empty = {
  render: () => (
    <Screen
      path="/resumes"
      routePath="/resumes"
      seed={[
        [["resumes", "active"], []],
        [["resumes", "archived"], []],
      ]}
    >
      <ResumesPage />
    </Screen>
  ),
}

// 活跃 Tab 有卡：其中一张 targetRole 为空，确认不出现「岗位方向：」空行。
export const ActiveWithEmptyTargetRole = {
  render: () => (
    <Screen
      path="/resumes"
      routePath="/resumes"
      seed={[
        [["resumes", "active"], [ACTIVE[0], NO_TARGET_ROLE, ACTIVE[1]]],
        [["resumes", "archived"], []],
      ]}
    >
      <ResumesPage />
    </Screen>
  ),
}

// 归档 Tab 有卡：卡片带「已归档」徽标，操作区显示「恢复」。
export const ArchivedWithCards = {
  render: () => (
    <Screen
      path="/resumes?tab=archived"
      routePath="/resumes"
      seed={[
        [["resumes", "active"], ACTIVE],
        [["resumes", "archived"], ARCHIVED],
      ]}
    >
      <ResumesPage />
    </Screen>
  ),
}

// 归档 Tab 空态：描述为「归档的简历会保留在这里，恢复后可继续编辑。」，与活跃空态不同。
export const ArchivedEmpty = {
  render: () => (
    <Screen
      path="/resumes?tab=archived"
      routePath="/resumes"
      seed={[
        [["resumes", "active"], ACTIVE],
        [["resumes", "archived"], []],
      ]}
    >
      <ResumesPage />
    </Screen>
  ),
}

// 筛选 0 命中：保留筛选条件，用筛选态文案，与「当前 Tab 本来就是空」区分。
export const FilteredEmpty = {
  render: () => (
    <Screen
      path="/resumes?tab=active&q=zzz"
      routePath="/resumes"
      seed={[
        [["resumes", "active"], ACTIVE],
        [["resumes", "archived"], ARCHIVED],
      ]}
    >
      <ResumesPage />
    </Screen>
  ),
}

// 归档 Tab 的 chips 只含归档简历的标签：数据里同时有活跃简历（前端 / React / 产品），chips 仍只有归档标签。
export const ArchivedTabTags = {
  render: () => (
    <Screen
      path="/resumes?tab=archived"
      routePath="/resumes"
      seed={[
        [["resumes", "active"], ACTIVE],
        [["resumes", "archived"], ARCHIVED],
      ]}
    >
      <ResumesPage />
    </Screen>
  ),
}

// 搜索大小写不敏感：标题含 QA，搜索词 qa 仍命中。
export const SearchCaseInsensitive = {
  render: () => (
    <Screen
      path="/resumes?q=qa"
      routePath="/resumes"
      seed={[
        [["resumes", "active"], [QA_RESUME, ...ACTIVE]],
        [["resumes", "archived"], []],
      ]}
    >
      <ResumesPage />
    </Screen>
  ),
}

// 深链：tab + tag 同时来自 URL，打开即保持筛选。
export const DeepLinkArchivedTagged = {
  render: () => (
    <Screen
      path={`/resumes?tab=archived&tag=${encodeURIComponent(ARCHIVED[0].tags[0])}`}
      routePath="/resumes"
      seed={[
        [["resumes", "active"], ACTIVE],
        [["resumes", "archived"], ARCHIVED],
      ]}
    >
      <ResumesPage />
    </Screen>
  ),
}

// 复制选择弹层：真实 ResumePickerDialog（Modal 原语：Esc 关闭、焦点锁定在弹层内、背景 inert）。
export const CopyPickerDialog = {
  render: () => <PickerPreview />,
}

function PickerPreview() {
  const [open, setOpen] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  return (
    <Screen
      path="/resumes"
      routePath="/resumes"
      seed={[
        [["resumes", "active"], ACTIVE],
        [["resumes", "archived"], ARCHIVED],
      ]}
    >
      <ResumesPage />
      {open ? (
        <ResumePickerDialog
          resumes={ACTIVE}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
          busy={false}
          error={null}
        />
      ) : null}
    </Screen>
  )
}
