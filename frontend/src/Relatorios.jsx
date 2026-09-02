import React, { useCallback, useEffect, useState } from 'react'
import { BarChart2, DollarSign, Download, Flame, Package, ShoppingBag, TrendingUp } from 'lucide-react'

const fmtBRL  = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (iso) => { try { return new Date(iso + 'T00:00').toLocaleDateString('pt-BR') } catch { return iso } }

const METHOD_COLOR = { pix:'#22c55e', debito:'#3b82f6', credito:'#8b5cf6', dinheiro:'#f59e0b', fiado:'#ef4444' }
const METHOD_LABEL = { pix:'PIX', debito:'Débito', credito:'Crédito', dinheiro:'Dinheiro', fiado:'Fiado' }
const PERIODS = [
  { id: 'today', label: 'Hoje' },
  { id: 'week',  label: '7 dias' },
  { id: 'month', label: '30 dias' },
]

export default function Relatorios() {
  const [period, setPeriod]   = useState('today')
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reports?period=${p}`)
      setData(await r.json())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load(period) }, [period, load])

  const exportCSV = () => {
    if (!data) return
    const rows = [['Item','Categoria','Qtd','Receita']]
    data.top_items.forEach(it => rows.push([it.name, it.category, it.qty, it.revenue]))
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\ufeff' + csv)
    a.download = `relatorio_${period}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const s = data?.summary || {}
  const maxRevDay  = Math.max(1, ...(data?.by_day  || []).map(d => d.revenue))
  const maxRevHour = Math.max(1, ...(data?.by_hour || []).map(h => h.revenue))
  const maxCatRev  = Math.max(1, ...(data?.by_category || []).map(c => c.revenue))
  const maxItem    = Math.max(1, ...(data?.top_items || []).map(i => i.qty))
  const payTotal   = (data?.payment_breakdown || []).reduce((s, p) => s + p.total, 0) || 1

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(180deg,#1a0f08,#0a0604)',
      color: '#fef3c7', fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 28px',
        background: 'linear-gradient(180deg,rgba(120,53,15,.5),rgba(0,0,0,.6))',
        borderBottom: '2px solid rgba(249,115,22,.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Flame size={26} color="#f97316" />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 4, color: '#f97316' }}>JM ESPETINHOS</div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: '#fbbf24' }}>RELATÓRIOS DE VENDAS</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,.4)', borderRadius: 10, padding: 4 }}>
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                background: period === p.id ? '#f97316' : 'transparent',
                color: period === p.id ? '#fff' : '#94a3b8',
                border: 'none', borderRadius: 7, padding: '6px 16px',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all .15s',
              }}>{p.label}</button>
            ))}
          </div>
          <button onClick={exportCSV} style={{
            background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.4)',
            borderRadius: 9, padding: '7px 16px', color: '#22c55e',
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={() => window.location.hash = '#/staff'}
            style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:9, padding:'7px 16px', color:'#aaa', fontSize:13, cursor:'pointer' }}>
            ← Voltar
          </button>
        </div>
      </header>

      {loading ? (
        <div style={{ textAlign:'center', padding: 80, color: '#555' }}>Carregando...</div>
      ) : !data ? (
        <div style={{ textAlign:'center', padding: 80, color: '#555' }}>Erro ao carregar dados</div>
      ) : (
        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Label */}
          <div style={{ color: '#555', fontSize: 12, letterSpacing: 2 }}>
            📅 {data.label} · {s.total_orders} pedidos
            {s.canceled > 0 && <span style={{ color: '#ef4444', marginLeft: 10 }}>{s.canceled} cancelados</span>}
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {[
              { icon: DollarSign, label: 'FATURAMENTO', value: fmtBRL(s.total_revenue), color: '#22c55e', big: true },
              { icon: ShoppingBag, label: 'PEDIDOS', value: s.total_orders, color: '#f97316' },
              { icon: TrendingUp, label: 'TICKET MÉDIO', value: fmtBRL(s.ticket_avg), color: '#3b82f6' },
            ].map((k, i) => {
              const Icon = k.icon
              return (
                <div key={i} style={{
                  background: k.big ? 'linear-gradient(135deg,rgba(34,197,94,.15),rgba(249,115,22,.1))' : 'rgba(0,0,0,.4)',
                  border: `1px solid ${k.big ? 'rgba(34,197,94,.4)' : 'rgba(255,255,255,.06)'}`,
                  borderRadius: 16, padding: '20px 24px',
                  display: 'flex', alignItems: 'center', gap: 16,
                }}>
                  <div style={{ width:48,height:48,borderRadius:12,background:k.color+'22',color:k.color,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                    <Icon size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 3, color: '#64748b', fontWeight: 700 }}>{k.label}</div>
                    <div style={{ fontSize: k.big ? 36 : 28, fontWeight: 900, color: k.big ? '#22c55e' : '#fef3c7', lineHeight: 1.1 }}>{k.value}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Linha 2: gráfico por dia/hora + formas de pagamento */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>

            {/* Chart */}
            <div style={{ background:'rgba(0,0,0,.4)', border:'1px solid rgba(255,255,255,.06)', borderRadius:16, padding:'18px 20px' }}>
              <div style={{ fontSize:11,letterSpacing:3,fontWeight:900,color:'#fef3c7',marginBottom:16 }}>
                {period === 'today' ? '⏱ FATURAMENTO POR HORA' : '📅 FATURAMENTO POR DIA'}
              </div>
              {period === 'today' ? (
                // Hourly bar chart
                (data.by_hour || []).length === 0 ? (
                  <div style={{ color:'#444',textAlign:'center',padding:'30px 0',fontSize:13 }}>Sem dados ainda</div>
                ) : (
                  <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:120 }}>
                    {data.by_hour.map(h => (
                      <div key={h.hour} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, height:'100%', justifyContent:'flex-end' }}>
                        <div style={{ fontSize:9, color:'#22c55e', fontWeight:700, whiteSpace:'nowrap' }}>
                          {h.revenue > 0 ? fmtBRL(h.revenue).replace('R$\u00a0','').replace(',00','') : ''}
                        </div>
                        <div style={{
                          width:'100%', minHeight:3,
                          height:`${(h.revenue / maxRevHour) * 90}px`,
                          background:'linear-gradient(180deg,#22c55e,#f97316)',
                          borderRadius:'4px 4px 0 0',
                        }} />
                        <div style={{ fontSize:9, color:'#fbbf24', fontWeight:700 }}>{String(h.hour).padStart(2,'0')}h</div>
                        <div style={{ fontSize:8, color:'#444' }}>{h.count}</div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                // Daily bar chart
                (data.by_day || []).length === 0 ? (
                  <div style={{ color:'#444',textAlign:'center',padding:'30px 0',fontSize:13 }}>Sem dados ainda</div>
                ) : (
                  <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:120 }}>
                    {data.by_day.map(d => (
                      <div key={d.date} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, height:'100%', justifyContent:'flex-end' }}>
                        <div style={{ fontSize:9, color:'#22c55e', fontWeight:700, whiteSpace:'nowrap' }}>
                          {d.revenue > 0 ? fmtBRL(d.revenue).replace('R$\u00a0','').replace(',00','') : ''}
                        </div>
                        <div style={{
                          width:'100%', minHeight:3,
                          height:`${(d.revenue / maxRevDay) * 90}px`,
                          background:'linear-gradient(180deg,#3b82f6,#22c55e)',
                          borderRadius:'4px 4px 0 0',
                        }} />
                        <div style={{ fontSize:8, color:'#fbbf24', fontWeight:700 }}>{fmtDate(d.date).slice(0,5)}</div>
                        <div style={{ fontSize:8, color:'#444' }}>{d.count}p</div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Pagamentos */}
            <div style={{ background:'rgba(0,0,0,.4)', border:'1px solid rgba(255,255,255,.06)', borderRadius:16, padding:'18px 20px' }}>
              <div style={{ fontSize:11,letterSpacing:3,fontWeight:900,color:'#fef3c7',marginBottom:16 }}>💳 FORMAS DE PAGAMENTO</div>
              {(data.payment_breakdown || []).length === 0 ? (
                <div style={{ color:'#444',textAlign:'center',padding:'30px 0',fontSize:13 }}>Nenhum pagamento registrado</div>
              ) : (
                data.payment_breakdown.map(p => {
                  const pct = Math.round((p.total / payTotal) * 100)
                  const color = METHOD_COLOR[p.method] || '#94a3b8'
                  return (
                    <div key={p.method} style={{ marginBottom:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:8,height:8,borderRadius:'50%',background:color }} />
                          <span style={{ color,fontWeight:700,fontSize:14 }}>{METHOD_LABEL[p.method]||p.method}</span>
                          <span style={{ color:'#555',fontSize:12 }}>({p.count}×)</span>
                        </div>
                        <div>
                          <span style={{ color:'#fef3c7',fontWeight:800,fontSize:14 }}>{fmtBRL(p.total)}</span>
                          <span style={{ color:'#555',fontSize:11,marginLeft:6 }}>{pct}%</span>
                        </div>
                      </div>
                      <div style={{ height:6,background:'#111',borderRadius:3,overflow:'hidden' }}>
                        <div style={{ width:`${pct}%`,height:'100%',background:color,borderRadius:3,transition:'width .4s' }} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Linha 3: por categoria + top itens */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 14 }}>

            {/* Por categoria */}
            <div style={{ background:'rgba(0,0,0,.4)', border:'1px solid rgba(255,255,255,.06)', borderRadius:16, padding:'18px 20px' }}>
              <div style={{ fontSize:11,letterSpacing:3,fontWeight:900,color:'#fef3c7',marginBottom:16 }}>
                <Package size={14} style={{ display:'inline',marginRight:8 }} />POR CATEGORIA
              </div>
              {(data.by_category || []).length === 0 ? (
                <div style={{ color:'#444',textAlign:'center',padding:'20px 0',fontSize:13 }}>Sem vendas</div>
              ) : (
                data.by_category.map((c, i) => (
                  <div key={c.category} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ color:'#fef3c7',fontWeight:600,fontSize:13 }}>{c.category}</span>
                      <div style={{ textAlign:'right' }}>
                        <span style={{ color:'#22c55e',fontWeight:800,fontSize:13 }}>{fmtBRL(c.revenue)}</span>
                        <span style={{ color:'#555',fontSize:11,marginLeft:6 }}>{c.qty} itens</span>
                      </div>
                    </div>
                    <div style={{ height:5,background:'#111',borderRadius:3,overflow:'hidden' }}>
                      <div style={{
                        width:`${(c.revenue/maxCatRev)*100}%`, height:'100%',
                        background:`hsl(${30 + i*28},80%,55%)`,
                        borderRadius:3, transition:'width .4s',
                      }} />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Top itens */}
            <div style={{ background:'rgba(0,0,0,.4)', border:'1px solid rgba(255,255,255,.06)', borderRadius:16, padding:'18px 20px' }}>
              <div style={{ fontSize:11,letterSpacing:3,fontWeight:900,color:'#fef3c7',marginBottom:16 }}>
                <BarChart2 size={14} style={{ display:'inline',marginRight:8 }} />TOP 15 ITENS
              </div>
              {(data.top_items || []).length === 0 ? (
                <div style={{ color:'#444',textAlign:'center',padding:'20px 0',fontSize:13 }}>Sem vendas ainda</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {data.top_items.map((it, i) => (
                    <div key={it.name} style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:12,fontWeight:900,color:'#fbbf24',width:22,textAlign:'right' }}>#{i+1}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                          <span style={{ fontSize:12,color:'#fef3c7',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{it.name}</span>
                          <div style={{ flexShrink:0, marginLeft:8, display:'flex', gap:8 }}>
                            <span style={{ color:'#f97316',fontWeight:800,fontSize:12 }}>{it.qty}×</span>
                            <span style={{ color:'#22c55e',fontWeight:700,fontSize:12 }}>{fmtBRL(it.revenue)}</span>
                          </div>
                        </div>
                        <div style={{ height:4,background:'#111',borderRadius:2,overflow:'hidden' }}>
                          <div style={{
                            width:`${(it.qty/maxItem)*100}%`, height:'100%',
                            background:'linear-gradient(90deg,#f97316,#22c55e)',
                            borderRadius:2,
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
