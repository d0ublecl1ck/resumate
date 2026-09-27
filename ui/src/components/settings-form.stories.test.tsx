import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Route the stories' browser worker onto the Vitest MSW server for this check only.
vi.mock("@/mocks/browser", async () => {
  const { server } = await import("@/test-server")
  return { worker: { use: server.use.bind(server), resetHandlers: server.resetHandlers.bind(server) } }
})

import {
  CatalogError,
  CatalogLoading,
  Default,
  ModelNotInCatalog,
  NoProviderSelected,
  ProviderNotInCatalog,
  TestFailure,
  TestPending,
  TestSuccess,
} from "@/components/settings-form.stories"

afterEach(cleanup)

describe("model settings stories", () => {
  it("Default loads the catalog", async () => {
    render(Default.render())
    expect(await screen.findByText("目录来源：models.dev")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveTextContent("OpenAI")
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent("GPT-4o mini")
  })

  it("CatalogLoading keeps the loading hint", async () => {
    render(CatalogLoading.render())
    expect(await screen.findByText("模型目录加载中…")).toBeInTheDocument()
  })

  it("CatalogError shows the error hint", async () => {
    render(CatalogError.render())
    expect(await screen.findByText("模型目录加载失败，已保留当前配置。")).toBeInTheDocument()
  })

  it("ModelNotInCatalog marks the saved model as missing", async () => {
    render(ModelNotInCatalog.render())
    expect(await screen.findByText("目录来源：models.dev")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent("legacy-model（不在当前目录）")
  })

  it("ProviderNotInCatalog marks the saved provider as missing and disables the model select", async () => {
    render(ProviderNotInCatalog.render())
    expect(await screen.findByText("目录来源：models.dev")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveTextContent("legacy-openai（不在当前目录）")
    expect(screen.getByRole("combobox", { name: "Model" })).toBeDisabled()
  })

  it("NoProviderSelected shows the empty option", async () => {
    render(NoProviderSelected.render())
    expect(await screen.findByText("目录来源：models.dev")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveTextContent("未设置")
    expect(screen.getByRole("combobox", { name: "Model" })).toBeDisabled()
  })

  it("TestPending shows the spinner and the testing hint", async () => {
    const { container } = render(TestPending.render())

    await TestPending.play({ canvasElement: container })

    expect(await screen.findByText("测试中…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /测试连接/ })).toBeDisabled()
  })

  it("TestSuccess shows the ok result message", async () => {
    render(TestSuccess.render())
    expect(await screen.findByText("Connection OK (HTTP 200)")).toBeInTheDocument()
  })

  it("TestFailure shows only the failure result message", async () => {
    render(TestFailure.render())
    expect(await screen.findByText("Connection failed (HTTP 502)")).toBeInTheDocument()
    expect(screen.queryByText("Connection OK (HTTP 200)")).not.toBeInTheDocument()
  })
})
