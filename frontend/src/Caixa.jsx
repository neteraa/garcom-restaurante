import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, Banknote, CheckCircle2, Clock, CreditCard,
  DollarSign, Flame, HandCoins, ShoppingBag, Smartphone,
  TrendingUp, Trophy, Users, Wallet, X
} from 'lucide-react'

const WS = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/kitchen'
const fmtBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtTime = (iso) => {
  if (!iso) return '--'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
const ago = (iso) => {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso)) / 60000)
  return m < 1 ? 'agora' : `${m}min`
}

const PAYMENT_METHODS = [
  { id: 'pix',     label: 'PIX',           icon: Smartphone,  color: '#22c55e', bg: '#22c55e' },
  { id: 'debito',  label: 'Débito',        icon: CreditCard,  color: '#3b82f6', bg: '#3b82f6' },
  { id: 'credito', label: 'Crédito',       icon: CreditCard,  color: '#8b5cf6', bg: '#8b5cf6' },
  { id: 'dinheiro',label: 'Dinheiro',      icon: Banknote,    color: '#f59e0b', bg: '#f59e0b' },
  { id: 'fiado',   label: 'Fiado',         icon: HandCoins,   color: '#ef4444', bg: '#ef4444' },
]

const METHOD_LABEL = {
  pix:     { label: 'PIX',     color: '#22c55e' },
  debito:  { label: 'Débito',  color: '#3b82f6' },
  credito: { label: 'Crédito', color: '#8b5cf6' },
  dinheiro:{ label: 'Dinheiro',color: '#f59e0b' },
  fiado:   { label: 'Fiado',   color: '#ef4444' },
}
const STATUS_LABEL = {
  preparing: { l: 'Preparando', c: '#f97316' },
  ready:     { l: 'Pronto ✓',   c: '#22c55e' },
  delivered: { l: 'Pago',       c: '#3b82f6' },
  canceled:  { l: 'Cancelado',  c: '#ef4444' },
}

// ── PaymentModal ──────────────────────────────────────────────────────────────
function PaymentModal({ order, onClose, onPay }) {
  const [method, setMethod] = useState(null)
  const [amountPaid, setAmountPaid] = useState('')
  const [loading, setLoading] = useState(false)
  const total = order.total || 0
  const troco = method === 'dinheiro' && amountPaid
    ? Math.max(0, parseFloat(amountPaid) - total)
    : null

  const handlePay = async () => {
    if (!method) return
    setLoading(true)
    await onPay(order.id, method, method === 'dinheiro' ? parseFloat(amountPaid) || total : null)
    setLoading(false)
    onClose()
  }

  // Quick cash buttons
  const cashSuggestions = [
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
    Math.ceil(total / 50) * 50,
  ].filter((v, i, a) => a.indexOf(v) === i && v >= total)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 999, padding: 20,
    }}>
      <div style={{
        background: '#161616', border: '1px solid #2a2a2a',
        borderRadius: 20, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflow: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px 16px', borderBottom: '1px solid #222',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>
              #{order.id?.toUpperCase()} — {order.customer || order.customer_id || 'Cliente'}
            </div>
            <div style={{ color: '#555', fontSize: 12, marginTop: 2 }}>
              {order.table_id ? `🪑 Mesa ${order.table_id}` : order.source === 'ifood' ? '🛵 iFood' : '🖥 Totem'}
              {' · '}{fmtTime(order.created_at)} ({ago(order.created_at)})
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 4 }}>
            <X size={22} />
          </button>
        </div>

        {/* Items */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: 2, marginBottom: 10 }}>ITENS DO PEDIDO</div>
          {(order.items || []).map((it, i) => {
            const qty = it.qty || it.quantity || 1
            const price = it.price || 0
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '7px 0', borderBottom: '1px solid #1a1a1a', fontSize: 14,
              }}>
                <span style={{ color: '#ccc' }}>
                  <span style={{ color: '#f97316', fontWeight: 700, marginRight: 8 }}>{qty}×</span>
                  {it.name}
                  {it.notes && <span style={{ color: '#555', fontSize: 11 }}> — {it.notes}</span>}
                </span>
                <span style={{ color: '#fef3c7', fontWeight: 600 }}>{fmtBRL(price * qty)}</span>
              </div>
            )
          })}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            marginTop: 12, paddingTop: 10, borderTop: '2px solid #2a2a2a',
          }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: '#fef3c7' }}>TOTAL</span>
            <span style={{ fontWeight: 900, fontSize: 24, color: '#22c55e' }}>{fmtBRL(total)}</span>
          </div>
        </div>

        {/* Payment method */}
        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: 2, marginBottom: 12 }}>FORMA DE PAGAMENTO</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {PAYMENT_METHODS.map(pm => {
              const Icon = pm.icon
              const sel = method === pm.id
              return (
                <button key={pm.id} onClick={() => setMethod(pm.id)} style={{
                  background: sel ? pm.bg + '33' : '#111',
                  border: `2px solid ${sel ? pm.color : '#2a2a2a'}`,
                  borderRadius: 12, padding: '12px 4px',
                  color: sel ? pm.color : '#555',
                  cursor: 'pointer', textAlign: 'center',
                  transition: 'all 0.15s',
                }}>
                  <Icon size={22} style={{ marginBottom: 4 }} />
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{pm.label}</div>
                </button>
              )
            })}
          </div>

          {/* Dinheiro: valor recebido + troco */}
          {method === 'dinheiro' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: '#555', letterSpacing: 2, marginBottom: 8 }}>VALOR RECEBIDO</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {cashSuggestions.map(v => (
                  <button key={v} onClick={() => setAmountPaid(String(v))} style={{
                    flex: 1, background: amountPaid == v ? '#f59e0b33' : '#1a1a1a',
                    border: `1px solid ${amountPaid == v ? '#f59e0b' : '#2a2a2a'}`,
                    borderRadius: 8, padding: '8px 0', color: '#fbbf24',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  }}>{fmtBRL(v)}</button>
                ))}
              </div>
              <input
                type="number"
                value={amountPaid}
                onChange={e => setAmountPaid(e.target.value)}
                placeholder={`Mínimo ${fmtBRL(total)}`}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#111', border: '1px solid #333', borderRadius: 10,
                  color: '#fff', padding: '12px 16px', fontSize: 18,
                  fontWeight: 700, textAlign: 'right',
                }}
              />
              {troco !== null && (
                <div style={{
                  marginTop: 10, padding: '12px 16px',
                  background: troco > 0 ? '#22c55e22' : '#ef444422',
                  border: `1px solid ${troco > 0 ? '#22c55e55' : '#ef444455'}`,
                  borderRadius: 10,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ color: '#aaa', fontSize: 13 }}>TROCO</span>
                  <span style={{
                    fontWeight: 900, fontSize: 22,
                    color: troco > 0 ? '#22c55e' : '#ef4444',
                  }}>
                    {troco > 0 ? fmtBRL(troco) : 'Valor insuficiente'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirm button */}
        <div style={{ padding: '0 24px 24px' }}>
          <button
            onClick={handlePay}
            disabled={!method || loading || (method === 'dinheiro' && parseFloat(amountPaid) < total)}
            style={{
              width: '100%', padding: '16px',
              background: method && !(method === 'dinheiro' && parseFloat(amountPaid) < total)
                ? '#22c55e' : '#1a1a1a',
              color: method ? '#fff' : '#444',
              border: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 800, cursor: method ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Processando...' : `✓ Confirmar Pagamento${method ? ` — ${METHOD_LABEL[method]?.label}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── OrderCard na fila ─────────────────────────────────────────────────────────
function QueueCard({ order, onSelect }) {
  const isReady = order.status === 'ready'
  const source = order.source === 'ifood' ? '🛵' : order.table_id ? '🪑' : '🖥'
  const total = order.total || 0

  return (
    <div
      onClick={() => onSelect(order)}
      style={{
        background: isReady ? 'rgba(34,197,94,0.07)' : 'rgba(0,0,0,0.4)',
        border: `1px solid ${isReady ? 'rgba(34,197,94,0.4)' : 'rgba(148,163,184,0.12)'}`,
        borderRadius: 14, padding: '14px 16px',
        cursor: 'pointer', transition: 'all 0.15s',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'Courier New', fontWeight: 900, fontSize: 16, color: '#f97316' }}>
              #{order.id?.toUpperCase()?.slice(0,6)}
            </span>
            <span style={{ fontSize: 12 }}>{source}</span>
            {isReady && (
              <span style={{
                background: '#22c55e22', color: '#22c55e',
                border: '1px solid #22c55e55', borderRadius: 99,
                padding: '1px 8px', fontSize: 10, fontWeight: 800, letterSpacing: 1,
              }}>PRONTO</span>
            )}
          </div>
          <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 14 }}>
            {order.customer || order.customer_id || 'Cliente'}
            {order.table_id && <span style={{ color: '#666', fontWeight: 400 }}> · Mesa {order.table_id}</span>}
          </div>
          <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>
            {(order.items || []).slice(0, 3).map((it, i) => (
              <span key={i} style={{ marginRight: 8 }}>
                {it.qty || it.quantity}× {it.name}
              </span>
            ))}
            {(order.items || []).length > 3 && <span>+{order.items.length - 3}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: '#22c55e' }}>{fmtBRL(total)}</div>
          <div style={{ color: '#444', fontSize: 11, marginTop: 2 }}>{ago(order.created_at)}</div>
        </div>
      </div>
      <div style={{
        marginTop: 10, background: '#22c55e', color: '#fff',
        borderRadius: 8, padding: '8px 0', textAlign: 'center',
        fontWeight: 700, fontSize: 13,
      }}>
        💳 Receber Pagamento
      </div>
    </div>
  )
}

// ── Main Caixa ────────────────────────────────────────────────────────────────
export default function Caixa() {
  const [stats, setStats] = useState(null)
  const [queue, setQueue] = useState([])
  const [selected, setSelected] = useState(null)
  const [connected, setConnected] = useState(false)
  const [flashRevenue, setFlashRevenue] = useState(false)
  const wsRef = useRef(null)
  const prevTotalRef = useRef(0)

  const fetchAll = useCallback(async () => {
    try {
      const [sr, qr] = await Promise.all([
        fetch('/api/stats').then(r => r.json()),
        fetch('/api/orders/pending-payment').then(r => r.json()),
      ])
      if (sr.total_today > prevTotalRef.current && prevTotalRef.current > 0) {
        setFlashRevenue(true)
        setTimeout(() => setFlashRevenue(false), 1500)
      }
      prevTotalRef.current = sr.total_today
      setStats(sr)
      // Sort: ready first, then by time
      const q = (qr.orders || []).sort((a, b) => {
        if (a.status === 'ready' && b.status !== 'ready') return -1
        if (b.status === 'ready' && a.status !== 'ready') return 1
        return new Date(a.created_at) - new Date(b.created_at)
      })
      setQueue(q)
    } catch {}
  }, [])

  useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 5000); return () => clearInterval(iv) }, [fetchAll])

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => { setConnected(false); setTimeout(connect, 2000) }
      ws.onmessage = (ev) => {
        try { const d = JSON.parse(ev.data); if (d.type === 'new' || d.type === 'status') fetchAll() } catch {}
      }
    }
    connect()
    return () => wsRef.current?.close()
  }, [fetchAll])

  const handlePay = async (orderId, method, amountPaid) => {
    await fetch('/api/order/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, status: 'delivered', payment_method: method, amount_paid: amountPaid }),
    })
    await fetchAll()
  }

  if (!stats) return (
    <div style={{ height: '100vh', background: '#0a0604', color: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Carregando painel de caixa...
    </div>
  )

  const maxHourRevenue = Math.max(1, ...(stats.hours_series || []).map(h => h.revenue))
  const maxTopQty     = Math.max(1, ...(stats.top_items || []).map(i => i.qty))
  const pb            = stats.payment_breakdown || {}
  const pbTotal       = Object.values(pb).reduce((s, v) => s + v.total, 0) || 1

  return (
    <div style={{
      height: '100vh', background: 'linear-gradient(180deg,#1a0f08,#0a0604)',
      color: '#fef3c7', fontFamily: "'Inter',system-ui,sans-serif",
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Modal pagamento */}
      {selected && (
        <PaymentModal
          order={selected}
          onClose={() => setSelected(null)}
          onPay={handlePay}
        />
      )}

      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px',
        background: 'linear-gradient(180deg,rgba(120,53,15,.5),rgba(0,0,0,.6))',
        borderBottom: '2px solid rgba(249,115,22,.4)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Flame size={28} color="#f97316" />
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 4, color: '#f97316' }}>JM ESPETINHOS</div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: '#fbbf24' }}>
              CAIXA · {new Date().toLocaleDateString('pt-BR')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {queue.length > 0 && (
            <div style={{
              background: '#ef444422', border: '1px solid #ef444455',
              borderRadius: 99, padding: '4px 14px',
              color: '#ef4444', fontWeight: 800, fontSize: 13,
            }}>
              {queue.length} aguardando pagamento
            </div>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 10, letterSpacing: 3, fontWeight: 800,
            padding: '5px 12px', borderRadius: 999,
            background: 'rgba(0,0,0,.5)',
            color: connected ? '#22c55e' : '#64748b',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
            {connected ? 'AO VIVO' : 'RECONECTANDO'}
          </div>
        </div>
      </header>

      {/* KPIs */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr 1fr 1fr',
        gap: 12, padding: '12px 20px 0', flexShrink: 0,
      }}>
        {[
          {
            icon: DollarSign, cls: 'big', label: 'FATURAMENTO HOJE',
            value: fmtBRL(stats.total_today), color: '#22c55e', flash: flashRevenue,
          },
          { icon: ShoppingBag, label: 'PEDIDOS', value: stats.orders_today, hint: stats.orders_canceled > 0 ? `${stats.orders_canceled} cancelado(s)` : null, color: '#f97316' },
          { icon: TrendingUp, label: 'TICKET MÉDIO', value: fmtBRL(stats.ticket_avg), color: '#3b82f6' },
          { icon: Activity,   label: 'NA COZINHA', value: stats.active_count, hint: 'preparando/prontos', color: '#22c55e' },
          { icon: Wallet,     label: 'AG. PAGAMENTO', value: queue.length, hint: queue.length > 0 ? 'clique para cobrar' : 'tudo pago', color: queue.length > 0 ? '#ef4444' : '#22c55e' },
        ].map((k, i) => {
          const Icon = k.icon
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: k.cls === 'big'
                ? 'linear-gradient(135deg,rgba(34,197,94,.15),rgba(249,115,22,.15))'
                : 'rgba(0,0,0,.4)',
              border: `1px solid ${k.cls === 'big' ? 'rgba(34,197,94,.35)' : 'rgba(148,163,184,.12)'}`,
              borderRadius: 14, padding: '12px 16px',
              animation: k.flash ? 'revFlash 1.2s ease-out' : 'none',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: k.color + '22', color: k.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={20} />
              </div>
              <div>
                <div style={{ fontSize: 8, letterSpacing: 3, color: '#94a3b8', fontWeight: 700 }}>{k.label}</div>
                <div style={{
                  fontWeight: 900, lineHeight: 1.1, marginTop: 2,
                  fontSize: k.cls === 'big' ? 32 : 22,
                  color: k.cls === 'big' ? '#22c55e' : '#fef3c7',
                }}>{k.value}</div>
                {k.hint && <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{k.hint}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Body: fila + métricas */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, padding: '12px 20px 16px', overflow: 'hidden' }}>

        {/* ── Fila de cobrança ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, fontWeight: 900, color: '#fef3c7', marginBottom: 10, flexShrink: 0 }}>
            💳 FILA DE COBRANÇA {queue.length > 0 && `(${queue.length})`}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {queue.length === 0 ? (
              <div style={{
                background: 'rgba(0,0,0,.35)', border: '1px solid rgba(148,163,184,.1)',
                borderRadius: 14, padding: '40px 20px', textAlign: 'center',
              }}>
                <CheckCircle2 size={36} color="#22c55e" style={{ marginBottom: 10 }} />
                <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 15 }}>Tudo em dia!</div>
                <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>Nenhum pedido aguardando cobrança</div>
              </div>
            ) : (
              queue.map(o => <QueueCard key={o.id} order={o} onSelect={setSelected} />)
            )}
          </div>
        </div>

        {/* ── Métricas ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>

          {/* Linha: formas de pagamento + top itens */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flexShrink: 0 }}>

            {/* Formas de pagamento */}
            <div style={{
              background: 'rgba(0,0,0,.45)', border: '1px solid rgba(148,163,184,.12)',
              borderRadius: 14, padding: '14px 16px',
            }}>
              <div style={{ fontSize: 10, letterSpacing: 3, fontWeight: 900, color: '#fef3c7', marginBottom: 12 }}>
                💳 FORMAS DE PAGAMENTO
              </div>
              {Object.keys(pb).length === 0 ? (
                <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
                  Nenhum pagamento registrado hoje
                </div>
              ) : (
                PAYMENT_METHODS.filter(pm => pb[pm.id]).map(pm => {
                  const v = pb[pm.id]
                  const pct = Math.round((v.total / pbTotal) * 100)
                  return (
                    <div key={pm.id} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: pm.color, fontWeight: 700, fontSize: 13 }}>
                          {pm.label} <span style={{ color: '#555', fontWeight: 400, fontSize: 11 }}>({v.count}×)</span>
                        </span>
                        <span style={{ color: '#fef3c7', fontWeight: 800, fontSize: 13 }}>{fmtBRL(v.total)}</span>
                      </div>
                      <div style={{ height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pm.color, borderRadius: 3, transition: 'width .4s' }} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Top vendas */}
            <div style={{
              background: 'rgba(0,0,0,.45)', border: '1px solid rgba(148,163,184,.12)',
              borderRadius: 14, padding: '14px 16px',
            }}>
              <div style={{ fontSize: 10, letterSpacing: 3, fontWeight: 900, color: '#fef3c7', marginBottom: 12 }}>
                🏆 TOP VENDAS
              </div>
              {(stats.top_items || []).length === 0 ? (
                <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Sem vendas ainda</div>
              ) : (
                (stats.top_items || []).map((it, i) => (
                  <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                    <span style={{ fontWeight: 900, color: '#fbbf24', fontSize: 13, width: 20 }}>#{i+1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#fef3c7', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                      <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${(it.qty/maxTopQty)*100}%`, height: '100%', background: 'linear-gradient(90deg,#f97316,#22c55e)' }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ color: '#f97316', fontWeight: 800, fontSize: 13 }}>{it.qty}×</div>
                      <div style={{ color: '#22c55e', fontSize: 10, fontWeight: 700 }}>{fmtBRL(it.revenue)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Gráfico por hora */}
          <div style={{
            background: 'rgba(0,0,0,.45)', border: '1px solid rgba(148,163,184,.12)',
            borderRadius: 14, padding: '14px 16px', flexShrink: 0,
          }}>
            <div style={{ fontSize: 10, letterSpacing: 3, fontWeight: 900, color: '#fef3c7', marginBottom: 10 }}>
              ⏱ FATURAMENTO POR HORA
            </div>
            {(stats.hours_series || []).length === 0 ? (
              <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '10px 0' }}>Sem dados ainda</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
                {stats.hours_series.map(h => (
                  <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: 9, color: '#22c55e', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {h.revenue >= 100 ? fmtBRL(h.revenue).replace('R$\u00a0','').replace(',00','') : ''}
                    </div>
                    <div style={{
                      width: '100%', minHeight: 3,
                      height: `${(h.revenue / maxHourRevenue) * 68}px`,
                      background: 'linear-gradient(180deg,#22c55e,#f97316)',
                      borderRadius: '4px 4px 0 0',
                    }} />
                    <div style={{ fontSize: 9, color: '#fbbf24', fontWeight: 700 }}>{String(h.hour).padStart(2,'0')}h</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Últimos pedidos */}
          <div style={{
            flex: 1, background: 'rgba(0,0,0,.45)', border: '1px solid rgba(148,163,184,.12)',
            borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ fontSize: 10, letterSpacing: 3, fontWeight: 900, color: '#fef3c7', marginBottom: 10, flexShrink: 0 }}>
              🧾 ÚLTIMOS PEDIDOS
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {(stats.recent || []).length === 0 ? (
                <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Nenhum pedido ainda. Chama a galera! 🔥</div>
              ) : (
                stats.recent.map(o => {
                  const s = STATUS_LABEL[o.status] || { l: o.status, c: '#94a3b8' }
                  const pm = o.payment_method ? METHOD_LABEL[o.payment_method] : null
                  const src = o.source === 'ifood' ? '🛵' : o.table_id ? `🪑${o.table_id}` : '🖥'
                  return (
                    <div key={o.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 1fr 50px 80px 90px 90px',
                      gap: 10, alignItems: 'center',
                      padding: '8px 10px', marginBottom: 5,
                      background: 'rgba(0,0,0,.35)',
                      border: '1px solid rgba(148,163,184,.08)',
                      borderRadius: 8,
                    }}>
                      <div style={{ fontFamily: 'Courier New', fontWeight: 900, fontSize: 13, color: '#f97316' }}>
                        #{o.id?.toUpperCase()?.slice(0,6)}
                      </div>
                      <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {src} {o.customer || 'Anônimo'}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 11 }}>{fmtTime(o.created_at)}</div>
                      <div style={{
                        fontSize: 10, fontWeight: 800, padding: '2px 6px',
                        borderRadius: 99, border: '1px solid',
                        color: s.c, borderColor: s.c + '55', textAlign: 'center',
                      }}>{s.l}</div>
                      <div style={{ textAlign: 'center' }}>
                        {pm ? (
                          <span style={{ color: pm.color, fontSize: 11, fontWeight: 700 }}>{pm.label}</span>
                        ) : (
                          <span style={{ color: '#444', fontSize: 11 }}>—</span>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: '#22c55e' }}>
                        {fmtBRL(o.total)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 50% { opacity: .4; } }
        @keyframes revFlash {
          0%   { background: linear-gradient(135deg,rgba(34,197,94,.6),rgba(249,115,22,.5)); transform: scale(1.02); }
          100% { background: linear-gradient(135deg,rgba(34,197,94,.15),rgba(249,115,22,.15)); transform: scale(1); }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        html, body, #root { margin: 0; padding: 0; height: 100vh; overflow: hidden; }
      `}</style>
    </div>
  )
}
