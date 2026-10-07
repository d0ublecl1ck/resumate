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
    expect(await screen.findByRole("combobox", { name: "Provider" })).toHaveTextContent("OpenAI")
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent("GPT-4o mini")
    expect(screen.queryByText(/目录来源|Catalog source/)).not.toBeInTheDocument()
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
    expect(await screen.findByRole("combobox", { name: "Model" })).toHaveTextContent("legacy-model（不在当前目录）")
    expect(screen.queryByText(/目录来源|Catalog source/)).not.toBeInTheDocument()
  })

  // 目录收窄后（issue 7aa58），目录外的已保存 provider 就是「自定义」：下拉换成文本输入，
  // 用户仍能改自己的服务标识，不再是一个禁用下拉。
  it("ProviderNotInCatalog switches the saved provider to custom text inputs", async () => {
    render(ProviderNotInCatalog.render())
    expect(screen.getByRole("textbox", { name: "Provider" })).toHaveValue("legacy-openai")
    expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue("legacy-model")
    expect(screen.queryByText(/目录来源|Catalog source/)).not.toBeInTheDocument()
  })



  it("NoProviderSelected shows the empty option", async () => {
    render(NoProviderSelected.render())
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveTextContent("未设置")
    expect(screen.getByRole("combobox", { name: "Model" })).toBeDisabled()
    expect(screen.queryByText(/目录来源|Catalog source/)).not.toBeInTheDocument()
  })

  it("TestPending shows the spinner and the testing hint", async () => {
    const { container } = render(TestPending.render())

    await TestPending.play({ canvasElement: container })

    expect(await screen.findByText("测试中…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /测试连接/ })).toBeDisabled()
  })

  it("TestSuccess shows the localized success copy instead of the backend message", async () => {
    render(TestSuccess.render())
    expect(await screen.findByText("连接成功")).toBeInTheDocument()
    expect(screen.queryByText("Connection OK (HTTP 200)")).not.toBeInTheDocument()
  })

  it("TestFailure shows only the failure result message", async () => {
    render(TestFailure.render())
    expect(await screen.findByText("Connection failed (HTTP 502)")).toBeInTheDocument()
    expect(screen.queryByText("连接成功")).not.toBeInTheDocument()
  })
})
