import { Screen } from "@/storybook/screen"
import { JdDetailPage } from "./jd-detail"

export default { title: "Pages/JdDetail" }

export const Bound = {
  render: () => (
    <Screen path="/jds/jd_meituan" routePath="/jds/:id">
      <JdDetailPage />
    </Screen>
  ),
}

export const BindingUnavailable = {
  render: () => (
    <Screen path="/jds/jd_startup" routePath="/jds/:id">
      <JdDetailPage />
    </Screen>
  ),
}
