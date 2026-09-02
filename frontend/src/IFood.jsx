import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle, CheckCircle2, ChefHat, ChevronDown, ChevronUp,
  Clock, Eye, Package, Pause, Play, Power, RefreshCw,
  Settings, ShoppingBag, Truck, Wifi, WifiOff, Zap
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
const ago = (iso) => {
  if (!iso) return ''
  const d = Math.floor((Date.now() - new Date(iso)) / 60000)
  return d < 1 ? 'agora' : `${d}min atrás`
}

const STATUS_LABEL = {
  pending:    { label: 'Novo',       color: '#ff6b00', bg: '#ff6b0022' },
  confirmed:  { label: 'Confirmado', color: '#3b82f6', bg: '#3b82f622' },
  preparing:  { label: 'Preparando', color: '#f59e0b', bg: '#f59e0b22' },
  ready:      { label: 'Pronto',     color: '#22c55e', bg: '#22c55e22' },
  dispatched: { label: 'A caminho',  color: '#8b5cf6', bg: '#8b5cf622' },
  concluded:  { label: 'Entregue',   color: '#6b7280', bg: '#6b728022' },
  cancelled:  { label: 'Cancelado',  color: '#ef4444', bg: '#ef444422' },
}

const ORDER_TYPE_ICON = {
  DELIVERY: <Truck size={14} />,
  TAKEOUT:  <Package size={14} />,
  INDOOR:   <ChefHat size={14} />,
}

// ── OrderCard ────────────────────────────────────────────────────────────────
function OrderCard({ order, onAction }) {
  const [expanded, setExpanded] = useState(false)
  const s = STATUS_LABEL[order.status] || STATUS_LABEL.pending
  const ifoodId = order.ifood_id || ''

  const actionBtns = []
  if (order.status === 'pending')    actionBtns.push({ label: '✔ Confirmar',    action: 'confirm',           color: '#22c55e' })
  if (order.status === 'confirmed')  actionBtns.push({ label: '🔥 Iniciar',      action: 'start-preparation', color: '#f59e0b' })
  if (order.status === 'preparing')  actionBtns.push({ label: '✅ Pronto',       action: 'ready',             color: '#3b82f6' })
  if (order.status === 'ready')      actionBtns.push({ label: '🚴 Despachar',    action: 'dispatch',          color: '#8b5cf6' })
  if (['pending', 'confirmed', 'preparing'].includes(order.status))
    actionBtns.push({ label: '✕ Cancelar', action: 'cancel', color: '#ef4444' })

  return (
    <div style={{
      background: '#1a1a1a', border: `1px solid ${s.color}44`,
      borderRadius: 12, padding: 16, marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="https://logodownload.org/wp-content/uploads/2017/10/ifood-logo-0.png"
            alt="iFood" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain', background: '#fff' }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
              {order.customer}
              <span style={{ color: '#666', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                {ORDER_TYPE_ICON[order.order_type] || ''} {order.order_type}
              </span>
            </div>
            <div style={{ color: '#555', fontSize: 11 }}>
              #{order.id} · {ago(order.created_at)}
              {ifoodId && <span style={{ marginLeft: 6, color: '#444' }}>iFood: {ifoodId.slice(0, 8)}…</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: s.bg, color: s.color,
            borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600,
          }}>{s.label}</span>
          <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 15 }}>{fmt(order.total)}</span>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Items preview */}
      <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
        {order.items?.slice(0, expanded ? 99 : 2).map((it, i) => (
          <span key={i} style={{ marginRight: 12 }}>{it.quantity}× {it.name}</span>
        ))}
        {!expanded && order.items?.length > 2 &&
          <span style={{ color: '#555' }}>+{order.items.length - 2} mais</span>}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid #2a2a2a', paddingTop: 12 }}>
          {order.items?.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: '#ccc' }}>{it.quantity}× {it.name}</span>
              <span style={{ color: '#888' }}>{fmt(it.price * it.quantity)}</span>
            </div>
          ))}
          {order.delivery_address && (
            <div style={{ marginTop: 8, color: '#666', fontSize: 12 }}>
              📍 {order.delivery_address}
            </div>
          )}
          {order.notes && (
            <div style={{ marginTop: 4, color: '#f59e0b', fontSize: 12 }}>
              📝 {order.notes}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {actionBtns.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {actionBtns.map((btn, i) => (
            <button key={i}
              onClick={() => onAction(order.ifood_id, btn.action)}
              style={{
                background: btn.color + '22', color: btn.color,
                border: `1px solid ${btn.color}55`,
                borderRadius: 8, padding: '6px 14px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer', flex: 1,
              }}
            >{btn.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MerchantCard ─────────────────────────────────────────────────────────────
function MerchantCard({ merchant, onOpen, onPause }) {
  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid #2a2a2a',
      borderRadius: 12, padding: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>
            {merchant.name || merchant.tradingName || merchant.id}
          </div>
          <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>
            {merchant.id}
          </div>
          {merchant.address && (
            <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
              📍 {merchant.address.streetName} {merchant.address.streetNumber} — {merchant.address.city}
            </div>
          )}
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
          background: merchant.status === 'OPEN' ? '#22c55e22' : '#ef444422',
          color: merchant.status === 'OPEN' ? '#22c55e' : '#ef4444',
        }}>
          {merchant.status === 'OPEN' ? '● Aberto' : '● Fechado'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => onOpen(merchant.id)} style={{
          flex: 1, background: '#22c55e22', color: '#22c55e',
          border: '1px solid #22c55e55', borderRadius: 8,
          padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <Power size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
          Abrir Loja
        </button>
        <button onClick={() => onPause(merchant.id)} style={{
          flex: 1, background: '#f59e0b22', color: '#f59e0b',
          border: '1px solid #f59e0b55', borderRadius: 8,
          padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <Pause size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
          Pausar 60min
        </button>
      </div>
    </div>
  )
}

// ── Main IFood component ─────────────────────────────────────────────────────
export default function IFood() {
  const [status, setStatus] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [creds, setCreds] = useState({ clientId: '', clientSecret: '' })
  const [configMsg, setConfigMsg] = useState(null)
  const [filter, setFilter] = useState('active')  // active | all | done
  const pollRef = useRef(null)

  const fetchStatus = useCallback(async () => {
    const r = await fetch('/api/ifood/status')
    const d = await r.json()
    setStatus(d)
    setPolling(d.polling_active)
  }, [])

  const fetchOrders = useCallback(async () => {
    const r = await fetch('/api/ifood/orders')
    const d = await r.json()
    setOrders(d.orders || [])
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchOrders()])
    setLoading(false)
  }, [fetchStatus, fetchOrders])

  useEffect(() => { refresh() }, [refresh])

  // Auto-refresh every 15s
  useEffect(() => {
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [refresh])

  const handleConfigure = async (e) => {
    e.preventDefault()
    setConfigMsg(null)
    const r = await fetch('/api/ifood/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    })
    const d = await r.json()
    setConfigMsg(d)
    if (d.ok) { setShowConfig(false); refresh() }
  }

  const handlePollNow = async () => {
    const r = await fetch('/api/ifood/events/poll')
    const d = await r.json()
    await fetchOrders()
    alert(`Polling feito: ${d.events} eventos, ${d.imported?.length || 0} pedido(s) importado(s)`)
  }

  const togglePolling = async () => {
    const endpoint = polling ? '/api/ifood/polling/stop' : '/api/ifood/polling/start'
    await fetch(endpoint, { method: 'POST' })
    await fetchStatus()
  }

  const handleAction = async (ifoodId, action) => {
    if (!ifoodId) return alert('Este pedido não tem ID iFood')
    if (action === 'cancel') {
      if (!confirm('Cancelar este pedido no iFood?')) return
      await fetch(`/api/ifood/orders/${ifoodId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reasonCode: '501', reason: 'Cancelado pelo restaurante' }),
      })
    } else {
      await fetch(`/api/ifood/orders/${ifoodId}/${action}`, { method: 'POST' })
    }
    await fetchOrders()
  }

  const handleOpen = async (merchantId) => {
    const r = await fetch(`/api/ifood/merchants/${merchantId}/open`, { method: 'POST' })
    const d = await r.json()
    alert(d.ok ? `✅ Loja aberta (${d.interruptionsRemoved} interrupções removidas)` : d.detail)
    fetchStatus()
  }

  const handlePause = async (merchantId) => {
    const r = await fetch(`/api/ifood/merchants/${merchantId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId, minutes: 60 }),
    })
    const d = await r.json()
    alert(d.ok !== false ? '⏸ Loja pausada por 60 minutos' : d.detail)
    fetchStatus()
  }

  // Filter orders
  const ACTIVE_STATUS = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched']
  const filtered = orders.filter(o =>
    filter === 'all' ? true :
    filter === 'active' ? ACTIVE_STATUS.includes(o.status) :
    ['concluded', 'cancelled'].includes(o.status)
  )

  // Stats
  const today = new Date().toDateString()
  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === today)
  const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.total || 0), 0)
  const activeCount = orders.filter(o => ACTIVE_STATUS.includes(o.status)).length

  // ── Render ──
  return (
    <div style={{ background: '#111', minHeight: '100vh', fontFamily: "'Inter', sans-serif", color: '#fff' }}>

      {/* Header */}
      <div style={{
        background: '#1a1a1a', borderBottom: '2px solid #ea1d2c',
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            background: '#ea1d2c', borderRadius: 8, padding: '4px 8px',
            fontWeight: 900, fontSize: 16, letterSpacing: -0.5,
          }}>iFood</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Integração iFood</div>
            <div style={{ fontSize: 11, color: '#555' }}>JM Espetinhos & Assados</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {status?.connected
            ? <span style={{ color: '#22c55e', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Wifi size={14} /> Conectado
              </span>
            : <span style={{ color: '#ef4444', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <WifiOff size={14} /> Desconectado
              </span>
          }
          <button onClick={() => setShowConfig(s => !s)} style={{
            background: '#2a2a2a', border: '1px solid #333', borderRadius: 8,
            color: '#aaa', padding: '6px 12px', cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Settings size={14} /> Configurar
          </button>
          <button onClick={refresh} style={{
            background: '#2a2a2a', border: '1px solid #333', borderRadius: 8,
            color: '#aaa', padding: '6px 10px', cursor: 'pointer',
          }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>

        {/* Config panel */}
        {showConfig && (
          <div style={{
            background: '#1a1a1a', border: '1px solid #ea1d2c44',
            borderRadius: 14, padding: 24, marginBottom: 24,
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#ea1d2c' }}>⚙️ Credenciais iFood Merchant API</h3>
            <p style={{ color: '#777', fontSize: 13, margin: '0 0 20px' }}>
              Cadastre-se em <a href="https://developer.ifood.com.br" target="_blank" rel="noreferrer"
                style={{ color: '#ea1d2c' }}>developer.ifood.com.br</a> para obter o <code>clientId</code> e <code>clientSecret</code>.
              Requer CNPJ e homologação (~1 semana).
            </p>
            <form onSubmit={handleConfigure} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                value={creds.clientId}
                onChange={e => setCreds(c => ({ ...c, clientId: e.target.value }))}
                placeholder="Client ID"
                required
                style={{
                  background: '#111', border: '1px solid #333', borderRadius: 8,
                  color: '#fff', padding: '10px 14px', fontSize: 14,
                }}
              />
              <input
                type="password"
                value={creds.clientSecret}
                onChange={e => setCreds(c => ({ ...c, clientSecret: e.target.value }))}
                placeholder="Client Secret"
                required
                style={{
                  background: '#111', border: '1px solid #333', borderRadius: 8,
                  color: '#fff', padding: '10px 14px', fontSize: 14,
                }}
              />
              {configMsg && (
                <div style={{
                  color: configMsg.ok ? '#22c55e' : '#ef4444',
                  background: configMsg.ok ? '#22c55e11' : '#ef444411',
                  padding: '10px 14px', borderRadius: 8, fontSize: 13,
                }}>
                  {configMsg.ok ? `✅ ${configMsg.message}` : `❌ ${configMsg.error}`}
                </div>
              )}
              <button type="submit" style={{
                background: '#ea1d2c', color: '#fff', border: 'none',
                borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
                Conectar ao iFood
              </button>
            </form>
          </div>
        )}

        {/* Not connected warning */}
        {!loading && !status?.connected && !showConfig && (
          <div style={{
            background: '#1a1a1a', border: '1px solid #ea1d2c44',
            borderRadius: 14, padding: 32, textAlign: 'center', marginBottom: 24,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔌</div>
            <h3 style={{ color: '#ea1d2c', margin: '0 0 8px' }}>iFood não configurado</h3>
            <p style={{ color: '#666', margin: '0 0 20px', fontSize: 14 }}>
              Configure suas credenciais para receber pedidos iFood direto no sistema.
            </p>
            <button onClick={() => setShowConfig(true)} style={{
              background: '#ea1d2c', color: '#fff', border: 'none',
              borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              ⚙️ Configurar Agora
            </button>
          </div>
        )}

        {status?.connected && (
          <>
            {/* Stats bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { icon: <ShoppingBag size={20} />, label: 'Pedidos hoje', value: todayOrders.length, color: '#ea1d2c' },
                { icon: <Zap size={20} />, label: 'Ativos agora', value: activeCount, color: '#f59e0b' },
                { icon: <CheckCircle2 size={20} />, label: 'Faturamento iFood', value: fmt(todayRevenue), color: '#22c55e' },
                { icon: <Clock size={20} />, label: 'Polling', value: polling ? 'Ativo' : 'Parado', color: polling ? '#22c55e' : '#ef4444' },
              ].map((s, i) => (
                <div key={i} style={{
                  background: '#1a1a1a', border: `1px solid ${s.color}33`,
                  borderRadius: 12, padding: '16px 20px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{ color: s.color }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                    <div style={{ fontWeight: 800, fontSize: 20, color: '#fff' }}>{s.value}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
              {/* Orders column */}
              <div>
                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { v: 'active', label: `Ativos (${activeCount})` },
                      { v: 'all',    label: `Todos (${orders.length})` },
                      { v: 'done',   label: 'Finalizados' },
                    ].map(f => (
                      <button key={f.v} onClick={() => setFilter(f.v)} style={{
                        background: filter === f.v ? '#ea1d2c' : '#1a1a1a',
                        color: filter === f.v ? '#fff' : '#666',
                        border: `1px solid ${filter === f.v ? '#ea1d2c' : '#2a2a2a'}`,
                        borderRadius: 8, padding: '6px 14px', fontSize: 12,
                        fontWeight: 600, cursor: 'pointer',
                      }}>{f.label}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handlePollNow} style={{
                      background: '#2a2a2a', border: '1px solid #333', borderRadius: 8,
                      color: '#aaa', padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <RefreshCw size={12} /> Buscar agora
                    </button>
                    <button onClick={togglePolling} style={{
                      background: polling ? '#ef444422' : '#22c55e22',
                      color: polling ? '#ef4444' : '#22c55e',
                      border: `1px solid ${polling ? '#ef444455' : '#22c55e55'}`,
                      borderRadius: 8, padding: '6px 14px', fontSize: 12,
                      fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {polling ? <><Pause size={12} /> Pausar auto</> : <><Play size={12} /> Ativar auto</>}
                    </button>
                  </div>
                </div>

                {/* Order list */}
                {filtered.length === 0
                  ? <div style={{
                      background: '#1a1a1a', border: '1px solid #2a2a2a',
                      borderRadius: 12, padding: 40, textAlign: 'center', color: '#444',
                    }}>
                      {filter === 'active'
                        ? '🎉 Nenhum pedido ativo no momento'
                        : 'Nenhum pedido encontrado'
                      }
                    </div>
                  : filtered.map(o => (
                      <OrderCard key={o.id + o.ifood_id} order={o} onAction={handleAction} />
                    ))
                }
              </div>

              {/* Sidebar */}
              <div>
                {/* Polling status */}
                <div style={{
                  background: '#1a1a1a', border: '1px solid #2a2a2a',
                  borderRadius: 12, padding: 16, marginBottom: 16,
                }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Auto-polling
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: polling ? '#22c55e' : '#ef4444',
                      boxShadow: polling ? '0 0 8px #22c55e' : 'none',
                    }} />
                    <span style={{ fontSize: 13, color: polling ? '#22c55e' : '#ef4444' }}>
                      {polling ? 'Ativo — verifica a cada 30s' : 'Desativado'}
                    </span>
                  </div>
                  <p style={{ color: '#555', fontSize: 11, margin: '0 0 12px' }}>
                    Quando ativo, novos pedidos iFood chegam automaticamente na cozinha.
                  </p>
                  <button onClick={togglePolling} style={{
                    width: '100%', background: polling ? '#ef444422' : '#22c55e22',
                    color: polling ? '#ef4444' : '#22c55e',
                    border: `1px solid ${polling ? '#ef444455' : '#22c55e55'}`,
                    borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                    {polling ? '⏸ Pausar polling' : '▶ Iniciar polling'}
                  </button>
                </div>

                {/* Merchants */}
                <div>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Lojas vinculadas
                  </h4>
                  {status?.merchants?.length > 0
                    ? status.merchants.map(m => (
                        <MerchantCard key={m.id} merchant={m} onOpen={handleOpen} onPause={handlePause} />
                      ))
                    : <div style={{ color: '#444', fontSize: 13, padding: '12px 0' }}>
                        Nenhuma loja encontrada
                      </div>
                  }
                </div>

                {/* How it works */}
                <div style={{
                  background: '#1a1a1a', border: '1px solid #2a2a2a',
                  borderRadius: 12, padding: 16, marginTop: 16,
                }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Como funciona
                  </h4>
                  {[
                    ['🔔', 'Pedido chega no iFood'],
                    ['⚡', 'Sistema confirma automático'],
                    ['🔥', 'Aparece na Cozinha em tempo real'],
                    ['✅', 'Cozinha marca pronto'],
                    ['🚴', 'Entregador é despachado'],
                    ['📊', 'Caixa consolida iFood + interno'],
                  ].map(([icon, text]) => (
                    <div key={text} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12, color: '#888' }}>
                      <span>{icon}</span><span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
