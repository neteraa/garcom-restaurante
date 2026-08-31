import React, { useEffect, useRef, useState } from 'react'
import { Flame, DollarSign, ShoppingBag, TrendingUp, Users, Clock, Activity, Trophy } from 'lucide-react'

const API = 'http://localhost:8080'
const WS = 'ws://localhost:8080/ws/kitchen' // reaproveita eventos de novo pedido / status

const fmtBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtTime = (iso) => {
  if (!iso) return '--:--'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
const statusLabel = {
  preparing: { l: 'Preparando', c: '#f97316' },
  ready:     { l: 'Pronto',     c: '#22c55e' },
  delivered: { l: 'Entregue',   c: '#3b82f6' },
  canceled:  { l: 'Cancelado',  c: '#ef4444' },
}

export default function Caixa() {
  const [stats, setStats] = useState(null)
  const [connected, setConnected] = useState(false)
  const [flashRevenue, setFlashRevenue] = useState(false)
  const wsRef = useRef(null)
  const prevTotalRef = useRef(0)

  const fetchStats = async () => {
    try {
      const r = await fetch(`${API}/api/stats`)
      const d = await r.json()
      if (d.total_today > prevTotalRef.current && prevTotalRef.current > 0) {
        setFlashRevenue(true)
        setTimeout(() => setFlashRevenue(false), 1500)
      }
      prevTotalRef.current = d.total_today
      setStats(d)
    } catch {}
  }

  useEffect(() => {
    fetchStats()
    const iv = setInterval(fetchStats, 5000)
    return () => clearInterval(iv)
  }, [])

  // WS pra atualizar na hora quando pedido novo cai
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => { setConnected(false); setTimeout(connect, 2000) }
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          if (d.type === 'new' || d.type === 'status') fetchStats()
        } catch {}
      }
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  if (!stats) return (
    <div style={{ height: '100vh', background: '#0a0604', color: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Carregando painel de caixa...
    </div>
  )

  const maxHourRevenue = Math.max(1, ...stats.hours_series.map(h => h.revenue))
  const maxTopQty = Math.max(1, ...stats.top_items.map(i => i.qty))

  return (
    <div className="caixa">
      <header className="cx-header">
        <div className="cx-brand">
          <Flame size={30} color="#f97316" />
          <div>
            <div className="cx-title">JM ESPETINHOS</div>
            <div className="cx-sub">Painel do Caixa · {new Date().toLocaleDateString('pt-BR')}</div>
          </div>
        </div>
        <div className={`cx-status ${connected ? 'on' : ''}`}>
          <span className="cx-dot" /> {connected ? 'AO VIVO' : 'RECONECTANDO...'}
        </div>
      </header>

      {/* KPIs */}
      <section className="kpis">
        <div className={`kpi big ${flashRevenue ? 'flash' : ''}`}>
          <div className="kpi-icon"><DollarSign size={26} /></div>
          <div className="kpi-body">
            <div className="kpi-label">FATURAMENTO HOJE</div>
            <div className="kpi-value huge">{fmtBRL(stats.total_today)}</div>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-icon o"><ShoppingBag size={22} /></div>
          <div className="kpi-body">
            <div className="kpi-label">PEDIDOS HOJE</div>
            <div className="kpi-value">{stats.orders_today}</div>
            {stats.orders_canceled > 0 && <div className="kpi-hint">{stats.orders_canceled} cancelado(s)</div>}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-icon b"><TrendingUp size={22} /></div>
          <div className="kpi-body">
            <div className="kpi-label">TICKET MÉDIO</div>
            <div className="kpi-value">{fmtBRL(stats.ticket_avg)}</div>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-icon g"><Activity size={22} /></div>
          <div className="kpi-body">
            <div className="kpi-label">ATIVOS AGORA</div>
            <div className="kpi-value">{stats.active_count}</div>
            <div className="kpi-hint">na cozinha</div>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-icon p"><Users size={22} /></div>
          <div className="kpi-body">
            <div className="kpi-label">CLIENTES CADASTRADOS</div>
            <div className="kpi-value">{stats.customers_total}</div>
          </div>
        </div>
      </section>

      <div className="grid">
        {/* Top itens */}
        <section className="card">
          <div className="card-title"><Trophy size={18} color="#fbbf24" /> TOP VENDAS DE HOJE</div>
          {stats.top_items.length === 0 ? (
            <div className="empty">Nenhuma venda registrada hoje ainda.</div>
          ) : (
            <div className="top-list">
              {stats.top_items.map((it, i) => (
                <div key={it.name} className="top-row">
                  <div className="top-rank">#{i + 1}</div>
                  <div className="top-info">
                    <div className="top-name">{it.name}</div>
                    <div className="top-bar">
                      <div className="top-fill" style={{ width: `${(it.qty / maxTopQty) * 100}%` }} />
                    </div>
                  </div>
                  <div className="top-nums">
                    <div className="top-qty">{it.qty}×</div>
                    <div className="top-rev">{fmtBRL(it.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Faturamento por hora */}
        <section className="card">
          <div className="card-title"><Clock size={18} color="#f97316" /> FATURAMENTO POR HORA</div>
          {stats.hours_series.length === 0 ? (
            <div className="empty">Sem dados de horário ainda.</div>
          ) : (
            <div className="hours">
              {stats.hours_series.map(h => (
                <div key={h.hour} className="hour-col" title={`${fmtBRL(h.revenue)} · ${h.count} pedidos`}>
                  <div className="hour-bar-wrap">
                    <div className="hour-bar" style={{ height: `${(h.revenue / maxHourRevenue) * 100}%` }}>
                      <div className="hour-val">{fmtBRL(h.revenue).replace('R$', '')}</div>
                    </div>
                  </div>
                  <div className="hour-label">{String(h.hour).padStart(2, '0')}h</div>
                  <div className="hour-count">{h.count}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pedidos recentes */}
        <section className="card wide">
          <div className="card-title"><ShoppingBag size={18} color="#22c55e" /> ÚLTIMOS PEDIDOS</div>
          {stats.recent.length === 0 ? (
            <div className="empty">Nenhum pedido hoje ainda. Chama a galera! 🔥</div>
          ) : (
            <div className="recent">
              {stats.recent.map(o => {
                const s = statusLabel[o.status] || { l: o.status, c: '#94a3b8' }
                return (
                  <div key={o.id} className="rec-row">
                    <div className="rec-senha">#{o.id.toUpperCase()}</div>
                    <div className="rec-cust">{o.customer}</div>
                    <div className="rec-items">{o.items_count} {o.items_count === 1 ? 'item' : 'itens'}</div>
                    <div className="rec-time">{fmtTime(o.created_at)}</div>
                    <div className="rec-status" style={{ color: s.c, borderColor: `${s.c}55` }}>● {s.l}</div>
                    <div className="rec-total">{fmtBRL(o.total)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <style>{`
        html, body, #root { margin: 0; padding: 0; height: 100vh; overflow: hidden; }
        .caixa {
          height: 100vh;
          background: linear-gradient(180deg, #1a0f08 0%, #0a0604 100%);
          color: #fef3c7;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .cx-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 30px;
          background: linear-gradient(180deg, rgba(120,53,15,0.5) 0%, rgba(0,0,0,0.6) 100%);
          border-bottom: 2px solid rgba(249,115,22,0.4);
        }
        .cx-brand { display: flex; align-items: center; gap: 14px; }
        .cx-title { font-size: 22px; font-weight: 900; letter-spacing: 4px; color: #f97316; text-shadow: 0 0 15px rgba(249,115,22,0.5); }
        .cx-sub { font-size: 11px; letter-spacing: 3px; color: #fbbf24; }
        .cx-status {
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; letter-spacing: 3px; font-weight: 800;
          padding: 6px 14px; border-radius: 999px;
          background: rgba(0,0,0,0.5); color: #64748b;
        }
        .cx-status.on { color: #22c55e; }
        .cx-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: pulse 1.5s infinite; }
        @keyframes pulse { 50% { opacity: 0.4; } }

        .kpis {
          display: grid;
          grid-template-columns: 1.6fr 1fr 1fr 1fr 1fr;
          gap: 14px;
          padding: 16px 20px 8px;
        }
        .kpi {
          display: flex; align-items: center; gap: 12px;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(148,163,184,0.15);
          border-radius: 16px;
          padding: 14px 16px;
        }
        .kpi.big {
          background: linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(249,115,22,0.15) 100%);
          border-color: rgba(34,197,94,0.35);
        }
        .kpi.big.flash {
          animation: revFlash 1.2s ease-out;
        }
        @keyframes revFlash {
          0% { background: linear-gradient(135deg, rgba(34,197,94,0.6), rgba(249,115,22,0.5)); transform: scale(1.02); }
          100% { background: linear-gradient(135deg, rgba(34,197,94,0.15), rgba(249,115,22,0.15)); transform: scale(1); }
        }
        .kpi-icon {
          width: 42px; height: 42px; border-radius: 12px;
          background: rgba(34,197,94,0.2); color: #22c55e;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .kpi-icon.o { background: rgba(249,115,22,0.2); color: #f97316; }
        .kpi-icon.b { background: rgba(59,130,246,0.2); color: #3b82f6; }
        .kpi-icon.g { background: rgba(34,197,94,0.2); color: #22c55e; }
        .kpi-icon.p { background: rgba(168,85,247,0.2); color: #a855f7; }
        .kpi-body { display: flex; flex-direction: column; min-width: 0; }
        .kpi-label { font-size: 9px; letter-spacing: 3px; color: #94a3b8; font-weight: 700; }
        .kpi-value { font-size: 26px; font-weight: 900; color: #fef3c7; line-height: 1.1; margin-top: 2px; }
        .kpi-value.huge { font-size: 40px; color: #22c55e; }
        .kpi-hint { font-size: 11px; color: #64748b; margin-top: 2px; }

        .grid {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1.3fr;
          grid-template-rows: 1fr auto;
          gap: 14px;
          padding: 8px 20px 20px;
          overflow: hidden;
        }
        .card {
          background: rgba(0,0,0,0.45);
          border: 1px solid rgba(148,163,184,0.15);
          border-radius: 16px;
          padding: 16px 18px;
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .card.wide { grid-column: 1 / -1; }
        .card-title {
          font-size: 12px; letter-spacing: 3px; font-weight: 900;
          color: #fef3c7; margin-bottom: 14px;
          display: flex; align-items: center; gap: 8px;
        }
        .empty { color: #64748b; text-align: center; padding: 30px 10px; font-size: 13px; }

        .top-list { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
        .top-row {
          display: grid; grid-template-columns: 40px 1fr auto;
          gap: 12px; align-items: center;
          padding: 8px 10px; background: rgba(0,0,0,0.3); border-radius: 10px;
        }
        .top-rank { font-size: 15px; font-weight: 900; color: #fbbf24; }
        .top-info { min-width: 0; }
        .top-name { font-size: 13px; font-weight: 700; color: #fef3c7; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .top-bar { height: 6px; background: rgba(15,23,42,0.7); border-radius: 3px; overflow: hidden; }
        .top-fill { height: 100%; background: linear-gradient(90deg, #f97316, #22c55e); transition: width 400ms; }
        .top-nums { text-align: right; }
        .top-qty { font-size: 15px; font-weight: 900; color: #f97316; }
        .top-rev { font-size: 11px; color: #22c55e; font-weight: 700; }

        .hours {
          flex: 1;
          display: flex; align-items: flex-end;
          gap: 6px; padding-top: 20px; min-height: 160px;
        }
        .hour-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .hour-bar-wrap { width: 100%; height: 120px; display: flex; align-items: flex-end; }
        .hour-bar {
          width: 100%; min-height: 4px;
          background: linear-gradient(180deg, #22c55e, #f97316);
          border-radius: 6px 6px 0 0;
          position: relative;
          transition: height 500ms;
        }
        .hour-val {
          position: absolute; top: -18px; left: 50%; transform: translateX(-50%);
          font-size: 10px; color: #22c55e; font-weight: 800; white-space: nowrap;
        }
        .hour-label { font-size: 11px; color: #fbbf24; font-weight: 700; }
        .hour-count { font-size: 10px; color: #64748b; }

        .recent { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; max-height: 260px; }
        .rec-row {
          display: grid;
          grid-template-columns: 100px 1.2fr 80px 90px 130px 100px;
          gap: 14px; align-items: center;
          padding: 10px 14px;
          background: rgba(0,0,0,0.35);
          border: 1px solid rgba(148,163,184,0.1);
          border-radius: 10px;
        }
        .rec-senha { font-family: 'Courier New', monospace; font-size: 15px; font-weight: 900; color: #f97316; }
        .rec-cust { color: #fbbf24; font-weight: 700; font-size: 13px; }
        .rec-items { color: #94a3b8; font-size: 12px; }
        .rec-time { color: #64748b; font-size: 12px; font-family: 'Courier New', monospace; }
        .rec-status {
          font-size: 11px; font-weight: 800; letter-spacing: 1.5px;
          padding: 4px 8px; border-radius: 999px;
          border: 1px solid;
        }
        .rec-total { text-align: right; font-size: 16px; font-weight: 900; color: #22c55e; }
      `}</style>
    </div>
  )
}
