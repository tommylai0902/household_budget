import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './BudgetApp.jsx'
import './index.css'

// iOS Safari only evaluates :active (and :hover) on tap if some element on
// the page already has a touch handler bound — otherwise a tap never enters
// the :active state at all, silently dropping every press-feedback style
// (.press-fx, button/link :active rules) app-wide. A no-op listener here is
// the standard fix: it satisfies that requirement once, for the whole page.
document.addEventListener('touchstart', () => {}, { passive: true })

// skipWaiting + clientsClaim (vite.config.js) let a new service worker take
// over instantly instead of waiting for every tab to close — but an
// already-open tab still keeps running the JS bundle it already loaded until
// something reloads it. Without this listener, updates only reach a device
// after the user manually force-closes and reopens the app.
if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
