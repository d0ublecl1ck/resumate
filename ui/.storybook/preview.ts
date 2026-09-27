import type { Preview } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement } from "react"
import "../src/index.css"
import "@/i18n"

// Stories seed their own query data; keep it fresh so a preview never hits the network.
const preview: Preview = {
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) =>
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }) },
        createElement(Story),
      ),
  ],
}

export default preview
