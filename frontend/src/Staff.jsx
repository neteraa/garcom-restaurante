import React, { useEffect, useState } from 'react'

const SCREENS = [
  {
    href: '#/kitchen',
    emoji: '🔥',
    label: 'Cozinha',
    desc: 'Ver pedidos que chegaram',
    color: '#f97316',
    bg: 'rgba(249,115,22,.12)',
    border: 'rgba(249,115,22,.35)',
  },
  {
    href: '#/caixa',
    emoji: '💰',
    label: 'Caixa',
    desc: 'Cobrar e fechar pedidos',
    color: '#22c55e',
    bg: 'rgba(34,197,94,.12)',
    border: 'rgba(34,197,94,.35)',
  },
  {
    href: '#/mesas',
    emoji: '🪑',
    label: 'Mesas',
    desc: 'Abrir mesa e fazer comanda',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,.12)',
    border: 'rgba(59,130,246,.35)',
  },
  {
    href: '#/estoque',
    emoji: '📦',
    label: 'Estoque',
    desc: 'Ver e controlar o estoque',
    color: '#a855f7',
    bg: 'rgba(168,85,247,.12)',
    border: 'rgba(168,85,247,.35)',
  },
  {
    href: '#/relatorios',
    emoji: '📊',
    label: 'Relatórios',
    desc: 'Vendas do dia, semana e mês',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,.12)',
    border: 'rgba(251,191,36,.35)',
  },
  {
    href: '#/ifood',
    emoji: '🛵',
    label: 'iFood',
    desc: 'Pedidos de delivery',
    color: '#ef4444',
    bg: 'rgba(239,68,68,.12)',
    border: 'rgba(239,68,68,.35)',
  },
  {
    href: '#/',
    emoji: '🖥',
    label: 'Totem',
    desc: 'Tela do cliente (Gabi)',
    color: '#94a3b8',
    bg: 'rgba(148,163,184,.08)',
    border: 'rgba(148,163,184,.2)',
  },
  {
    href: '#/configuracoes',
    emoji: '⚙️',
    label: 'Configurações',
    desc: 'Chave IA, voz, sistema',
    color: '#64748b',
    bg: 'rgba(100,116,139,.08)',
    border: 'rgba(100,116,139,.2)',
  },
]

export default function Staff() {
  const [stats, setStats]     = useState(null)
  const [alerts, setAlerts]   = useState([])
  const [queue, setQueue]     = useState(0)
  const [time, setTime]       = useState(new Date())

  useEffect(() => {
    const load = async () => {
      try {
        const [s, a, q] = await Promise.all([
          fetch('/api/stats').then(r => r.json()),
          fetch('/api/inventory/alerts').then(r => r.json()),
          fetch('/api/orders/pending-payment').then(r => r.json()),
        ])
        setStats(s)
        setAlerts(a.alerts || [])
        setQueue(q.count || 0)
      } catch {}
    }
    load()
    const iv = setInterval(load, 10000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  const fmtBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // Alert badges for each screen
  const badges = {
    '#/caixa':   queue > 0 ? queue : null,
    '#/estoque': alerts.length > 0 ? alerts.length : null,
    '#/kitchen': stats?.active_count > 0 ? stats.active_count : null,
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg,#1a0f08 0%,#0a0604 100%)',
      color: '#fef3c7',
      fontFamily: "'Inter',system-ui,sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: '18px 28px',
        background: 'linear-gradient(180deg,rgba(120,53,15,.6),rgba(0,0,0,.5))',
        borderBottom: '2px solid rgba(249,115,22,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 40 }}>🍖</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 3, color: '#f97316' }}>JM ESPETINHOS</div>
            <div style={{ fontSize: 11, color: '#fbbf24', letterSpacing: 2 }}>PAINEL DO ESTABELECIMENTO</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fef3c7', fontVariantNumeric: 'tabular-nums' }}>
            {time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 12, color: '#555' }}>
            {time.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </header>

      {/* Quick stats */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
          gap: 12, padding: '16px 28px 0',
        }}>
          {[
            { label: 'Faturamento hoje', value: fmtBRL(stats.total_today), color: '#22c55e' },
            { label: 'Pedidos hoje',     value: stats.orders_today,        color: '#f97316' },
            { label: 'Ag. pagamento',    value: queue,                     color: queue > 0 ? '#ef4444' : '#22c55e' },
            { label: 'Alertas estoque',  value: alerts.length,             color: alerts.length > 0 ? '#f59e0b' : '#22c55e' },
          ].map((k, i) => (
            <div key={i} style={{
              background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 12, padding: '12px 18px',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, fontWeight: 700 }}>{k.label.toUpperCase()}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Alerts strip */}
      {alerts.length > 0 && (
        <div style={{
          margin: '12px 28px 0',
          background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.4)',
          borderRadius: 10, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 800, color: '#f59e0b', fontSize: 13 }}>⚠️ ESTOQUE BAIXO:</span>
          {alerts.slice(0, 5).map(a => (
            <span key={a.item_id} style={{
              background: 'rgba(245,158,11,.2)', color: '#fbbf24',
              borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600,
            }}>
              {a.name} ({a.stock} restantes)
            </span>
          ))}
          {alerts.length > 5 && <span style={{ color:'#f59e0b', fontSize:12 }}>+{alerts.length-5} mais</span>}
        </div>
      )}

      {/* Main grid */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: 'repeat(4,1fr)',
        gap: 16, padding: '20px 28px 28px',
        alignContent: 'start',
      }}>
        {SCREENS.map(s => {
          const badge = badges[s.href]
          return (
            <a
              key={s.href}
              href={s.href}
              style={{
                background: s.bg, border: `2px solid ${s.border}`,
                borderRadius: 20, padding: '28px 20px',
                textDecoration: 'none', color: 'inherit',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                textAlign: 'center', gap: 8, cursor: 'pointer',
                transition: 'transform .15s, border-color .15s',
                position: 'relative',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {badge !== null && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: '#ef4444', color: '#fff',
                  borderRadius: 99, minWidth: 22, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900, padding: '0 6px',
                }}>
                  {badge}
                </div>
              )}
              <div style={{ fontSize: 48 }}>{s.emoji}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.label}</div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{s.desc}</div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
