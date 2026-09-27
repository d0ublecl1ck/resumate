import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { http, HttpResponse } from "msw"
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ThemeSync } from "@/components/theme-sync"
import { USER_PREFERENCES } from "@/lib/content"
import { server } from "@/test-server"

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove("dark")
})

describe("ThemeSync", () => {
  it("偏好为 dark 时给 <html> 加 .dark", async () => {
    server.use(http.get("/api/settings", () => HttpResponse.json({ ...USER_PREFERENCES, theme: "dark" })))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <ThemeSync />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true))
  })
})
