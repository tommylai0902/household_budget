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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
