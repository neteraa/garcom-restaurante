import React, { useEffect, useRef, useState } from 'react'
import { Flame, Clock, CheckCircle2, Bell, PackageCheck } from 'lucide-react'

const API = ''
const WS = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/kitchen'

const fmt = (iso) => {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const elapsed = (iso) => {
  if (!iso) return '0m'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const m = Math.floor(s / 60)
  return `${m}m ${(s % 60).toString().padStart(2, '0')}s`
}

export default function Kitchen() {
  const [orders, setOrders] = useState([])
  const [connected, setConnected] = useState(false)
  const [pulseId, setPulseId] = useState(null)
  const [stats, setStats] = useState({ total_today: 0, orders_today: 0 })
  const [stockAlerts, setStockAlerts] = useState([])   // alertas de estoque baixo
  const wsRef = useRef(null)
  const audioRef = useRef(null)

  const fetchStats = async () => {
    try { const r = await fetch(`${API}/api/stats`); setStats(await r.json()) } catch {}
  }
  useEffect(() => { fetchStats(); const iv = setInterval(fetchStats, 5000); return () => clearInterval(iv) }, [])

  // Force re-render every second for elapsed timers
  const [, tick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => tick(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [])

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(WS)
    wsRef.current = ws
    ws.onopen = () => setConnected(true)
    ws.onclose = () => { setConnected(false); setTimeout(connect, 2000) }
          ws.onmessage = (ev) => {
      const d = JSON.parse(ev.data)
      if (d.type === 'snapshot') {
        setOrders(d.orders)
      } else if (d.type === 'new') {
        setOrders(prev => [d.order, ...prev.filter(o => o.id !== d.order.id)])
        setPulseId(d.order.id)
        setTimeout(() => setPulseId(null), 3000)
        fetchStats()
        // Play ding
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.frequency.value = 880
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
          osc.start(); osc.stop(ctx.currentTime + 0.5)
        } catch {}
      } else if (d.type === 'status') {
        setOrders(prev => prev.map(o => o.id === d.order.id ? d.order : o).filter(o => ['preparing', 'ready'].includes(o.status)))
      } else if (d.type === 'inventory_alert') {
        // Mergeia novos alertas com os existentes
        setStockAlerts(prev => {
          const merged = [...prev]
          for (const a of d.alerts) {
            const idx = merged.findIndex(x => x.item_id === a.item_id)
            if (idx >= 0) merged[idx] = a
            else merged.push(a)
          }
          return merged
        })
      }
    }
  }

  useEffect(() => { connect(); return () => wsRef.current?.close() }, [])

  const updateStatus = async (id, status) => {
    await fetch(`${API}/api/order/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: id, status }),
    })
  }

  const preparing = orders.filter(o => o.status === 'preparing')
  const ready = orders.filter(o => o.status === 'ready')

  return (
    <div className="kitchen">
      <header className="kh-header">
        <div className="kh-brand">
          <Flame size={30} color="#f97316" />
          <div>
            <div className="kh-title">JM ESPETINHOS</div>
            <div className="kh-sub">Painel da Cozinha</div>
          </div>
        </div>
        <div className={`kh-status ${connected ? 'on' : ''}`}>
          <span className="kh-dot" />
          {connected ? 'ONLINE' : 'CONECTANDO...'}
        </div>
        <div className="kh-stats">
          <div><span className="stat-num">{preparing.length}</span><span className="stat-label">PREPARANDO</span></div>
          <div><span className="stat-num" style={{ color: '#22c55e' }}>{ready.length}</span><span className="stat-label">PRONTOS</span></div>
          <div><span className="stat-num" style={{ color: '#fbbf24' }}>{stats.orders_today || 0}</span><span className="stat-label">HOJE</span></div>
          <div><span className="stat-num" style={{ color: '#22c55e', fontSize: 22 }}>R$ {(stats.total_today || 0).toFixed(2)}</span><span className="stat-label">CAIXA</span></div>
        </div>
        <a href="#/ifood" style={{
          background: '#ea1d2c', color: '#fff', borderRadius: 8,
          padding: '6px 14px', fontWeight: 700, fontSize: 12, textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16,
        }}>🛵 iFood</a>
      </header>

      {/* ── Alertas de estoque — aparecem quando item fica baixo/zerado ── */}
      {stockAlerts.length > 0 && (
        <div className="kh-stock-alerts">
          <span className="ksa-icon">⚠️</span>
          <span className="ksa-label">ESTOQUE:</span>
          {stockAlerts.map(a => (
            <span key={a.item_id} className={`ksa-chip ${a.level}`}>
              {a.level === 'out' ? '🔴' : '🟠'} {a.name}
              {a.stock > 0 ? ` — ${a.stock} un.` : ' — ZEROU!'}
            </span>
          ))}
          <button className="ksa-dismiss" onClick={() => setStockAlerts([])}>✕</button>
        </div>
      )}

      <div className="kh-columns">
        {/* Preparing */}
        <div className="kh-col">
          <div className="kh-col-title">
            <Clock size={20} /> EM PREPARO ({preparing.length})
          </div>
          <div className="kh-list">
            {preparing.length === 0 && (
              <div className="kh-empty">Aguardando pedidos...</div>
            )}
            {preparing.map(o => (
              <div key={o.id} className={`kh-card ${pulseId === o.id ? 'pulse' : ''} ${o.table_id ? 'mesa-card' : ''}`}>
                <div className="kh-card-head">
                  <span className="kh-senha">#{o.id.toUpperCase()}</span>
                  {o.table_id && <span className="kh-mesa-badge">🪑 Mesa {o.table_id}</span>}
                  {(o.source === 'ifood' || o.channel === 'ifood') && (
                    <span className="kh-ifood-badge">🛵 iFood</span>
                  )}
                  <span className="kh-time">{fmt(o.created_at)} · {elapsed(o.created_at)}</span>
                </div>
                <div className="kh-customer">{o.customer || o.customer_id || 'Anônimo'}</div>
                <div className="kh-items">
                  {(o.items || []).map((it, i) => (
                    <div key={i} className="kh-item">
                      <span className="kh-qty">{it.qty || it.quantity}×</span>
                      <span>{it.name}</span>
                    </div>
                  ))}
                </div>
                <div className="kh-actions">
                  <button className="btn-ready" onClick={() => updateStatus(o.id, 'ready')}>
                    <Bell size={16} /> MARCAR PRONTO
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ready */}
        <div className="kh-col">
          <div className="kh-col-title ready">
            <CheckCircle2 size={20} /> PRONTOS ({ready.length})
          </div>
          <div className="kh-list">
            {ready.length === 0 && (
              <div className="kh-empty">Nenhum pedido pronto</div>
            )}
            {ready.map(o => (
              <div key={o.id} className={`kh-card ready ${o.table_id ? 'mesa-card' : ''}`}>
                <div className="kh-card-head">
                  <span className="kh-senha ready">#{o.id.toUpperCase()}</span>
                  {o.table_id && <span className="kh-mesa-badge">🪑 Mesa {o.table_id}</span>}
                  {(o.source === 'ifood' || o.channel === 'ifood') && (
                    <span className="kh-ifood-badge">🛵 iFood</span>
                  )}
                  <span className="kh-time">Pronto há {elapsed(o.timeline?.ready)}</span>
                </div>
                <div className="kh-customer">{o.customer || o.customer_id || 'Anônimo'}</div>
                <div className="kh-items">
                  {(o.items || []).map((it, i) => (
                    <div key={i} className="kh-item">
                      <span className="kh-qty">{it.qty || it.quantity}×</span>
                      <span>{it.name}</span>
                    </div>
                  ))}
                </div>
                <div className="kh-actions">
                  <button className="btn-delivered" onClick={() => updateStatus(o.id, 'delivered')}>
                    <PackageCheck size={16} /> ENTREGUE
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        html, body, #root { margin: 0; padding: 0; height: 100vh; overflow: hidden; }
        .kitchen {
          height: 100vh;
          background: linear-gradient(180deg, #1a0f08 0%, #0a0604 100%);
          color: #fef3c7;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .kh-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 30px;
          background: linear-gradient(180deg, rgba(120,53,15,0.5) 0%, rgba(0,0,0,0.6) 100%);
          border-bottom: 2px solid rgba(249,115,22,0.4);
        }
        .kh-brand { display: flex; align-items: center; gap: 14px; }
        .kh-title { font-size: 24px; font-weight: 900; letter-spacing: 4px; color: #f97316; text-shadow: 0 0 15px rgba(249,115,22,0.5); }
        .kh-sub { font-size: 11px; letter-spacing: 4px; color: #fbbf24; }
        .kh-status {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; letter-spacing: 3px; font-weight: 800;
          padding: 6px 14px; border-radius: 999px;
          background: rgba(0,0,0,0.5); color: #64748b;
        }
        .kh-status.on { color: #22c55e; }
        .kh-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 1.5s infinite; }
        @keyframes pulse { 50% { opacity: 0.5; } }
        .kh-stats { display: flex; gap: 24px; }
        .kh-stats > div {
          display: flex; flex-direction: column; align-items: center;
          background: rgba(0,0,0,0.4); padding: 8px 20px; border-radius: 12px;
          border: 1px solid rgba(249,115,22,0.3);
        }
        .stat-num { font-size: 30px; font-weight: 900; color: #f97316; line-height: 1; }
        .stat-label { font-size: 9px; letter-spacing: 3px; color: #94a3b8; margin-top: 2px; }

        /* STOCK ALERTS BANNER */
        .kh-stock-alerts {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          background: rgba(249,115,22,0.12);
          border-bottom: 2px solid rgba(249,115,22,0.4);
          padding: 8px 20px; font-size: 12px;
          animation: saFlash 1s ease-in-out 3;
        }
        @keyframes saFlash { 0%,100% { background: rgba(249,115,22,0.12); } 50% { background: rgba(249,115,22,0.25); } }
        .ksa-icon { font-size: 16px; }
        .ksa-label { font-weight: 900; letter-spacing: 2px; color: #f97316; }
        .ksa-chip {
          padding: 3px 10px; border-radius: 999px;
          background: rgba(249,115,22,0.2); color: #fbbf24;
          border: 1px solid rgba(249,115,22,0.4); font-weight: 700; font-size: 11px;
        }
        .ksa-chip.out { background: rgba(239,68,68,0.2); color: #fca5a5; border-color: rgba(239,68,68,0.5); }
        .ksa-dismiss {
          margin-left: auto; background: none; border: none;
          color: #64748b; cursor: pointer; font-size: 14px; padding: 2px 6px;
        }
        .ksa-dismiss:hover { color: #f97316; }

        .kh-columns {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          padding: 20px;
          overflow: hidden;
        }
        .kh-col {
          display: flex; flex-direction: column;
          background: rgba(0,0,0,0.35);
          border-radius: 16px;
          border: 1px solid rgba(148,163,184,0.15);
          overflow: hidden;
        }
        .kh-col-title {
          padding: 14px 20px;
          font-size: 13px; letter-spacing: 3px; font-weight: 900;
          color: #f97316;
          background: rgba(249,115,22,0.1);
          border-bottom: 1px solid rgba(249,115,22,0.2);
          display: flex; align-items: center; gap: 10px;
        }
        .kh-col-title.ready { color: #22c55e; background: rgba(34,197,94,0.1); border-bottom-color: rgba(34,197,94,0.3); }
        .kh-list {
          flex: 1; overflow-y: auto; padding: 14px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .kh-empty { text-align: center; color: #64748b; padding: 40px 20px; font-size: 14px; }

        .kh-card {
          background: rgba(41,25,15,0.7);
          border: 2px solid rgba(249,115,22,0.35);
          border-radius: 14px;
          padding: 14px 18px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          transition: all 0.3s;
        }
        .kh-card.pulse {
          animation: newOrder 1.5s ease-out 3;
          border-color: #f97316;
        }
        @keyframes newOrder {
          0% { transform: scale(1); box-shadow: 0 0 0 rgba(249,115,22,0); }
          50% { transform: scale(1.03); box-shadow: 0 0 40px rgba(249,115,22,0.7); }
          100% { transform: scale(1); box-shadow: 0 0 0 rgba(249,115,22,0); }
        }
        .kh-card.ready {
          background: rgba(20,55,35,0.6);
          border-color: rgba(34,197,94,0.5);
        }
        .kh-card-head {
          display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 4px;
          margin-bottom: 8px;
        }
        /* Pedidos de mesa — borda índigo */
        .mesa-card { border-color: rgba(99,102,241,0.5) !important; }
        .kh-mesa-badge {
          font-size: 11px; font-weight: 900; letter-spacing: 1px;
          background: rgba(99,102,241,0.2); color: #a5b4fc;
          border: 1px solid rgba(99,102,241,0.5); border-radius: 999px;
          padding: 2px 9px;
        }
        .kh-ifood-badge {
          font-size: 11px; font-weight: 900; letter-spacing: 1px;
          background: rgba(234,29,44,0.2); color: #ea1d2c;
          border: 1px solid rgba(234,29,44,0.5); border-radius: 999px;
          padding: 2px 9px;
        }
        .kh-senha {
          font-size: 28px; font-weight: 900; color: #f97316;
          font-family: 'Courier New', monospace; letter-spacing: 2px;
        }
        .kh-senha.ready { color: #22c55e; }
        .kh-time { font-size: 11px; color: #94a3b8; letter-spacing: 1px; }
        .kh-customer { font-size: 15px; color: #fbbf24; font-weight: 700; margin-bottom: 10px; }
        .kh-items {
          background: rgba(0,0,0,0.3); border-radius: 8px;
          padding: 8px 12px; margin-bottom: 12px;
        }
        .kh-item {
          display: flex; gap: 10px; padding: 4px 0;
          font-size: 15px; color: #fef3c7;
        }
        .kh-qty { color: #fbbf24; font-weight: 800; min-width: 30px; }
        .kh-actions { display: flex; gap: 8px; }
        .btn-ready {
          flex: 1; background: linear-gradient(135deg, #f97316, #dc2626);
          color: #fff; border: none; padding: 10px;
          border-radius: 10px; font-weight: 900; font-size: 13px;
          letter-spacing: 2px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .btn-delivered {
          flex: 1; background: linear-gradient(135deg, #22c55e, #059669);
          color: #000; border: none; padding: 10px;
          border-radius: 10px; font-weight: 900; font-size: 13px;
          letter-spacing: 2px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
      `}</style>
    </div>
  )
}
