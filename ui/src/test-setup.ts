import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from "vitest"
import { server } from "./test-server"

// 测试固定使用 zh-CN：先写入持久化语言，再加载 i18n 单例，
// 避免 jsdom 的 en-US 默认语言改变断言中的中文文案。
window.localStorage.setItem("resumate.locale", "zh-CN")
await import("@/i18n")

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
