import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  BrandLockup,
  BrandMark,
  MascotNote,
  MascotState,
  StampBadge,
  StickerCard,
} from "@/components/brand"

afterEach(cleanup)

describe("BrandMark", () => {
  it("renders the ingested mark asset and stays decorative by default", () => {
    render(<BrandMark />)
    const mark = screen.getByRole("presentation", { hidden: true })
    expect(mark).toHaveAttribute("src", "/brand/mark.png")
    expect(mark).toHaveAttribute("alt", "")
  })

  it("exposes an accessible name when a caller passes a label", () => {
    render(<BrandMark label="Resumate 首页" />)
    expect(screen.getByRole("img", { name: "Resumate 首页" })).toBeInTheDocument()
  })
})

describe("BrandLockup", () => {
  it("pairs a labelled mark with the product wordmark", () => {
    render(<BrandLockup />)
    expect(screen.getByRole("img", { name: "Resumate 标志" })).toBeInTheDocument()
    expect(screen.getByText("Resumate")).toBeInTheDocument()
  })

  it("keeps the wordmark out of the layout when stacked for narrow slots", () => {
    const { container } = render(<BrandLockup orientation="vertical" />)
    expect(container.firstElementChild).toHaveClass("flex-col")
  })
})

describe("StickerCard", () => {
  it("renders a plain container by default", () => {
    render(<StickerCard data-testid="card">内容</StickerCard>)
    expect(screen.getByTestId("card").tagName).toBe("DIV")
  })

  it("becomes a real button when interactive, so press feedback stays operable", () => {
    render(
      <StickerCard interactive onClick={() => {}}>
        继续完善简历
      </StickerCard>,
    )
    const card = screen.getByRole("button", { name: "继续完善简历" })
    expect(card).toHaveAttribute("type", "button")
    expect(card.className).toContain("active:")
  })

  it("keeps a disabled card out of the press feedback while staying a button", () => {
    render(
      <StickerCard interactive disabled onClick={() => {}}>
        保存
      </StickerCard>,
    )
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
  })

  it("carries tilt through a CSS variable so rotation and press feedback compose", () => {
    render(<StickerCard tilt={-2} data-testid="card" />)
    expect(screen.getByTestId("card").getAttribute("style")).toContain("-2deg")
  })

  it("omits rotation when the card is not tilted", () => {
    render(<StickerCard data-testid="card" />)
    expect(screen.getByTestId("card").getAttribute("style")).toBeNull()
  })
})

describe("StampBadge", () => {
  it("always ships readable text, never colour alone", () => {
    render(<StampBadge tone="cobalt">当前绑定</StampBadge>)
    expect(screen.getByText("当前绑定")).toBeInTheDocument()
  })

  it("stamps a slight deterministic tilt by default", () => {
    render(<StampBadge data-testid="stamp">已核实</StampBadge>)
    expect(screen.getByTestId("stamp").getAttribute("style")).toContain("-3deg")
  })
})

describe("MascotNote", () => {
  it("renders the assistant copy inside a speech bubble", () => {
    render(<MascotNote>补上作品集链接，完成度立刻提升。</MascotNote>)
    expect(screen.getByText("补上作品集链接，完成度立刻提升。")).toBeInTheDocument()
  })

  it("announces the thinking state instead of showing stale copy", () => {
    render(<MascotNote pending>上一次的回复</MascotNote>)
    expect(screen.getByRole("status")).toHaveTextContent("正在想…")
    expect(screen.queryByText("上一次的回复")).not.toBeInTheDocument()
  })

  it("mirrors the row when the tail sits on the end side", () => {
    render(
      <MascotNote tail="end" data-testid="note">
        好的
      </MascotNote>,
    )
    const note = screen.getByTestId("note")
    expect(note).toHaveAttribute("data-tail", "end")
    expect(note.className).toContain("flex-row-reverse")
  })
})

describe("MascotNote volume dial", () => {
  it("trades the character for the compact badge on calmer surfaces", () => {
    const { container } = render(<MascotNote mascot="badge">好的</MascotNote>)
    expect(container.querySelector('img[src="/brand/mark.png"]')).not.toBeNull()
    expect(container.querySelector('img[src="/brand/mascot.png"]')).toBeNull()
  })

  it("drops the mascot and its tail entirely when the surface must stay neutral", () => {
    const { container } = render(<MascotNote mascot="none">好的</MascotNote>)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("[data-tail] [aria-hidden]")).toBeNull()
  })
})

describe("MascotState volume dial", () => {
  it("renders quiet as an inline row for table and panel gaps", () => {
    const { container } = render(<MascotState kind="empty" size="quiet" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain("flex-row")
    expect(root.className).toContain("text-left")
    expect((container.querySelector("img") as HTMLElement).className).toContain("size-12")
  })

  it("keeps the centred block by default and can grow to a hero block", () => {
    const { container, rerender } = render(<MascotState kind="empty" />)
    expect((container.firstElementChild as HTMLElement).className).toContain("flex-col")
    rerender(<MascotState kind="empty" size="hero" />)
    expect((container.querySelector("img") as HTMLElement).className).toContain("size-36")
  })
})

describe("MascotState", () => {
  it("falls back to the brand copy for a kind", () => {
    render(<MascotState kind="empty" />)
    expect(screen.getByText("这里还是空的")).toBeInTheDocument()
  })

  it("lets the caller replace the brand copy with domain wording", () => {
    render(<MascotState kind="empty" title="还没有简历" description="先建一份，再开始打磨。" />)
    expect(screen.getByText("还没有简历")).toBeInTheDocument()
    expect(screen.getByText("先建一份，再开始打磨。")).toBeInTheDocument()
  })

  it("drives the mascot pose from the state kind", () => {
    const { container, rerender } = render(<MascotState kind="empty" />)
    expect(container.querySelector('img[src="/brand/mascot-wave.png"]')).not.toBeNull()
    rerender(<MascotState kind="error" />)
    expect(container.querySelector('img[src="/brand/mascot.png"]')).not.toBeNull()
  })

  it("swaps the character for the brand badge at the calmer volume", () => {
    const { container } = render(<MascotState kind="empty" mascot="badge" />)
    expect(container.querySelector('img[src="/brand/mark.png"]')).not.toBeNull()
    expect(container.querySelector('img[src="/brand/mascot-wave.png"]')).toBeNull()
  })

  it("mutes the badge for forbidden and frozen so state semantics survive", () => {
    const { container } = render(<MascotState kind="frozen" mascot="badge" />)
    expect((container.querySelector("img") as HTMLElement).className).toContain("grayscale")
  })

  it("treats a conflict as an alert with brand copy", () => {
    render(<MascotState kind="conflict" />)
    expect(screen.getByRole("alert")).toHaveTextContent("改动和别人撞车了")
  })

  it("announces failures as alerts and surfaces the machine error code", () => {
    render(<MascotState kind="error" errorCode="RESUME_NOT_FOUND" />)
    expect(screen.getByRole("alert")).toHaveTextContent("错误码：RESUME_NOT_FOUND")
  })

  it("keeps the action slot reachable", () => {
    render(<MascotState kind="forbidden" action={<button type="button">申请权限</button>} />)
    expect(screen.getByRole("button", { name: "申请权限" })).toBeInTheDocument()
  })
})
