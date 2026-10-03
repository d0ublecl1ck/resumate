import { Screen } from "@/storybook/screen"
import { RESUMES } from "@/lib/content"
import type { Resume } from "@/lib/types"
import { ResumesPage } from "./resumes"

export default { title: "Pages/Resumes" }

export const Default = {
  render: () => (
    <Screen path="/resumes" routePath="/resumes">
      <ResumesPage />
    </Screen>
  ),
}

// 网格密度确认：把内置简历样例铺成 6 份，展示 sm:2 / xl:3 的卡片网格与等高操作区。
const GRID: Resume[] = Array.from({ length: 6 }, (_, index) => ({
  ...RESUMES[index % RESUMES.length],
  id: `res_grid_${index}`,
  lifecycle: "active" as const,
}))

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
