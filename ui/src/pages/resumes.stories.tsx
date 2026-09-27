import { Screen } from "@/storybook/screen"
import { ResumesPage } from "./resumes"

export default { title: "Pages/Resumes" }

export const Default = {
  render: () => (
    <Screen path="/resumes" routePath="/resumes">
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
