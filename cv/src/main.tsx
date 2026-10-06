import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/ui.css'
import '../../src/styles/title.css'
import '../../src/styles/toast.css'
// Last, so in print it wins over the screen rules it undoes.
import './styles/print.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
