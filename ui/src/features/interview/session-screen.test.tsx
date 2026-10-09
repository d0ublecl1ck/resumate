// SessionScreen 受控契约：真实会话数据出场，作答回调带题目 id；无 props 回退设计样例。
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SessionScreen } from "./session-screen"
import type { InterviewSessionDetail } from "@/lib/interview"

afterEach(cleanup)

const SESSION: InterviewSessionDetail = {
  id: "ivs_1",
  status: "active",
  role: "Java 后端",
  resumeId: "res_1",
  resumeVersionId: "ver_1",
  jdId: "jd_1",
  rubricVersion: "interview-rubric-v1",
  contextSnapshot: {
    role: "Java 后端",
    resumeTitle: "后端工程师简历",
    resumeVersionId: "ver_1",
    jdRole: "Java 后端工程师",
    jdCompany: "星澜科技",
    jdBody: "订单中台",
  },
  report: null,
  createdAt: "2026-10-05T09:00:00+08:00",
  updatedAt: "2026-10-05T09:00:00+08:00",
  completedAt: null,
  questions: [
    {
      id: "ivq_1",
      ordinal: 1,
      kind: "technical",
      prompt: "订单表达到瓶颈后如何做分库分表？",
      referencePoints: ["按三年增长推算容量"],
      parentQuestionId: null,
      answer: {
        id: "iva_1",
        questionId: "ivq_1",
        content: "我们按用户维度分片。",
        createdAt: "2026-10-05T09:05:00+08:00",
      },
    },
    {
      id: "ivq_2",
      ordinal: 2,
      kind: "follow_up",
      prompt: "分片键怎么选，跨片查询怎么办？",
      referencePoints: ["跨片查询的兜底方案"],
      parentQuestionId: "ivq_1",
      answer: null,
    },
  ],
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe("SessionScreen 受控模式", () => {
  it("渲染真实题目与已作答内容，发送时回传当前题 id 与内容", async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined)
    renderWithRouter(
      <SessionScreen session={SESSION} activeQuestionId="ivq_2" onAnswer={onAnswer} />,
    )

    expect(screen.getByText("订单表达到瓶颈后如何做分库分表？")).toBeInTheDocument()
    expect(screen.getByText("我们按用户维度分片。")).toBeInTheDocument()
    expect(screen.getByText("分片键怎么选，跨片查询怎么办？")).toBeInTheDocument()
    // 真实会话信息来自 session，不再使用设计态常量。
    expect(screen.getByText("后端工程师简历")).toBeInTheDocument()
    expect(screen.getByText("星澜科技")).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "输入你的回答，或按住麦克风用语音作答" }), {
      target: { value: "按业务主键哈希分片，跨片走异步聚合。" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith("ivq_2", "按业务主键哈希分片，跨片走异步聚合。"),
    )
  })

  it("语音入口把当前题 id 交给页面", () => {
    const onVoiceEntry = vi.fn()
    renderWithRouter(
      <SessionScreen session={SESSION} activeQuestionId="ivq_2" onVoiceEntry={onVoiceEntry} />,
    )

    fireEvent.change(screen.getByRole("textbox", { name: "输入你的回答，或按住麦克风用语音作答" }), {
      target: { value: "先写一段回答" },
    })
    fireEvent.click(screen.getByRole("button", { name: "语音回答" }))

    expect(onVoiceEntry).toHaveBeenCalledWith("ivq_2")
  })
})

describe("SessionScreen 设计回退", () => {
  it("无 props 时渲染设计样例对话流", () => {
    renderWithRouter(<SessionScreen />)
    expect(
      screen.getByText("先说说 JVM 的内存区域划分，以及线上排查内存问题时你最先看哪几块。"),
    ).toBeInTheDocument()
  })
})
