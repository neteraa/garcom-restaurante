import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Flame, Package, AlertTriangle, CheckCircle2, TrendingUp,
  BarChart2, RefreshCw, Plus, Minus, Save, X, Search,
  ShoppingBag, DollarSign, Layers, Clock,
} from 'lucide-react'

const API = ''
const WS  = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/kitchen'

const fmtBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'

const STATUS_CFG = {
  ok:      { color: '#22c55e', bg: 'rgba(34,197,94,0.15)',  label: 'OK',       icon: '🟢' },
  warning: { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', label: 'Atenção',  icon: '🟡' },
  low:     { color: '#f97316', bg: 'rgba(249,115,22,0.2)',  label: 'Baixo',    icon: '🟠' },
  out:     { color: '#ef4444', bg: 'rgba(239,68,68,0.2)',   label: 'Acabou!',  icon: '🔴' },
}

export default function Estoque() {
  const [items, setItems]             = useState([])
  const [report, setReport]           = useState(null)
  const [alerts, setAlerts]           = useState([])
  const [connected, setConnected]     = useState(false)
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [catFilter, setCatFilter]     = useState('Todos')
  const [showAbrirDia, setShowAbrirDia] = useState(false)
  const [abrirDiaQtys, setAbrirDiaQtys] = useState({})   // item_id → qty input
  const [inlineEdit, setInlineEdit]   = useState({})     // item_id → qty input
  const [saving, setSaving]           = useState(false)
  const [lastUpdate, setLastUpdate]   = useState(null)
  const wsRef = useRef(null)
  const tickRef = useRef(0)
  const [, tick] = useState(0)

  // ── Fetch inventory + report ──
  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [inv, rep] = await Promise.all([
        fetch(`${API}/api/inventory`).then(r => r.json()),
        fetch(`${API}/api/inventory/report`).then(r => r.json()),
      ])
      setItems(inv.items || [])
      setReport(rep)
      setLastUpdate(new Date())
    } catch (e) {
      console.error('refresh error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Auto-refresh a cada 10s
  useEffect(() => {
    const iv = setInterval(() => refresh(true), 10_000)
    return () => clearInterval(iv)
  }, [refresh])

  // Atualiza alertas derivados dos itens
  useEffect(() => {
    setAlerts(items.filter(i => i.status === 'low' || i.status === 'out'))
  }, [items])

  // ── Kitchen WebSocket — recebe inventory_alert em tempo real ──
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => { setConnected(false); setTimeout(connect, 2000) }
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          if (d.type === 'inventory_alert' || d.type === 'new' || d.type === 'status') {
            refresh(true)  // pedido confirmado ou alerta → atualiza
          }
        } catch {}
      }
    }
    connect()
    return () => wsRef.current?.close()
  }, [refresh])

  // ── Restock inline (campo de quantidade ao lado do item) ──
  const saveInline = async (item_id) => {
    const qty = parseInt(inlineEdit[item_id] || '0', 10)
    if (!qty || qty <= 0) { setInlineEdit(p => ({ ...p, [item_id]: '' })); return }
    setSaving(true)
    try {
      await fetch(`${API}/api/inventory/restock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id, qty }),
      })
      setInlineEdit(p => ({ ...p, [item_id]: '' }))
      await refresh(true)
    } finally { setSaving(false) }
  }

  // ── Ajuste rápido ±1 ──
  const quickAdjust = async (item_id, delta) => {
    const cur = items.find(i => i.item_id === item_id)
    if (!cur) return
    const newStock = Math.max(0, cur.stock + delta)
    setSaving(true)
    try {
      await fetch(`${API}/api/inventory/adjust`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id, stock: newStock }),
      })
      await refresh(true)
    } finally { setSaving(false) }
  }

  // ── Abrir o Dia: reposição em lote ──
  const submitAbrirDia = async () => {
    const entries = Object.entries(abrirDiaQtys)
      .map(([item_id, qty]) => ({ item_id, qty: parseInt(qty, 10) }))
      .filter(e => e.qty > 0)
    if (!entries.length) return
    setSaving(true)
    try {
      await fetch(`${API}/api/inventory/restock-batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: entries }),
      })
      setAbrirDiaQtys({})
      setShowAbrirDia(false)
      await refresh(true)
    } finally { setSaving(false) }
  }

  // ── Reset contadores do dia ──
  const resetDay = async () => {
    if (!confirm('Zerar as vendas do dia? Isso não altera o estoque, só os contadores "vendido hoje".')) return
    await fetch(`${API}/api/inventory/reset-day`, { method: 'POST' })
    await refresh(true)
  }

  // Categorias únicas
  const categories = ['Todos', ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))]

  // Filtragem
  const visible = items.filter(i => {
    const matchCat = catFilter === 'Todos' || i.category === catFilter
    const matchQ   = !search || i.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchQ
  })

  // ── KPIs rápidos ──
  const totalTracked = items.filter(i => i.stock > 0 || i.sold_today > 0).length
  const totalAlerts  = alerts.length
  const outCount     = alerts.filter(a => a.status === 'out').length

  return (
    <div className="est">
      {/* ═══ HEADER ═══ */}
      <header className="est-header">
        <div className="est-brand">
          <Flame size={28} color="#f97316" />
          <div>
            <div className="est-title">JM ESPETINHOS</div>
            <div className="est-sub">Controle de Estoque</div>
          </div>
        </div>

        <div className="est-kpis">
          <div className="ekpi">
            <Layers size={18} color="#f97316" />
            <div>
              <div className="ekpi-val">{totalTracked}</div>
              <div className="ekpi-label">Itens ativos</div>
            </div>
          </div>
          <div className={`ekpi ${totalAlerts > 0 ? 'ekpi-warn' : ''}`}>
            <AlertTriangle size={18} color={totalAlerts > 0 ? '#f97316' : '#64748b'} />
            <div>
              <div className="ekpi-val" style={{ color: totalAlerts > 0 ? '#f97316' : '#fef3c7' }}>{totalAlerts}</div>
              <div className="ekpi-label">{outCount > 0 ? `${outCount} zerado(s)!` : 'Alertas'}</div>
            </div>
          </div>
          {report && (
            <>
              <div className="ekpi">
                <ShoppingBag size={18} color="#22c55e" />
                <div>
                  <div className="ekpi-val" style={{ color: '#22c55e' }}>{report.total_items}</div>
                  <div className="ekpi-label">Unid. vendidas</div>
                </div>
              </div>
              <div className="ekpi">
                <DollarSign size={18} color="#22c55e" />
                <div>
                  <div className="ekpi-val" style={{ color: '#22c55e', fontSize: 20 }}>{fmtBRL(report.total_revenue)}</div>
                  <div className="ekpi-label">Faturado hoje</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="est-actions">
          <div className={`est-status ${connected ? 'on' : ''}`}>
            <span className="est-dot" />
            {connected ? 'AO VIVO' : 'RECONECT...'}
          </div>
          <button className="btn-outline" onClick={() => refresh()} title="Atualizar">
            <RefreshCw size={15} />
          </button>
          <button className="btn-outline dim" onClick={resetDay} title="Zerar contadores do dia">
            <Clock size={15} /> Zerar dia
          </button>
          <button className="btn-primary" onClick={() => setShowAbrirDia(true)}>
            <Package size={15} /> Abrir o Dia
          </button>
        </div>
      </header>

      {/* ═══ ALERTAS ═══ */}
      {alerts.length > 0 && (
        <div className="alerts-banner">
          <AlertTriangle size={16} color="#f97316" />
          <span className="ab-title">ATENÇÃO:</span>
          {alerts.map(a => (
            <span key={a.item_id} className={`ab-chip ${a.status}`}>
              {STATUS_CFG[a.status]?.icon} {a.name}
              {a.stock > 0 ? ` (${a.stock} un.)` : ' — ZERADO'}
            </span>
          ))}
        </div>
      )}

      {/* ═══ FILTROS ═══ */}
      <div className="est-toolbar">
        <div className="search-wrap">
          <Search size={14} color="#64748b" />
          <input
            className="search-input"
            placeholder="Buscar item..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="search-clear" onClick={() => setSearch('')}><X size={12}/></button>}
        </div>
        <div className="cat-tabs">
          {categories.map(c => (
            <button key={c} className={`cat-tab ${catFilter === c ? 'active' : ''}`} onClick={() => setCatFilter(c)}>
              {c}
            </button>
          ))}
        </div>
        {lastUpdate && (
          <div className="last-update">
            atualizado às {fmtTime(lastUpdate.toISOString())}
          </div>
        )}
      </div>

      {/* ═══ GRID DE ITENS ═══ */}
      <div className="est-grid">
        {loading && items.length === 0 ? (
          <div className="est-loading">Carregando estoque...</div>
        ) : visible.length === 0 ? (
          <div className="est-empty">Nenhum item encontrado</div>
        ) : visible.map(item => {
          const cfg  = STATUS_CFG[item.status] || STATUS_CFG.ok
          const pct  = item.stock === 0 ? 0 : Math.min(100, (item.stock / Math.max(item.stock, item.low_threshold * 3)) * 100)
          const isEditingInline = inlineEdit[item.item_id] !== undefined

          return (
            <div key={item.item_id} className="est-card" style={{ borderColor: item.status !== 'ok' ? cfg.color + '66' : undefined, background: item.status !== 'ok' ? cfg.bg : undefined }}>
              {/* Foto / emoji */}
              <div className="ec-img">
                {item.photo
                  ? <img src={item.photo} alt={item.name} onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='block' }} />
                  : null}
                <span style={{ display: item.photo ? 'none' : 'block', fontSize: 30 }}>{item.image || '📦'}</span>
              </div>

              {/* Info */}
              <div className="ec-body">
                <div className="ec-name" title={item.name}>{item.name}</div>
                <div className="ec-cat">{item.category}</div>

                {/* Barra de estoque */}
                <div className="ec-bar-wrap">
                  <div className="ec-bar" style={{ width: `${pct}%`, background: cfg.color }} />
                </div>

                <div className="ec-nums">
                  <div className="ec-stock" style={{ color: cfg.color }}>
                    {item.stock > 0 ? item.stock : '—'} un.
                    <span className="ec-status-badge" style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>
                  <div className="ec-sold">
                    {item.sold_today > 0 ? (
                      <><TrendingUp size={11} /> {item.sold_today} vendido{item.sold_today > 1 ? 's' : ''} hoje</>
                    ) : (
                      <span style={{ color: '#475569' }}>sem vendas hoje</span>
                    )}
                  </div>
                </div>

                {/* Controles rápidos */}
                <div className="ec-controls">
                  <button className="ec-btn minus" onClick={() => quickAdjust(item.item_id, -1)} disabled={saving || item.stock === 0}>
                    <Minus size={12} />
                  </button>
                  {isEditingInline ? (
                    <>
                      <input
                        autoFocus
                        className="ec-qty-input"
                        type="number"
                        min="1"
                        placeholder="qtd"
                        value={inlineEdit[item.item_id]}
                        onChange={e => setInlineEdit(p => ({ ...p, [item.item_id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveInline(item.item_id); if (e.key === 'Escape') setInlineEdit(p => ({ ...p, [item.item_id]: undefined })) }}
                      />
                      <button className="ec-btn save" onClick={() => saveInline(item.item_id)} disabled={saving}>
                        <Save size={12} />
                      </button>
                      <button className="ec-btn cancel" onClick={() => setInlineEdit(p => ({ ...p, [item.item_id]: undefined }))}>
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="ec-btn restock"
                      onClick={() => setInlineEdit(p => ({ ...p, [item.item_id]: '' }))}
                      title="Repor estoque"
                    >
                      <Plus size={12} /> Repor
                    </button>
                  )}
                  <button className="ec-btn plus" onClick={() => quickAdjust(item.item_id, 1)} disabled={saving}>
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ═══ RELATÓRIO DO DIA ═══ */}
      {report && report.items.length > 0 && (
        <section className="est-report">
          <div className="rep-title"><BarChart2 size={16} color="#f97316" /> RANKING DE VENDAS HOJE</div>
          <div className="rep-list">
            {report.items.slice(0, 12).map((it, i) => (
              <div key={it.item_id} className="rep-row">
                <div className="rep-rank">#{i + 1}</div>
                <div className="rep-info">
                  <div className="rep-name">{it.name}</div>
                  <div className="rep-bar-wrap">
                    <div className="rep-bar" style={{ width: `${(it.qty / report.items[0].qty) * 100}%` }} />
                  </div>
                </div>
                <div className="rep-qty">{it.qty}×</div>
                <div className="rep-rev">{fmtBRL(it.revenue)}</div>
                <div className={`rep-stock ${it.stock_remaining === 0 ? 'out' : it.stock_remaining <= it.low_threshold ? 'low' : ''}`}>
                  {it.stock_remaining > 0 ? `${it.stock_remaining} rest.` : '⚠️ zerado'}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ MODAL: ABRIR O DIA ═══ */}
      {showAbrirDia && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAbrirDia(false) }}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">☀️ Abrir o Dia</div>
                <div className="modal-sub">Informe quantos de cada item você fez/recebeu hoje. Os valores serão ADICIONADOS ao estoque atual.</div>
              </div>
              <button className="modal-close" onClick={() => setShowAbrirDia(false)}><X size={20}/></button>
            </div>

            <div className="modal-body">
              {categories.filter(c => c !== 'Todos').map(cat => {
                const catItems = items.filter(i => i.category === cat)
                if (!catItems.length) return null
                return (
                  <div key={cat} className="ad-group">
                    <div className="ad-cat">{cat}</div>
                    <div className="ad-items">
                      {catItems.map(it => (
                        <div key={it.item_id} className="ad-row">
                          <span className="ad-emoji">{it.image || '📦'}</span>
                          <span className="ad-name">{it.name}</span>
                          <span className="ad-current" style={{ color: STATUS_CFG[it.status]?.color || '#64748b' }}>
                            {it.stock} un.
                          </span>
                          <input
                            className="ad-input"
                            type="number"
                            min="0"
                            placeholder="+ qty"
                            value={abrirDiaQtys[it.item_id] || ''}
                            onChange={e => setAbrirDiaQtys(p => ({ ...p, [it.item_id]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowAbrirDia(false)}>Cancelar</button>
              <button className="btn-primary" onClick={submitAbrirDia} disabled={saving}>
                {saving ? 'Salvando...' : <><Save size={14}/> Confirmar Reposição</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        html, body, #root { margin:0; padding:0; height:100vh; background:#0a0604; color:#fef3c7; font-family:'Inter',system-ui,sans-serif; }
        .est { height:100vh; display:flex; flex-direction:column; overflow:hidden; background:linear-gradient(180deg,#1a0f08,#0a0604); }

        /* HEADER */
        .est-header {
          display:flex; align-items:center; gap:20px;
          padding:12px 24px;
          background:linear-gradient(180deg,rgba(120,53,15,0.45),rgba(0,0,0,0.5));
          border-bottom:2px solid rgba(249,115,22,0.4);
          flex-wrap:wrap;
        }
        .est-brand { display:flex; align-items:center; gap:12px; flex-shrink:0; }
        .est-title { font-size:20px; font-weight:900; letter-spacing:4px; color:#f97316; }
        .est-sub   { font-size:10px; letter-spacing:3px; color:#fbbf24; }

        .est-kpis { display:flex; gap:12px; flex:1; flex-wrap:wrap; }
        .ekpi {
          display:flex; align-items:center; gap:10px;
          background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.15);
          border-radius:12px; padding:8px 14px;
        }
        .ekpi-warn { border-color:rgba(249,115,22,0.5); background:rgba(249,115,22,0.1); }
        .ekpi-val   { font-size:24px; font-weight:900; color:#fef3c7; line-height:1; }
        .ekpi-label { font-size:9px; letter-spacing:2px; color:#94a3b8; margin-top:2px; }

        .est-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
        .est-status {
          display:flex; align-items:center; gap:6px;
          font-size:10px; letter-spacing:2px; font-weight:800;
          padding:5px 12px; border-radius:999px;
          background:rgba(0,0,0,0.5); color:#475569;
        }
        .est-status.on { color:#22c55e; }
        .est-dot { width:7px; height:7px; border-radius:50%; background:currentColor; animation:esDot 1.5s infinite; }
        @keyframes esDot { 50% { opacity:0.4; } }

        .btn-outline {
          display:flex; align-items:center; gap:5px;
          background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.25);
          color:#94a3b8; padding:7px 12px; border-radius:8px;
          font-size:12px; cursor:pointer; white-space:nowrap;
        }
        .btn-outline:hover { border-color:#f97316; color:#f97316; }
        .btn-outline.dim { font-size:11px; }
        .btn-primary {
          display:flex; align-items:center; gap:6px;
          background:linear-gradient(135deg,#f97316,#dc2626);
          color:#fff; border:none; padding:8px 16px; border-radius:8px;
          font-size:12px; font-weight:800; letter-spacing:1px; cursor:pointer;
        }
        .btn-primary:hover { filter:brightness(1.1); }
        .btn-primary:disabled { opacity:0.5; cursor:not-allowed; }

        /* ALERTAS */
        .alerts-banner {
          display:flex; align-items:center; gap:8px; flex-wrap:wrap;
          background:rgba(249,115,22,0.12); border-bottom:2px solid rgba(249,115,22,0.35);
          padding:8px 24px; font-size:12px;
        }
        .ab-title { font-weight:900; letter-spacing:2px; color:#f97316; }
        .ab-chip {
          padding:3px 10px; border-radius:999px; font-weight:700; font-size:11px;
          background:rgba(249,115,22,0.2); color:#fbbf24; border:1px solid rgba(249,115,22,0.4);
        }
        .ab-chip.out { background:rgba(239,68,68,0.2); color:#fca5a5; border-color:rgba(239,68,68,0.5); }

        /* TOOLBAR */
        .est-toolbar {
          display:flex; align-items:center; gap:12px; flex-wrap:wrap;
          padding:10px 24px;
          border-bottom:1px solid rgba(148,163,184,0.1);
        }
        .search-wrap {
          display:flex; align-items:center; gap:8px;
          background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.2);
          border-radius:8px; padding:6px 12px; min-width:200px;
        }
        .search-input {
          background:none; border:none; outline:none; color:#fef3c7;
          font-size:13px; width:100%;
        }
        .search-input::placeholder { color:#475569; }
        .search-clear { background:none; border:none; color:#64748b; cursor:pointer; padding:0; }

        .cat-tabs { display:flex; gap:4px; flex-wrap:wrap; }
        .cat-tab {
          background:rgba(0,0,0,0.35); border:1px solid rgba(148,163,184,0.15);
          color:#64748b; padding:5px 12px; border-radius:6px;
          font-size:11px; letter-spacing:1px; cursor:pointer; white-space:nowrap;
        }
        .cat-tab.active { background:rgba(249,115,22,0.2); border-color:#f97316; color:#f97316; font-weight:800; }
        .cat-tab:hover:not(.active) { border-color:#94a3b8; color:#94a3b8; }
        .last-update { font-size:10px; color:#475569; letter-spacing:1px; margin-left:auto; }

        /* GRID */
        .est-grid {
          flex:1; overflow-y:auto; padding:14px 24px;
          display:grid;
          grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));
          gap:12px;
          align-content:start;
        }
        .est-loading, .est-empty {
          grid-column:1/-1; text-align:center; color:#64748b; padding:60px 20px;
          font-size:14px; letter-spacing:2px;
        }

        /* CARD */
        .est-card {
          display:flex; gap:12px;
          background:rgba(15,15,20,0.6);
          border:1px solid rgba(148,163,184,0.12);
          border-radius:14px; padding:12px 14px;
          transition:border-color 0.3s, background 0.3s;
        }
        .est-card:hover { border-color:rgba(249,115,22,0.3); }

        .ec-img {
          width:52px; height:52px; border-radius:10px; overflow:hidden;
          background:rgba(0,0,0,0.4); flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
          font-size:28px;
        }
        .ec-img img { width:100%; height:100%; object-fit:cover; }

        .ec-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
        .ec-name { font-size:13px; font-weight:700; color:#fef3c7; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ec-cat  { font-size:10px; letter-spacing:2px; color:#64748b; }

        .ec-bar-wrap { height:4px; background:rgba(15,23,42,0.8); border-radius:2px; overflow:hidden; margin:2px 0; }
        .ec-bar      { height:100%; border-radius:2px; transition:width 0.4s; }

        .ec-nums { display:flex; justify-content:space-between; align-items:center; gap:6px; }
        .ec-stock {
          display:flex; align-items:center; gap:6px;
          font-size:18px; font-weight:900;
        }
        .ec-status-badge {
          font-size:10px; font-weight:800; letter-spacing:1px;
          padding:2px 7px; border-radius:999px;
        }
        .ec-sold { font-size:11px; color:#64748b; display:flex; align-items:center; gap:3px; }

        /* CONTROLES */
        .ec-controls { display:flex; align-items:center; gap:4px; margin-top:4px; }
        .ec-btn {
          display:flex; align-items:center; justify-content:center; gap:4px;
          background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.2);
          color:#94a3b8; width:26px; height:26px; border-radius:6px;
          cursor:pointer; font-size:11px; transition:all 0.15s;
        }
        .ec-btn:hover { border-color:#f97316; color:#f97316; }
        .ec-btn:disabled { opacity:0.3; cursor:not-allowed; }
        .ec-btn.restock {
          flex:1; width:auto; gap:4px; padding:0 10px;
          background:rgba(249,115,22,0.15); border-color:rgba(249,115,22,0.4); color:#f97316;
          font-size:11px; font-weight:700;
        }
        .ec-btn.restock:hover { background:rgba(249,115,22,0.3); }
        .ec-btn.save   { background:rgba(34,197,94,0.2); border-color:rgba(34,197,94,0.5); color:#22c55e; }
        .ec-btn.cancel { background:rgba(239,68,68,0.15); border-color:rgba(239,68,68,0.4); color:#ef4444; }
        .ec-qty-input {
          flex:1; background:rgba(0,0,0,0.5); border:1px solid rgba(249,115,22,0.5);
          border-radius:6px; color:#fef3c7; padding:4px 8px; font-size:12px;
          outline:none; width:60px; min-width:0;
        }

        /* RELATÓRIO */
        .est-report {
          border-top:2px solid rgba(249,115,22,0.25);
          padding:14px 24px 20px;
          background:rgba(0,0,0,0.3);
          overflow-y:auto; max-height:240px;
        }
        .rep-title {
          font-size:11px; letter-spacing:3px; font-weight:900;
          color:#fef3c7; margin-bottom:10px;
          display:flex; align-items:center; gap:8px;
        }
        .rep-list { display:flex; flex-direction:column; gap:5px; }
        .rep-row {
          display:grid; grid-template-columns:32px 1fr 48px 90px 80px;
          gap:10px; align-items:center;
          padding:6px 10px; background:rgba(0,0,0,0.3); border-radius:8px;
        }
        .rep-rank  { font-size:13px; font-weight:900; color:#fbbf24; }
        .rep-info  { min-width:0; }
        .rep-name  { font-size:12px; font-weight:700; color:#fef3c7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .rep-bar-wrap { height:3px; background:rgba(15,23,42,0.8); border-radius:2px; margin-top:3px; }
        .rep-bar      { height:100%; background:linear-gradient(90deg,#f97316,#22c55e); border-radius:2px; transition:width 0.4s; }
        .rep-qty  { font-size:14px; font-weight:900; color:#f97316; text-align:right; }
        .rep-rev  { font-size:12px; font-weight:700; color:#22c55e; text-align:right; }
        .rep-stock { font-size:11px; color:#64748b; text-align:right; }
        .rep-stock.low { color:#f97316; font-weight:700; }
        .rep-stock.out { color:#ef4444; font-weight:700; }

        /* MODAL */
        .modal-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(6px);
          display:flex; align-items:center; justify-content:center; z-index:300; padding:20px;
        }
        .modal {
          background:linear-gradient(180deg,#1a0f08,#0a0604);
          border:2px solid #f97316; border-radius:20px;
          width:100%; max-width:680px; max-height:90vh;
          display:flex; flex-direction:column; overflow:hidden;
          box-shadow:0 25px 60px rgba(249,115,22,0.35);
          animation:modalIn 0.25s ease;
        }
        @keyframes modalIn { from { transform:scale(0.95); opacity:0; } to { transform:scale(1); opacity:1; } }
        .modal-header {
          display:flex; justify-content:space-between; align-items:flex-start;
          padding:18px 22px; border-bottom:1px solid rgba(249,115,22,0.25);
        }
        .modal-title { font-size:22px; font-weight:900; color:#f97316; letter-spacing:2px; }
        .modal-sub   { font-size:12px; color:#94a3b8; margin-top:4px; line-height:1.4; }
        .modal-close {
          background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.2);
          color:#94a3b8; width:34px; height:34px; border-radius:8px; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
        }
        .modal-close:hover { color:#f97316; border-color:#f97316; }
        .modal-body   { flex:1; overflow-y:auto; padding:16px 22px; display:flex; flex-direction:column; gap:16px; }
        .modal-footer {
          display:flex; justify-content:flex-end; gap:10px;
          padding:14px 22px; border-top:1px solid rgba(148,163,184,0.1);
        }

        /* MODAL — ABRIR DIA */
        .ad-group { display:flex; flex-direction:column; gap:8px; }
        .ad-cat {
          font-size:11px; letter-spacing:3px; font-weight:900; color:#f97316;
          padding-bottom:6px; border-bottom:1px solid rgba(249,115,22,0.2);
          text-transform:uppercase;
        }
        .ad-items { display:flex; flex-direction:column; gap:6px; }
        .ad-row {
          display:grid; grid-template-columns:28px 1fr 60px 80px;
          gap:10px; align-items:center;
          padding:8px 10px; background:rgba(0,0,0,0.3); border-radius:8px;
        }
        .ad-emoji { font-size:22px; }
        .ad-name  { font-size:13px; color:#fef3c7; font-weight:600; }
        .ad-current { font-size:12px; font-weight:700; text-align:right; }
        .ad-input {
          background:rgba(0,0,0,0.5); border:1px solid rgba(249,115,22,0.4);
          border-radius:6px; color:#fef3c7; padding:5px 8px; font-size:13px;
          outline:none; width:100%; text-align:center;
        }
        .ad-input:focus { border-color:#f97316; }
        .ad-input::placeholder { color:#475569; }
      `}</style>
    </div>
  )
}
