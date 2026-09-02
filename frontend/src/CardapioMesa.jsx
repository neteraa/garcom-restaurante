import React, { useEffect, useState, useCallback } from 'react'
import { Flame, Plus, Minus, ShoppingBag, ArrowLeft, Check, X, ChevronRight } from 'lucide-react'

const API = ''
const fmtBRL = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Extrai o table_id do hash: /#/mesa/3 → "3"
const TABLE_ID = window.location.hash.replace(/^#\/mesa\/?/, '').split('/')[0] || '1'

export default function CardapioMesa() {
  const [menu, setMenu]         = useState([])
  const [cart, setCart]         = useState({})    // item_id → qty
  const [catFilter, setCatFilter] = useState(null)
  const [showCart, setShowCart] = useState(false)
  const [step, setStep]         = useState('menu') // menu | confirm | success | error
  const [loading, setLoading]   = useState(true)
  const [submitting, setSub]    = useState(false)
  const [notes, setNotes]       = useState('')
  const [tableInfo, setTableInfo] = useState(null)

  // ── Fetch menu + table info ──
  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/menu`).then(r => r.json()),
      fetch(`${API}/api/tables/${TABLE_ID}`).then(r => r.json()).catch(() => null),
    ]).then(([menuData, tableData]) => {
      setMenu(menuData.items || [])
      setTableInfo(tableData)
      setLoading(false)
    })
  }, [])

  const categories = ['Todos', ...Array.from(new Set(menu.map(m => m.category).filter(Boolean)))]
  const activeCat  = catFilter ?? categories[1] ?? 'Todos'
  const visible    = activeCat === 'Todos' ? menu : menu.filter(m => m.category === activeCat)

  const cartItems  = menu.filter(m => cart[m.id] > 0)
  const cartTotal  = cartItems.reduce((s, m) => s + m.price * (cart[m.id] || 0), 0)
  const cartCount  = Object.values(cart).reduce((s, v) => s + v, 0)

  const add    = (id) => setCart(p => ({ ...p, [id]: (p[id] || 0) + 1 }))
  const remove = (id) => setCart(p => ({ ...p, [id]: Math.max(0, (p[id] || 0) - 1) }))

  // ── Enviar pedido ──
  const submitOrder = async () => {
    setSub(true)
    try {
      const results = await Promise.all(
        cartItems.map(m =>
          fetch(`${API}/api/tables/${TABLE_ID}/add`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: m.id, qty: cart[m.id], notes }),
          }).then(r => r.json())
        )
      )
      const allOk = results.every(r => r.ok)
      setStep(allOk ? 'success' : 'error')
      if (allOk) setCart({})
    } catch {
      setStep('error')
    } finally {
      setSub(false)
    }
  }

  // ── TELAS ──

  if (loading) return (
    <div className="cm loading">
      <Flame size={40} color="#f97316"/>
      <div className="cm-loading-txt">Carregando cardápio...</div>
    </div>
  )

  if (step === 'success') return (
    <div className="cm success-screen">
      <div className="ss-icon">✅</div>
      <div className="ss-title">Pedido feito!</div>
      <div className="ss-sub">Já mandamos pra cozinha.<br/>Fique à vontade — a gente traz na sua mesa.</div>
      <div className="ss-table">📍 {tableInfo?.table?.name ?? `Mesa ${TABLE_ID}`}</div>
      <button className="ss-btn" onClick={() => setStep('menu')}>Pedir mais alguma coisa</button>
    </div>
  )

  if (step === 'error') return (
    <div className="cm success-screen">
      <div className="ss-icon">❌</div>
      <div className="ss-title">Algo deu errado</div>
      <div className="ss-sub">Tenta de novo ou chama um dos atendentes.</div>
      <button className="ss-btn" onClick={() => setStep('menu')}>Voltar ao cardápio</button>
    </div>
  )

  if (step === 'confirm') return (
    <div className="cm">
      <header className="cm-header">
        <button className="cm-back" onClick={() => setStep('menu')}><ArrowLeft size={20}/></button>
        <div className="cm-header-info">
          <div className="cm-restaurant">JM Espetinhos</div>
          <div className="cm-mesa">{tableInfo?.table?.name ?? `Mesa ${TABLE_ID}`}</div>
        </div>
      </header>

      <div className="cm-confirm">
        <div className="cc-title">Confirmar pedido</div>
        {cartItems.map(m => (
          <div key={m.id} className="cc-row">
            <span className="cc-emoji">{m.image || '📦'}</span>
            <div className="cc-info">
              <div className="cc-name">{m.name}</div>
              <div className="cc-unit">{fmtBRL(m.price)} un.</div>
            </div>
            <div className="cc-ctrl">
              <button className="cc-btn" onClick={() => remove(m.id)}><Minus size={12}/></button>
              <span className="cc-qty">{cart[m.id]}</span>
              <button className="cc-btn" onClick={() => add(m.id)}><Plus size={12}/></button>
            </div>
            <div className="cc-sub">{fmtBRL(m.price * cart[m.id])}</div>
          </div>
        ))}
        <div className="cc-notes">
          <div className="cc-notes-label">Observação (opcional)</div>
          <textarea
            className="cc-notes-input"
            placeholder="Ex: sem cebola, ponto da carne..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
          />
        </div>
        <div className="cc-total">
          <span>Total</span>
          <span className="cc-total-val">{fmtBRL(cartTotal)}</span>
        </div>
      </div>

      <div className="cm-confirm-footer">
        <button className="cm-order-btn" onClick={submitOrder} disabled={submitting}>
          {submitting ? 'Enviando...' : <><Check size={18}/> Pedir agora</>}
        </button>
      </div>
    </div>
  )

  // ── MENU PRINCIPAL ──
  return (
    <div className="cm">
      {/* HEADER */}
      <header className="cm-header">
        <div className="cm-logo"><Flame size={22} color="#f97316"/></div>
        <div className="cm-header-info">
          <div className="cm-restaurant">JM Espetinhos</div>
          <div className="cm-mesa">📍 {tableInfo?.table?.name ?? `Mesa ${TABLE_ID}`}</div>
        </div>
        {cartCount > 0 && (
          <button className="cm-cart-btn" onClick={() => setStep('confirm')}>
            <ShoppingBag size={18}/>
            <span className="cm-cart-count">{cartCount}</span>
          </button>
        )}
      </header>

      {/* CATEGORY TABS */}
      <div className="cm-cats">
        {categories.map(c => (
          <button key={c} className={`cm-cat ${activeCat === c ? 'active' : ''}`} onClick={() => setCatFilter(c)}>
            {c}
          </button>
        ))}
      </div>

      {/* MENU ITEMS */}
      <div className="cm-list">
        {visible.map(m => {
          const qty = cart[m.id] || 0
          return (
            <div key={m.id} className="cm-item">
              <div className="cmi-img">
                {m.thumb
                  ? <img src={m.thumb} alt={m.name} onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='block' }}/>
                  : null}
                <span style={{ display: m.thumb ? 'none' : 'block', fontSize:34 }}>{m.image || '📦'}</span>
              </div>
              <div className="cmi-body">
                <div className="cmi-name">{m.name}</div>
                {m.description && <div className="cmi-desc">{m.description}</div>}
                <div className="cmi-price">{fmtBRL(m.price)}</div>
              </div>
              <div className="cmi-ctrl">
                {qty === 0 ? (
                  <button className="cmi-add" onClick={() => add(m.id)}><Plus size={16}/></button>
                ) : (
                  <div className="cmi-qty-ctrl">
                    <button onClick={() => remove(m.id)}><Minus size={14}/></button>
                    <span>{qty}</span>
                    <button onClick={() => add(m.id)}><Plus size={14}/></button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* FLOATING CART */}
      {cartCount > 0 && (
        <div className="cm-cart-float" onClick={() => setStep('confirm')}>
          <div className="ccf-left">
            <span className="ccf-count">{cartCount} {cartCount === 1 ? 'item' : 'itens'}</span>
          </div>
          <div className="ccf-cta">Ver carrinho</div>
          <div className="ccf-total">{fmtBRL(cartTotal)}</div>
        </div>
      )}

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin:0; padding:0; }
        html, body, #root { height:100%; background:#0a0604; color:#fef3c7; font-family:'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
        .cm { min-height:100vh; display:flex; flex-direction:column; background:linear-gradient(180deg,#1a0f08,#0a0604); position:relative; max-width:480px; margin:0 auto; }
        .cm.loading { align-items:center; justify-content:center; gap:16px; }
        .cm-loading-txt { font-size:13px; letter-spacing:2px; color:#f97316; }

        /* HEADER */
        .cm-header { display:flex; align-items:center; gap:10px; padding:12px 16px; background:rgba(120,53,15,0.3); border-bottom:2px solid rgba(249,115,22,0.35); position:sticky; top:0; z-index:20; backdrop-filter:blur(8px); }
        .cm-logo { display:flex; align-items:center; }
        .cm-back { background:none; border:none; color:#fef3c7; cursor:pointer; display:flex; padding:4px; }
        .cm-header-info { flex:1; }
        .cm-restaurant { font-size:14px; font-weight:900; letter-spacing:2px; color:#f97316; }
        .cm-mesa { font-size:11px; color:#94a3b8; letter-spacing:1px; }
        .cm-cart-btn { display:flex; align-items:center; gap:4px; background:rgba(249,115,22,0.2); border:1px solid rgba(249,115,22,0.5); color:#fbbf24; padding:7px 12px; border-radius:999px; cursor:pointer; position:relative; }
        .cm-cart-count { font-size:13px; font-weight:900; }

        /* CAT TABS */
        .cm-cats { display:flex; gap:6px; overflow-x:auto; padding:10px 16px; scrollbar-width:none; border-bottom:1px solid rgba(148,163,184,0.1); flex-shrink:0; }
        .cm-cats::-webkit-scrollbar { display:none; }
        .cm-cat { background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.15); color:#64748b; padding:6px 14px; border-radius:999px; font-size:12px; white-space:nowrap; cursor:pointer; letter-spacing:1px; flex-shrink:0; }
        .cm-cat.active { background:rgba(249,115,22,0.2); border-color:#f97316; color:#f97316; font-weight:800; }

        /* MENU LIST */
        .cm-list { flex:1; overflow-y:auto; padding:10px 14px 100px; display:flex; flex-direction:column; gap:8px; }
        .cm-item { display:flex; align-items:center; gap:12px; background:rgba(15,15,20,0.7); border:1px solid rgba(148,163,184,0.1); border-radius:14px; padding:10px 12px; }
        .cmi-img { width:56px; height:56px; border-radius:10px; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; }
        .cmi-img img { width:100%; height:100%; object-fit:cover; }
        .cmi-body { flex:1; min-width:0; }
        .cmi-name { font-size:14px; font-weight:700; color:#fef3c7; line-height:1.2; }
        .cmi-desc { font-size:11px; color:#64748b; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .cmi-price { font-size:13px; font-weight:800; color:#22c55e; margin-top:4px; }
        .cmi-ctrl { flex-shrink:0; }
        .cmi-add { background:linear-gradient(135deg,#f97316,#dc2626); border:none; color:#fff; width:34px; height:34px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(249,115,22,0.4); }
        .cmi-qty-ctrl { display:flex; align-items:center; gap:8px; background:rgba(249,115,22,0.15); border:1px solid rgba(249,115,22,0.4); border-radius:10px; padding:4px 8px; }
        .cmi-qty-ctrl button { background:none; border:none; color:#f97316; cursor:pointer; display:flex; align-items:center; padding:2px; }
        .cmi-qty-ctrl span { font-size:15px; font-weight:900; color:#fef3c7; min-width:20px; text-align:center; }

        /* FLOATING CART */
        .cm-cart-float { position:fixed; bottom:16px; left:50%; transform:translateX(-50%); width:calc(100% - 28px); max-width:452px; background:linear-gradient(135deg,#f97316,#dc2626); border-radius:14px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; box-shadow:0 8px 30px rgba(249,115,22,0.6); z-index:30; animation:ccfIn 0.25s ease; }
        @keyframes ccfIn { from { transform:translateX(-50%) translateY(20px); opacity:0; } to { transform:translateX(-50%) translateY(0); opacity:1; } }
        .ccf-left { font-size:13px; font-weight:700; color:rgba(255,255,255,0.85); }
        .ccf-cta { font-size:15px; font-weight:900; color:#fff; letter-spacing:1px; }
        .ccf-total { font-size:14px; font-weight:800; color:#fff; }

        /* CONFIRM SCREEN */
        .cm-confirm { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
        .cc-title { font-size:18px; font-weight:900; color:#f97316; letter-spacing:2px; margin-bottom:4px; }
        .cc-row { display:flex; align-items:center; gap:10px; background:rgba(15,15,20,0.7); border:1px solid rgba(148,163,184,0.1); border-radius:12px; padding:10px 12px; }
        .cc-emoji { font-size:24px; }
        .cc-info { flex:1; min-width:0; }
        .cc-name { font-size:13px; font-weight:700; color:#fef3c7; }
        .cc-unit { font-size:11px; color:#64748b; }
        .cc-ctrl { display:flex; align-items:center; gap:8px; }
        .cc-btn { background:rgba(0,0,0,0.4); border:1px solid rgba(148,163,184,0.2); color:#94a3b8; width:26px; height:26px; border-radius:7px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .cc-qty { font-size:15px; font-weight:900; color:#fef3c7; min-width:20px; text-align:center; }
        .cc-sub { font-size:14px; font-weight:800; color:#22c55e; min-width:60px; text-align:right; }
        .cc-notes-label { font-size:10px; letter-spacing:2px; color:#f97316; font-weight:900; }
        .cc-notes-input { background:rgba(0,0,0,0.5); border:1px solid rgba(249,115,22,0.3); border-radius:10px; color:#fef3c7; padding:10px 14px; font-size:13px; outline:none; resize:none; width:100%; font-family:inherit; }
        .cc-notes-input:focus { border-color:#f97316; }
        .cc-notes-input::placeholder { color:#475569; }
        .cc-total { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.25); border-radius:12px; font-size:14px; font-weight:700; color:#94a3b8; }
        .cc-total-val { font-size:22px; font-weight:900; color:#22c55e; }
        .cm-confirm-footer { padding:14px 16px; }
        .cm-order-btn { width:100%; background:linear-gradient(135deg,#f97316,#dc2626); color:#fff; border:none; padding:16px; border-radius:14px; font-size:16px; font-weight:900; letter-spacing:2px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; box-shadow:0 8px 24px rgba(249,115,22,0.5); }
        .cm-order-btn:disabled { opacity:0.5; cursor:not-allowed; }

        /* SUCCESS */
        .success-screen { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:40px; text-align:center; }
        .ss-icon { font-size:64px; }
        .ss-title { font-size:28px; font-weight:900; color:#fef3c7; }
        .ss-sub { font-size:14px; color:#94a3b8; line-height:1.6; }
        .ss-table { font-size:13px; color:#f97316; font-weight:700; letter-spacing:2px; }
        .ss-btn { background:rgba(249,115,22,0.2); border:2px solid rgba(249,115,22,0.5); color:#f97316; padding:12px 28px; border-radius:999px; font-size:14px; font-weight:800; cursor:pointer; margin-top:10px; }
        .ss-btn:hover { background:rgba(249,115,22,0.35); }
      `}</style>
    </div>
  )
}
