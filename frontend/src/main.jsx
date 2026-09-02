import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Kitchen from './Kitchen'
import Caixa from './Caixa'
import Estoque from './Estoque'
import Mesas from './Mesas'
import CardapioMesa from './CardapioMesa'

// Hash-based router
const route = window.location.hash.replace('#', '').replace(/^\//, '')
const Component = route === 'kitchen'         ? Kitchen
                : route === 'caixa'           ? Caixa
                : route === 'estoque'         ? Estoque
                : route === 'mesas'           ? Mesas
                : route.startsWith('mesa/')   ? CardapioMesa
                : App

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Component />
  </React.StrictMode>
)

// React on hash change
window.addEventListener('hashchange', () => window.location.reload())
