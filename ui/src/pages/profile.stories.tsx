import { Screen } from "@/storybook/screen"
import { ProfilePage } from "./profile"

export default { title: "Pages/Profile" }

export const Default = {
  render: () => (
    <Screen path="/profile" routePath="/profile" width="fluid">
      <ProfilePage />
    </Screen>
  ),
}
