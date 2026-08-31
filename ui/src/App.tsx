import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import './App.css'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <main>
          <nav aria-label="Primary navigation"><Link to="/">Resumate</Link></nav>
          <Routes><Route path="/" element={<h1>Resumate</h1>} /></Routes>
        </main>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
