import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import App from './app/App'
import { ErrorBoundary } from './app/components/ErrorBoundary'
import './styles/index.css'
import './styles/tailwind.css'
import './styles/theme.css'
import './styles/globals.css'
import './styles/fonts.css'

const boot = document.getElementById('boot')
const bootError = document.getElementById('boot-error')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
)

if (boot) boot.style.display = 'none'

window.addEventListener('error', (event) => {
  if (boot) boot.style.display = 'flex'
  if (bootError) bootError.textContent = event.error?.stack || event.message || 'Unknown error'
})

window.addEventListener('unhandledrejection', (event) => {
  if (boot) boot.style.display = 'flex'
  const reason = event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason)
  if (bootError) bootError.textContent = reason
})
