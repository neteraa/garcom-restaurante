import React, { useEffect, useRef, useState, useCallback } from 'react'
import QRCode from 'qrcode.react'
import {
  Flame, Users, Clock, DollarSign, Plus, Minus, X, Check,
  QrCode, ChevronRight, Search, Package, AlertTriangle,
  CreditCard, Banknote, Smartphone, BookOpen, RefreshCw,
} from 'lucide-react'

const API = ''
const WS  = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/kitchen'

const fmtBRL  = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
const elapsed = (iso) => {
  if (!iso) return ''
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  return mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h${mins % 60 > 0 ? String(mins % 60).padStart(2, '0') : ''}min`
}

const PAY_METHODS = [
  { id: 'pix',      label: 'PIX',      icon: <Smartphone size={15}/> },
  { id: 'cartao',   label: 'Cartão',   icon: <CreditCard size={15}/> },
  { id: 'dinheiro', label: 'Dinheiro', icon: <Banknote size={15}/> },
  { id: 'fiado',    label: 'Fiado',    icon: <BookOpen size={15}/> },
]

export default function Mesas() {
  const [tables, setTables]         = useState([])
  const [menu, setMenu]             = useState([])
  const [selected, setSelected]     = useState(null)   // table_id
  const [comanda, setComanda]       = useState(null)   // comanda do selected
  const [connected, setConnected]   = useState(false)
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('Todos')
  const [customerName, setCustomerName] = useState('')
  const [showClose, setShowClose]   = useState(false)
  const [payMethod, setPayMethod]   = useState('pix')
  const [showQR, setShowQR]         = useState(false)
  const [saving, setSaving]         = useState(false)
  const [flashMsg, setFlashMsg]     = useState(null)
  const wsRef = useRef(null)

  const flash = (msg, type = 'ok') => {
    setFlashMsg({ msg, type })
    setTimeout(() => setFlashMsg(null), 2500)
  }

  // ── Fetch ──
  const refreshTables = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await fetch(`${API}/api/tables`)
      setTables((await r.json()).tables || [])
    } finally { setLoading(false) }
  }, [])

  const refreshComanda = useCallback(async (tid) => {
    if (!tid) return
    const r = await fetch(`${API}/api/tables/${tid}`)
    const d = await r.json()
    setComanda(d.comanda || null)
  }, [])

  useEffect(() => {
    fetch(`${API}/api/menu`).then(r => r.json()).then(d => setMenu(d.menu || []))
    refreshTables()
  }, [refreshTables])

  useEffect(() => {
    if (selected) refreshComanda(selected)
  }, [selected, refreshComanda])

  // ── WebSocket — atualiza quando outra tela muda algo ──
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => { setConnected(false); setTimeout(connect, 2000) }
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data)
          if (d.type === 'table_update' || d.type === 'table_close') {
            refreshTables(true)
            if (selected && d.table_id === selected) refreshComanda(selected)
          }
        } catch {}
      }
    }
    connect()
    return () => wsRef.current?.close()
  }, [selected, refreshTables, refreshComanda])

  // ── Abrir mesa ──
  const openTable = async (table_id) => {
    setSaving(true)
    try {
      await fetch(`${API}/api/tables/open`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id, customer_name: customerName }),
      })
      setCustomerName('')
      await refreshTables(true)
      await refreshComanda(table_id)
      flash('Mesa aberta!')
    } finally { setSaving(false) }
  }

  // ── Adicionar item ──
  const addItem = async (item_id, qty = 1) => {
    if (!selected) return
    setSaving(true)
    try {
      const r = await fetch(`${API}/api/tables/${selected}/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id, qty }),
      })
      const d = await r.json()
      if (d.ok) {
        setComanda(d.comanda)
        await refreshTables(true)
        flash('Item adicionado ✓')
      } else flash(d.error || 'Erro', 'err')
    } finally { setSaving(false) }
  }

  // ── Remover item ──
  const removeItem = async (idx) => {
    if (!selected) return
    setSaving(true)
    try {
      await fetch(`${API}/api/tables/${selected}/item/${idx}`, { method: 'DELETE' })
      await refreshComanda(selected)
      await refreshTables(true)
    } finally { setSaving(false) }
  }

  // ── Fechar conta ──
  const closeTable = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const r = await fetch(`${API}/api/tables/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: selected, payment_method: payMethod }),
      })
      const d = await r.json()
      if (d.ok) {
        flash(`Conta fechada! Total: ${fmtBRL(d.total)}`)
        setShowClose(false)
        setSelected(null)
        setComanda(null)
        await refreshTables(true)
      } else flash(d.error || 'Erro ao fechar', 'err')
    } finally { setSaving(false) }
  }

  // ── Derived ──
  const categories = ['Todos', ...Array.from(new Set(menu.map(m => m.category).filter(Boolean)))]
  const visibleMenu = menu.filter(m => {
    const matchCat = catFilter === 'Todos' || m.category === catFilter
    const matchQ   = !search || m.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchQ
  })

  const selTable   = tables.find(t => t.id === selected)
  const isOpen     = selTable?.status === 'open'
  const openTables = tables.filter(t => t.status === 'open')
  const totalAberto = openTables.reduce((s, t) => s + (t.total || 0), 0)

  const mobileUrl = selected
    ? `${location.protocol}//${location.host}/#/mesa/${selected}`
    : ''

  return (
    <div className="ms">
      {/* ── FLASH ── */}
      {flashMsg && (
        <div className={`ms-flash ${flashMsg.type}`}>{flashMsg.msg}</div>
      )}

      {/* ═══ HEADER ═══ */}
      <header className="ms-header">
        <div className="ms-brand">
          <Flame size={26} color="#f97316" />
          <div>
            <div className="ms-title">JM ESPETINHOS</div>
            <div className="ms-sub">Mesas & Comandas</div>
          </div>
        </div>
        <div className="ms-kpis">
          <div className="mk">
            <Users size={16} color="#f97316"/>
            <div>
              <div className="mk-v">{openTables.length}<span>/{tables.length}</span></div>
              <div className="mk-l">Mesas abertas</div>
            </div>
          </div>
          <div className="mk">
            <DollarSign size={16} color="#22c55e"/>
            <div>
              <div className="mk-v" style={{ color:'#22c55e', fontSize:18 }}>{fmtBRL(totalAberto)}</div>
              <div className="mk-l">Em aberto</div>
            </div>
          </div>
        </div>
        <div className="ms-hactions">
          <div className={`ms-ws ${connected ? 'on' : ''}`}>
            <span className="ms-dot"/>
            {connected ? 'AO VIVO' : 'OFFLINE'}
          </div>
          <button className="btn-sm" onClick={() => refreshTables()}><RefreshCw size={14}/></button>
        </div>
      </header>

      <div className="ms-body">
        {/* ═══ GRADE DE MESAS ═══ */}
        <div className="ms-left">
          <div className="ms-section-title">
            <span>MESAS</span>
            <span className="ms-count">{openTables.length} abertas</span>
          </div>
          <div className="ms-grid">
            {tables.map(t => {
              const isSel = t.id === selected
              const isOp  = t.status === 'open'
              return (
                <div
                  key={t.id}
                  className={`ms-card ${isOp ? 'open' : 'free'} ${isSel ? 'sel' : ''}`}
                  onClick={() => setSelected(isSel ? null : t.id)}
                >
                  <div className="mc-top">
                    <div className="mc-name">{t.name}</div>
                    <div className={`mc-badge ${isOp ? 'open' : 'free'}`}>
                      {isOp ? '🔴 Aberta' : '🟢 Livre'}
                    </div>
                  </div>
                  {isOp ? (
                    <>
                      {t.customer_name && <div className="mc-customer">👤 {t.customer_name}</div>}
                      <div className="mc-stats">
                        <span><Clock size={11}/> {elapsed(t.opened_at)}</span>
                        <span><Package size={11}/> {t.items_count} itens</span>
                      </div>
                      <div className="mc-total">{fmtBRL(t.total)}</div>
                    </>
                  ) : (
                    <div className="mc-cap"><Users size={12}/> {t.capacity} lugares</div>
                  )}
                  {isSel && <div className="mc-arrow"><ChevronRight size={16}/></div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* ═══ PAINEL DA COMANDA ═══ */}
        <div className="ms-right">
          {!selected ? (
            <div className="ms-empty-panel">
              <div style={{fontSize:60}}>🍢</div>
              <div>Selecione uma mesa ao lado</div>
              <div style={{fontSize:12,color:'#475569',marginTop:6}}>para ver ou abrir a comanda</div>
            </div>
          ) : (
            <>
              {/* ── Cabeçalho da comanda ── */}
              <div className="cmd-header">
                <div>
                  <div className="cmd-title">{selTable?.name}</div>
                  {isOpen && (
                    <div className="cmd-meta">
                      {selTable?.customer_name && <span>👤 {selTable.customer_name}</span>}
                      <span><Clock size={11}/> aberta às {fmtTime(selTable?.opened_at)} ({elapsed(selTable?.opened_at)})</span>
                    </div>
                  )}
                </div>
                <div className="cmd-actions">
                  {isOpen && (
                    <>
                      <button className="btn-sm outline" onClick={() => setShowQR(true)} title="QR Code pra mesa">
                        <QrCode size={14}/> QR
                      </button>
                      <button className="btn-sm danger" onClick={() => setShowClose(true)}>
                        <Check size={14}/> Fechar conta
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Mesa livre → Abrir ── */}
              {!isOpen && (
                <div className="cmd-open-form">
                  <div className="cof-title">Mesa livre — abrir comanda</div>
                  <input
                    className="cof-input"
                    placeholder="Nome do cliente / grupo (opcional)"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && openTable(selected)}
                  />
                  <button className="btn-primary" onClick={() => openTable(selected)} disabled={saving}>
                    <Plus size={14}/> Abrir Mesa
                  </button>
                </div>
              )}

              {/* ── Itens da comanda ── */}
              {isOpen && (
                <div className="cmd-body">
                  {/* Lista de itens */}
                  <div className="cmd-items">
                    {(!comanda?.items || comanda.items.length === 0) ? (
                      <div className="cmd-no-items">Comanda vazia — adicione itens abaixo</div>
                    ) : comanda.items.map((it, idx) => (
                      <div key={idx} className="ci-row">
                        <span className="ci-emoji">{it.image || '📦'}</span>
                        <div className="ci-info">
                          <div className="ci-name">{it.name}</div>
                          {it.notes && <div className="ci-notes">{it.notes}</div>}
                        </div>
                        <div className="ci-qty">{it.qty}×</div>
                        <div className="ci-price">{fmtBRL(it.price * it.qty)}</div>
                        <button className="ci-rm" onClick={() => removeItem(idx)}><X size={12}/></button>
                      </div>
                    ))}
                    {comanda?.items?.length > 0 && (
                      <div className="ci-total">
                        <span>TOTAL</span>
                        <span>{fmtBRL(comanda?.total)}</span>
                      </div>
                    )}
                  </div>

                  {/* Adicionar item */}
                  <div className="cmd-add">
                    <div className="cmd-add-title">+ Adicionar item</div>
                    <div className="add-search-wrap">
                      <Search size={13} color="#64748b"/>
                      <input
                        className="add-search"
                        placeholder="Buscar no cardápio..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                      />
                      {search && <button className="add-clear" onClick={() => setSearch('')}><X size={11}/></button>}
                    </div>
                    <div className="add-cat-tabs">
                      {categories.map(c => (
                        <button key={c} className={`add-cat ${catFilter === c ? 'active' : ''}`} onClick={() => setCatFilter(c)}>{c}</button>
                      ))}
                    </div>
                    <div className="add-list">
                      {visibleMenu.map(m => (
                        <div key={m.id} className="al-row">
                          <span className="al-emoji">{m.image || '📦'}</span>
                          <div className="al-info">
                            <div className="al-name">{m.name}</div>
                            <div className="al-price">{fmtBRL(m.price)}</div>
                          </div>
                          <button className="al-add" onClick={() => addItem(m.id, 1)} disabled={saving}>
                            <Plus size={13}/>
                          </button>
                        </div>
                      ))}
                      {visibleMenu.length === 0 && (
                        <div style={{padding:'20px',textAlign:'center',color:'#475569',fontSize:12}}>Nenhum item</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══ MODAL: FECHAR CONTA ═══ */}
      {showClose && (
        <div className="modal-ov" onClick={e => { if (e.target === e.currentTarget) setShowClose(false) }}>
          <div className="modal-box">
            <div className="modal-hdr">
              <div>
                <div className="modal-ttl">💳 Fechar Conta</div>
                <div className="modal-sub">{selTable?.name} {selTable?.customer_name ? `— ${selTable.customer_name}` : ''}</div>
              </div>
              <button className="btn-icon" onClick={() => setShowClose(false)}><X size={18}/></button>
            </div>
            <div className="modal-bd">
              <div className="close-total">
                <div className="ct-label">Total da comanda</div>
                <div className="ct-value">{fmtBRL(comanda?.total)}</div>
              </div>
              {/* Itens resumidos */}
              {comanda?.items?.map((it, i) => (
                <div key={i} className="close-item">
                  <span>{it.qty}× {it.name}</span>
                  <span>{fmtBRL(it.price * it.qty)}</span>
                </div>
              ))}
              <div className="close-pay-label">Forma de pagamento</div>
              <div className="pay-methods">
                {PAY_METHODS.map(p => (
                  <button key={p.id} className={`pm-btn ${payMethod === p.id ? 'active' : ''}`} onClick={() => setPayMethod(p.id)}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-ftr">
              <button className="btn-sm outline" onClick={() => setShowClose(false)}>Cancelar</button>
              <button className="btn-primary lg" onClick={closeTable} disabled={saving}>
                {saving ? 'Fechando...' : <><Check size={16}/> Confirmar Fechamento</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: QR CODE DA MESA ═══ */}
      {showQR && selected && (
        <div className="modal-ov" onClick={e => { if (e.target === e.currentTarget) setShowQR(false) }}>
          <div className="modal-box qr-box">
            <div className="modal-hdr">
              <div>
                <div className="modal-ttl"><QrCode size={20} color="#f97316"/> QR Code — {selTable?.name}</div>
                <div className="modal-sub">Cliente escaneia e pede pelo celular</div>
              </div>
              <button className="btn-icon" onClick={() => setShowQR(false)}><X size={18}/></button>
            </div>
            <div className="qr-center">
              <div className="qr-wrap">
                <QRCode value={mobileUrl} size={220} bgColor="#fff" fgColor="#1a0f08" level="M"/>
              </div>
              <div className="qr-url">{mobileUrl}</div>
              <div className="qr-hint">
                📱 O cliente escaneia este QR, vê o cardápio no celular,<br/>
                adiciona itens e o pedido vai direto pra cozinha
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        html, body, #root { margin:0; padding:0; height:100vh; background:#0a0604; color:#fef3c7; font-family:'Inter',system-ui,sans-serif; }
        .ms { height:100vh; display:flex; flex-direction:column; overflow:hidden; background:linear-gradient(180deg,#1a0f08,#0a0604); }

        /* FLASH */
        .ms-flash {
          position:fixed; top:16px; left:50%; transform:translateX(-50%);
          background:#22c55e; color:#000; padding:10px 24px; border-radius:999px;
          font-weight:800; font-size:13px; letter-spacing:1px; z-index:999;
          animation:flashIn 0.3s ease;
        }
        .ms-flash.err { background:#ef4444; color:#fff; }
        @keyframes flashIn { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }

        /* HEADER */
        .ms-header {
          display:flex; align-items:center; gap:20px;
          padding:10px 20px;
          background:linear-gradient(180deg,rgba(120,53,15,0.45),rgba(0,0,0,0.4));
          border-bottom:2px solid rgba(249,115,22,0.4);
          flex-shrink:0;
        }
        .ms-brand { display:flex; align-items:center; gap:10px; flex-shrink:0; }
        .ms-title { font-size:18px; font-weight:900; letter-spacing:4px; color:#f97316; }
        .ms-sub   { font-size:10px; letter-spacing:3px; color:#fbbf24; }
        .ms-kpis  { display:flex; gap:12px; flex:1; }
        .mk { display:flex; align-items:center; gap:10px; background:rgba(0,0,0,0.35); border:1px solid rgba(148,163,184,0.12); border-radius:10px; padding:7px 14px; }
        .mk-v { font-size:22px; font-weight:900; color:#fef3c7; line-height:1; }
        .mk-v span { font-size:14px; color:#64748b; }
        .mk-l { font-size:9px; letter-spacing:2px; color:#94a3b8; }
        .ms-hactions { display:flex; align-items:center; gap:8px; margin-left:auto; }
        .ms-ws { display:flex; align-items:center; gap:5px; font-size:10px; letter-spacing:2px; font-weight:800; padding:4px 10px; border-radius:999px; background:rgba(0,0,0,0.4); color:#475569; }
        .ms-ws.on { color:#22c55e; }
        .ms-dot { width:6px; height:6px; border-radius:50%; background:currentColor; animation:msDot 1.5s infinite; }
        @keyframes msDot { 50% { opacity:0.3; } }

        /* BODY */
        .ms-body { flex:1; display:grid; grid-template-columns:340px 1fr; overflow:hidden; }

        /* LEFT — grade de mesas */
        .ms-left { border-right:2px solid rgba(148,163,184,0.1); overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:10px; }
        .ms-section-title { display:flex; justify-content:space-between; align-items:center; font-size:10px; letter-spacing:3px; font-weight:900; color:#f97316; padding:0 2px; }
        .ms-count { color:#64748b; font-size:10px; }
        .ms-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }

        /* TABLE CARD */
        .ms-card {
          border:2px solid rgba(148,163,184,0.15); border-radius:14px;
          padding:10px 12px; cursor:pointer; position:relative;
          transition:all 0.2s; background:rgba(15,15,20,0.5);
        }
        .ms-card.free:hover { border-color:rgba(34,197,94,0.4); }
        .ms-card.open { border-color:rgba(249,115,22,0.4); background:rgba(249,115,22,0.07); }
        .ms-card.open:hover { border-color:#f97316; }
        .ms-card.sel { border-color:#f97316 !important; background:rgba(249,115,22,0.15) !important; box-shadow:0 0 20px rgba(249,115,22,0.2); }
        .mc-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
        .mc-name { font-size:14px; font-weight:900; color:#fef3c7; }
        .mc-badge { font-size:9px; letter-spacing:1px; font-weight:800; }
        .mc-customer { font-size:11px; color:#fbbf24; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .mc-stats { display:flex; gap:8px; font-size:10px; color:#64748b; margin-bottom:2px; }
        .mc-stats span { display:flex; align-items:center; gap:3px; }
        .mc-total { font-size:16px; font-weight:900; color:#22c55e; }
        .mc-cap { font-size:10px; color:#475569; display:flex; align-items:center; gap:4px; }
        .mc-arrow { position:absolute; right:8px; top:50%; transform:translateY(-50%); color:#f97316; }

        /* RIGHT — comanda */
        .ms-right { overflow:hidden; display:flex; flex-direction:column; }
        .ms-empty-panel { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#475569; font-size:14px; letter-spacing:2px; gap:4px; }

        /* COMANDA HEADER */
        .cmd-header { display:flex; justify-content:space-between; align-items:center; padding:14px 20px; border-bottom:1px solid rgba(148,163,184,0.1); flex-shrink:0; }
        .cmd-title { font-size:20px; font-weight:900; color:#f97316; letter-spacing:2px; }
        .cmd-meta { display:flex; gap:12px; font-size:11px; color:#94a3b8; margin-top:3px; }
        .cmd-meta span { display:flex; align-items:center; gap:4px; }
        .cmd-actions { display:flex; gap:8px; }

        /* OPEN FORM */
        .cmd-open-form { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:40px; }
        .cof-title { font-size:15px; color:#94a3b8; letter-spacing:2px; }
        .cof-input { background:rgba(0,0,0,0.5); border:1px solid rgba(249,115,22,0.4); border-radius:10px; color:#fef3c7; padding:10px 16px; font-size:14px; outline:none; width:280px; text-align:center; }
        .cof-input::placeholder { color:#475569; }
        .cof-input:focus { border-color:#f97316; }

        /* COMANDA BODY */
        .cmd-body { flex:1; display:grid; grid-template-rows:auto 1fr; overflow:hidden; }

        /* ITEMS */
        .cmd-items { padding:14px 20px; overflow-y:auto; border-bottom:2px solid rgba(148,163,184,0.1); max-height:45%; }
        .cmd-no-items { text-align:center; color:#475569; font-size:12px; letter-spacing:2px; padding:20px; }
        .ci-row { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid rgba(148,163,184,0.07); }
        .ci-emoji { font-size:20px; flex-shrink:0; }
        .ci-info { flex:1; min-width:0; }
        .ci-name { font-size:13px; font-weight:700; color:#fef3c7; }
        .ci-notes { font-size:10px; color:#64748b; }
        .ci-qty { font-size:13px; font-weight:800; color:#f97316; width:28px; text-align:center; }
        .ci-price { font-size:13px; font-weight:700; color:#22c55e; width:70px; text-align:right; }
        .ci-rm { background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; width:24px; height:24px; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .ci-rm:hover { background:rgba(239,68,68,0.3); }
        .ci-total { display:flex; justify-content:space-between; padding-top:10px; font-size:18px; font-weight:900; color:#22c55e; border-top:2px solid rgba(34,197,94,0.3); margin-top:8px; }

        /* ADD ITEM */
        .cmd-add { padding:14px 20px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; }
        .cmd-add-title { font-size:10px; letter-spacing:3px; color:#f97316; font-weight:900; }
        .add-search-wrap { display:flex; align-items:center; gap:8px; background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.2); border-radius:8px; padding:6px 12px; }
        .add-search { background:none; border:none; outline:none; color:#fef3c7; font-size:13px; flex:1; }
        .add-search::placeholder { color:#475569; }
        .add-clear { background:none; border:none; color:#64748b; cursor:pointer; padding:0; }
        .add-cat-tabs { display:flex; gap:4px; flex-wrap:wrap; }
        .add-cat { background:rgba(0,0,0,0.3); border:1px solid rgba(148,163,184,0.1); color:#64748b; padding:4px 10px; border-radius:6px; font-size:10px; letter-spacing:1px; cursor:pointer; }
        .add-cat.active { background:rgba(249,115,22,0.2); border-color:#f97316; color:#f97316; font-weight:800; }
        .add-list { display:flex; flex-direction:column; gap:4px; }
        .al-row { display:flex; align-items:center; gap:10px; padding:7px 10px; background:rgba(0,0,0,0.3); border-radius:8px; }
        .al-emoji { font-size:20px; }
        .al-info { flex:1; min-width:0; }
        .al-name { font-size:12px; font-weight:700; color:#fef3c7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .al-price { font-size:11px; color:#22c55e; font-weight:700; }
        .al-add { background:rgba(249,115,22,0.2); border:1px solid rgba(249,115,22,0.5); color:#f97316; width:28px; height:28px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .al-add:hover { background:rgba(249,115,22,0.4); }
        .al-add:disabled { opacity:0.4; cursor:not-allowed; }

        /* BUTTONS */
        .btn-sm { display:flex; align-items:center; gap:5px; background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.2); color:#94a3b8; padding:6px 12px; border-radius:8px; font-size:11px; cursor:pointer; }
        .btn-sm:hover { border-color:#f97316; color:#f97316; }
        .btn-sm.outline { color:#fbbf24; border-color:rgba(251,191,36,0.4); }
        .btn-sm.danger { background:rgba(239,68,68,0.15); border-color:rgba(239,68,68,0.4); color:#fca5a5; }
        .btn-sm.danger:hover { background:rgba(239,68,68,0.3); }
        .btn-icon { background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.2); color:#64748b; width:32px; height:32px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .btn-icon:hover { color:#f97316; border-color:#f97316; }
        .btn-primary { display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,#f97316,#dc2626); color:#fff; border:none; padding:9px 18px; border-radius:10px; font-size:13px; font-weight:800; letter-spacing:1px; cursor:pointer; }
        .btn-primary.lg { padding:12px 24px; font-size:14px; }
        .btn-primary:hover { filter:brightness(1.1); }
        .btn-primary:disabled { opacity:0.5; cursor:not-allowed; }

        /* MODAL */
        .modal-ov { position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:300; padding:20px; }
        .modal-box { background:linear-gradient(180deg,#1a0f08,#0a0604); border:2px solid #f97316; border-radius:20px; width:100%; max-width:480px; max-height:85vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 25px 60px rgba(249,115,22,0.3); animation:mIn 0.2s ease; }
        @keyframes mIn { from { transform:scale(0.96); opacity:0; } to { transform:scale(1); opacity:1; } }
        .qr-box { max-width:400px; }
        .modal-hdr { display:flex; justify-content:space-between; align-items:flex-start; padding:16px 20px; border-bottom:1px solid rgba(249,115,22,0.2); }
        .modal-ttl { font-size:20px; font-weight:900; color:#f97316; display:flex; align-items:center; gap:8px; }
        .modal-sub { font-size:12px; color:#94a3b8; margin-top:3px; }
        .modal-bd  { flex:1; overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:10px; }
        .modal-ftr { display:flex; justify-content:flex-end; gap:10px; padding:14px 20px; border-top:1px solid rgba(148,163,184,0.1); }

        .close-total { background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); border-radius:12px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; }
        .ct-label { font-size:11px; letter-spacing:2px; color:#94a3b8; }
        .ct-value { font-size:28px; font-weight:900; color:#22c55e; }
        .close-item { display:flex; justify-content:space-between; font-size:12px; color:#94a3b8; padding:3px 0; }
        .close-pay-label { font-size:10px; letter-spacing:2px; color:#f97316; font-weight:900; margin-top:6px; }
        .pay-methods { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .pm-btn { display:flex; align-items:center; justify-content:center; gap:8px; background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.2); color:#94a3b8; padding:10px; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.2s; }
        .pm-btn:hover { border-color:#f97316; color:#f97316; }
        .pm-btn.active { background:rgba(249,115,22,0.2); border-color:#f97316; color:#fbbf24; }

        /* QR */
        .qr-center { display:flex; flex-direction:column; align-items:center; padding:24px; gap:14px; }
        .qr-wrap { background:#fff; padding:16px; border-radius:16px; box-shadow:0 8px 30px rgba(249,115,22,0.3); }
        .qr-url { font-size:10px; color:#475569; letter-spacing:1px; word-break:break-all; text-align:center; }
        .qr-hint { font-size:11px; color:#94a3b8; text-align:center; line-height:1.6; }
      `}</style>
    </div>
  )
}
