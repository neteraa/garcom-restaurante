import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Kitchen from './Kitchen'
import Caixa from './Caixa'
import Estoque from './Estoque'

// Hash-based router: /#/kitchen → Kitchen; /#/caixa → Caixa; /#/estoque → Estoque; else App
const route = window.location.hash.replace('#', '').replace(/^\//, '')
const Component = route === 'kitchen' ? Kitchen
                : route === 'caixa'   ? Caixa
                : route === 'estoque' ? Estoque
                : App

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Component />
  </React.StrictMode>
)

// React on hash change
window.addEventListener('hashchange', () => window.location.reload())
