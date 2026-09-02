import React, { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Eye, EyeOff, Flame, Save, XCircle } from 'lucide-react'

const Pill = ({ ok, label }) => (
  <span style={{
    display:'inline-flex', alignItems:'center', gap:5,
    padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700,
    background: ok ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
    border: `1px solid ${ok ? 'rgba(34,197,94,.4)' : 'rgba(239,68,68,.4)'}`,
    color: ok ? '#22c55e' : '#ef4444',
  }}>
    {ok ? <CheckCircle2 size={11}/> : <XCircle size={11}/>} {label}
  </span>
)

export default function Configuracoes() {
  const [status, setStatus]       = useState(null)
  const [openaiKey, setOpenaiKey] = useState('')
  const [showKey, setShowKey]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [testMsg, setTestMsg]     = useState('')

  const loadStatus = async () => {
    try { setStatus(await fetch('/api/system/status').then(r => r.json())) } catch {}
  }
  useEffect(() => { loadStatus() }, [])

  const handleSave = async () => {
    if (!openaiKey.trim()) return
    setSaving(true)
    try {
      const r = await fetch('/api/config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openai_api_key: openaiKey.trim() }),
      })
      const d = await r.json()
      if (d.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); await loadStatus() }
    } catch {}
    setSaving(false)
  }

  const testVoice = async () => {
    setTestMsg('Gerando áudio...')
    try {
      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Olá! Sou a Gabi, sua assistente do JM Espetinhos. Tô funcionando perfeitamente!' }),
      })
      if (r.ok) {
        const blob = await r.blob()
        const url  = URL.createObjectURL(blob)
        const a    = new Audio(url)
        a.onended = () => { URL.revokeObjectURL(url); setTestMsg('') }
        a.play()
        setTestMsg('▶ Reproduzindo...')
      } else { setTestMsg('Falhou. Tenta de novo.') }
    } catch { setTestMsg('Erro de conexão.') }
  }

  const testChat = async () => {
    setTestMsg('Testando chat...')
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Oi Gabi', session_id: 'config-test' }),
      })
      const d = await r.json()
      setTestMsg(d.reply ? `✅ Gabi respondeu: "${d.reply.slice(0,60)}..."` : '❌ Chat com erro — verifique a chave OpenAI')
    } catch { setTestMsg('❌ Erro de conexão') }
  }

  const FACE_LABELS = {
    full:         { ok: true,  label: 'Reconhecimento facial completo (MTCNN)' },
    detect_only:  { ok: true,  label: 'Detecção de presença (OpenCV)' },
    none:         { ok: false, label: 'Desativado' },
  }
  const faceInfo = FACE_LABELS[status?.face_mode] || { ok: false, label: 'Desconhecido' }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(180deg,#1a0f08,#0a0604)',
      color: '#fef3c7', fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      {/* Header */}
      <header style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 28px',
        background:'linear-gradient(180deg,rgba(120,53,15,.5),rgba(0,0,0,.6))',
        borderBottom:'2px solid rgba(249,115,22,.4)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <Flame size={26} color="#f97316" />
          <div>
            <div style={{ fontSize:18, fontWeight:900, letterSpacing:4, color:'#f97316' }}>JM ESPETINHOS</div>
            <div style={{ fontSize:10, letterSpacing:3, color:'#fbbf24' }}>CONFIGURAÇÕES DO SISTEMA</div>
          </div>
        </div>
        <button onClick={() => window.location.hash = '#/staff'}
          style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:9, padding:'7px 16px', color:'#aaa', fontSize:13, cursor:'pointer' }}>
          ← Voltar
        </button>
      </header>

      <div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:20, maxWidth:760, margin:'0 auto' }}>

        {/* Status do sistema */}
        <section style={{ background:'rgba(0,0,0,.45)', border:'1px solid rgba(255,255,255,.08)', borderRadius:16, padding:'20px 24px' }}>
          <div style={{ fontSize:11, letterSpacing:3, fontWeight:900, color:'#fef3c7', marginBottom:16 }}>
            <Activity size={13} style={{ display:'inline', marginRight:8 }} />STATUS DO SISTEMA
          </div>
          {!status ? (
            <div style={{ color:'#555', fontSize:13 }}>Carregando...</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {[
                { label:'IA (Gabi / OpenAI)',       node: <Pill ok={status.openai_ok} label={status.openai_ok ? `Ativa ${status.openai_key_hint ? '· '+status.openai_key_hint : ''}` : 'Chave não configurada'} /> },
                { label:'Voz (TTS)',                 node: <Pill ok label={status.tts_engine} /> },
                { label:'Câmera / Presença',         node: <Pill ok={status.face_enabled} label={faceInfo.label} /> },
                { label:'Cardápio',                  node: <Pill ok={status.menu_items > 0} label={`${status.menu_items} itens cadastrados`} /> },
                { label:'Clientes reconhecidos',     node: <Pill ok label={`${status.customers} clientes`} /> },
                { label:'Pedidos hoje',              node: <Pill ok label={`${status.orders_today} pedidos`} /> },
              ].map(row => (
                <div key={row.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'rgba(0,0,0,.3)', borderRadius:10 }}>
                  <span style={{ color:'#94a3b8', fontSize:13 }}>{row.label}</span>
                  {row.node}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Chave OpenAI */}
        <section style={{ background:'rgba(0,0,0,.45)', border:'1px solid rgba(255,255,255,.08)', borderRadius:16, padding:'20px 24px' }}>
          <div style={{ fontSize:11, letterSpacing:3, fontWeight:900, color:'#fef3c7', marginBottom:6 }}>🤖 CHAVE OPENAI (IA DA GABI)</div>
          <div style={{ color:'#555', fontSize:12, marginBottom:16 }}>
            Necessária para o chat inteligente. Obtenha em{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{ color:'#3b82f6' }}>platform.openai.com</a>
          </div>

          {status?.openai_ok ? (
            <div style={{ padding:'12px 16px', background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.3)', borderRadius:10, marginBottom:14, color:'#22c55e', fontSize:13 }}>
              ✅ Chave configurada: <strong>{status.openai_key_hint}</strong>
              <span style={{ color:'#555', fontSize:11, marginLeft:8 }}>Para trocar, insira a nova chave abaixo</span>
            </div>
          ) : (
            <div style={{ padding:'12px 16px', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:10, marginBottom:14, color:'#ef4444', fontSize:13 }}>
              ⚠️ Sem chave configurada — a Gabi não consegue responder
            </div>
          )}

          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:1, position:'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                placeholder="sk-proj-..."
                style={{
                  width:'100%', boxSizing:'border-box',
                  background:'#111', border:'1px solid #2a2a2a', borderRadius:10,
                  color:'#fff', padding:'12px 44px 12px 16px', fontSize:14,
                }}
              />
              <button onClick={() => setShowKey(v => !v)} style={{
                position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', color:'#555', cursor:'pointer',
              }}>
                {showKey ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            <button onClick={handleSave} disabled={!openaiKey.trim() || saving} style={{
              background: openaiKey.trim() ? '#22c55e' : '#1a1a1a',
              color: openaiKey.trim() ? '#fff' : '#444',
              border:'none', borderRadius:10, padding:'0 20px',
              fontWeight:700, fontSize:14, cursor: openaiKey.trim() ? 'pointer' : 'not-allowed',
              display:'flex', alignItems:'center', gap:7,
            }}>
              <Save size={15} />{saving ? 'Salvando...' : saved ? '✅ Salvo!' : 'Salvar'}
            </button>
          </div>
        </section>

        {/* Testar componentes */}
        <section style={{ background:'rgba(0,0,0,.45)', border:'1px solid rgba(255,255,255,.08)', borderRadius:16, padding:'20px 24px' }}>
          <div style={{ fontSize:11, letterSpacing:3, fontWeight:900, color:'#fef3c7', marginBottom:16 }}>🧪 TESTAR COMPONENTES</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <button onClick={testVoice} style={{
              background:'rgba(249,115,22,.15)', border:'1px solid rgba(249,115,22,.4)',
              borderRadius:10, padding:'10px 20px', color:'#f97316',
              fontWeight:700, fontSize:13, cursor:'pointer',
            }}>🔊 Testar Voz da Gabi</button>
            <button onClick={testChat} style={{
              background:'rgba(59,130,246,.15)', border:'1px solid rgba(59,130,246,.4)',
              borderRadius:10, padding:'10px 20px', color:'#3b82f6',
              fontWeight:700, fontSize:13, cursor:'pointer',
            }}>💬 Testar Chat IA</button>
          </div>
          {testMsg && (
            <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(0,0,0,.3)', borderRadius:8, color:'#fbbf24', fontSize:13 }}>
              {testMsg}
            </div>
          )}
        </section>

        {/* Info face recognition */}
        {status && !status.openai_ok && (
          <section style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.3)', borderRadius:16, padding:'20px 24px' }}>
            <div style={{ fontWeight:800, color:'#ef4444', marginBottom:8 }}>⚠️ Gabi sem IA</div>
            <div style={{ color:'#aaa', fontSize:13, lineHeight:1.7 }}>
              Configure a chave OpenAI acima para que a Gabi responda aos clientes.<br/>
              Sem ela, o totem funciona mas a assistente não conversa.<br/>
              <strong style={{ color:'#fbbf24' }}>Detecção de presença: {faceInfo.label}</strong> — a câmera {status.face_enabled ? 'detecta quem está na frente ✅' : 'não está ativa ⚠️'}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
