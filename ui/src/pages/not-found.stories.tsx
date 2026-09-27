import { Screen } from "@/storybook/screen"
import { NotFoundPage } from "./not-found"

export default { title: "Pages/NotFound" }

export const Default = {
  render: () => (
    <Screen path="/unknown" routePath="*">
      <NotFoundPage />
    </Screen>
  ),
}
