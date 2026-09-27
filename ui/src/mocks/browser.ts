// Storybook 预览用 MSW browser worker：与 Vitest 共用同一份 handlers。
import { setupWorker } from "msw/browser"
import { handlers } from "./handlers"

export const worker = setupWorker(...handlers)
