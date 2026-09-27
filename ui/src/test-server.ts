// Vitest 用 MSW 服务器：handlers 与 Storybook 预览共用同一份定义。
import { setupServer } from "msw/node"
import { handlers } from "@/mocks/handlers"

export const server = setupServer(...handlers)
export { handlers }
