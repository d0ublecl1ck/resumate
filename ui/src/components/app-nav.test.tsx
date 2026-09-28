import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"

import { AppNav } from "@/components/app-nav"
import { StoryProviders } from "@/storybook/screen"

afterEach(cleanup)

function renderNav() {
  return render(
    <StoryProviders>
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>
    </StoryProviders>,
  )
}

describe("AppNav brand slot", () => {
  it("shows the ingested brand mark instead of a generic icon", () => {
    const { container } = renderNav()
    expect(container.querySelector('img[src="/brand/mark.png"]')).not.toBeNull()
  })

  it("keeps the product wordmark beside it", () => {
    renderNav()
    expect(screen.getByText("Resumate")).toBeInTheDocument()
  })
})
