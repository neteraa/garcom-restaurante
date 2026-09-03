import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Mic, Volume2, Flame, Clock, CheckCircle2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import GabiAvatar from './components/GabiAvatar'

// Avatar AUTO-DETECT (prioridade): vídeo real > foto real > SVG
// - Vídeo:  frontend/public/videos/human/idle.mp4 existe → usa clipes
// - Foto:   frontend/public/avatars/attendant.jpg existe → foto + boca animada
// - SVG:    fallback garantido
// Forçar manualmente: ?2d=1 (svg) · ?photo=1 · ?video=1
const AvatarPhoto = React.lazy(() => import('./components/AvatarPhoto'))
const AvatarVideo = React.lazy(() => import('./components/AvatarVideo'))

function useAvatarMode() {
  const [mode, setMode] = React.useState(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      if (q.get('2d') === '1') return 'svg'
      if (q.get('photo') === '1') return 'photo'
      if (q.get('video') === '1') return 'video'
      return null  // auto-detect
    } catch { return 'svg' }
  })
  React.useEffect(() => {
    if (mode !== null) return
    // Auto-detect: video > photo > svg
    // NOTA: Vite dev server responde 200+index.html pra arquivos inexistentes (SPA fallback),
    // então além de r.ok é preciso validar o content-type real do asset.
    const isReal = (r, type) => r.ok && (r.headers.get('content-type') || '').startsWith(type)
    fetch('/videos/human/idle.mp4', { method: 'HEAD' })
      .then(r => {
        if (isReal(r, 'video')) { setMode('video'); return null }
        return fetch('/avatars/attendant.jpg', { method: 'HEAD' })
      })
      .then(r => {
        if (!r) return
        if (isReal(r, 'image')) setMode('photo')
        else setMode('svg')
      })
      .catch(() => setMode('svg'))
  }, [mode])
  return mode || 'svg'
}

const API = ''  // relative URLs — proxied via Vite dev server or nginx in Docker
const WS = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'

// Generate a session id once per tab
const SESSION_ID = 'sess-' + Math.random().toString(36).slice(2, 10)

export default function App() {
  const avatarMode = useAvatarMode()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const wsRef = useRef(null)
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const rafRef = useRef(null)
  const audioSourceRef = useRef(null)

  const [menu, setMenu] = useState([])
  const [step, setStep] = useState('idle') // idle, listening, thinking, speaking, done
  const [customer, setCustomer] = useState(null)
  const [cart, setCart] = useState([])
  const [phase, setPhase] = useState('greeting')
  const [subtitle, setSubtitle] = useState('')
  const [gabiText, setGabiText] = useState('Bem-vindo ao JM Espetinhos!')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [amplitude, setAmplitude] = useState(0)
  const [presenceDetected, setPresenceDetected] = useState(false)
  const [facesCount, setFacesCount] = useState(0)
  const [highlightId, setHighlightId] = useState(null)
  const [mentionedIds, setMentionedIds] = useState([])  // itens que Gabi mencionou (piscam)
  const [showMenuOverlay, _setShowMenuOverlay] = useState(null)  // null | {category:'Espetinhos'|''}
  const setShowMenuOverlay = (v) => {
    console.log('🟢 setShowMenuOverlay called with:', v)
    _setShowMenuOverlay(v)
  }
  const [orderId, setOrderId] = useState(null)
  const [confirmedOrder, setConfirmedOrder] = useState(null)
  const [prepTime, setPrepTime] = useState(0)  // seconds elapsed
  // Log every render's overlay state
  console.log('🎨 RENDER — showMenuOverlay:', showMenuOverlay, 'confirmedOrder:', !!confirmedOrder)

  // ── Load menu ──
  useEffect(() => {
    fetch(`${API}/api/menu`).then(r => r.json()).then(d => setMenu(d.items || []))
  }, [])

  // ── Timer for prep time ──
  useEffect(() => {
    if (!confirmedOrder) return
    const iv = setInterval(() => setPrepTime(p => p + 1), 1000)
    return () => clearInterval(iv)
  }, [confirmedOrder])

  // ── Camera ──
  useEffect(() => {
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
        streamRef.current = s
        if (videoRef.current) videoRef.current.srcObject = s
      } catch (e) { console.error('Camera error', e) }
    })()
    return () => streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  // ── WebSocket for presence detection ──
  const engagedSinceRef = useRef(null)
  const emptyFramesRef = useRef(0)
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(WS)
    wsRef.current = ws
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data)
        if (d.type === 'face') {
          setPresenceDetected(d.detected)
          if (typeof d.n_faces === 'number') setFacesCount(d.n_faces)
          // Engagement window tracking
          if (d.engaged) {
            emptyFramesRef.current = 0
            if (!engagedSinceRef.current) engagedSinceRef.current = Date.now()
          } else {
            emptyFramesRef.current += 1
            // Reset engagement after 3 empty frames (~1.5s)
            if (emptyFramesRef.current > 3) engagedSinceRef.current = null
          }
        }
      } catch {}
    }
    ws.onclose = () => setTimeout(connectWS, 2000)
  }, [])

  useEffect(() => {
    connectWS()
    const iv = setInterval(() => {
      const v = videoRef.current, c = canvasRef.current
      if (!v || !c || v.readyState < 2 || wsRef.current?.readyState !== WebSocket.OPEN) return
      c.width = 320; c.height = 240
      c.getContext('2d').drawImage(v, 0, 0, 320, 240)
      wsRef.current.send(JSON.stringify({ frame: c.toDataURL('image/jpeg', 0.6) }))
    }, 500)  // 2x per second for responsive presence
    return () => clearInterval(iv)
  }, [connectWS])

  // ── Ensure AudioContext + Analyser ──
  const ensureAudio = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const ctx = audioCtxRef.current
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') await ctx.resume()
    return ctx
  }

  // ── Play a soft beep to cue the customer ──
  const playBeep = async (freq = 660, dur = 0.12) => {
    try {
      const ctx = await ensureAudio()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + dur)
      await new Promise(r => setTimeout(r, dur * 1000))
    } catch (e) { console.warn('beep:', e) }
  }

  // ── Speak: TTS + amplitude-driven lip-sync ──
  const speak = async (text) => {
    console.log('🗣️ SPEAK:', text.slice(0, 60))
    setGabiText(text)
    setStep('speaking')
    // Ensure mic recognition is OFF during TTS (evita eco)
    stopCurrentRecognition()

    try {
      const res = await fetch(`${API}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)
      const arrayBuf = await (await res.blob()).arrayBuffer()
      const ctx = await ensureAudio()
      const audioBuf = await ctx.decodeAudioData(arrayBuf)
      const source = ctx.createBufferSource()
      source.buffer = audioBuf
      source.connect(analyserRef.current)
      audioSourceRef.current = source

      setIsSpeaking(true)
      const buf = new Uint8Array(analyserRef.current.frequencyBinCount)
      const loop = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        setAmplitude(Math.sqrt(sum / buf.length))
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()

      await new Promise((resolve) => {
        source.onended = resolve
        source.start(0)
      })
      // Small tail buffer to let audio fully drain (evita ecos)
      await new Promise(r => setTimeout(r, 250))
    } catch (e) {
      console.error('speak error', e)
    } finally {
      cancelAnimationFrame(rafRef.current)
      setAmplitude(0)
      setIsSpeaking(false)
    }
  }

  // ── Listen (Web Speech API) — singleton pra não conflitar bg + interativo ──
  const recRef = useRef(null)
  const stopCurrentRecognition = () => {
    try { recRef.current?.stop() } catch {}
    try { recRef.current?.abort() } catch {}
    recRef.current = null
  }

  // Anti-eco: frases que a Gabi fala e podem vazar pelo mic
  const isGabiEcho = (text) => {
    const low = (text || '').toLowerCase()
    const patterns = [
      'não peguei', 'nao peguei', 'meu amigo', 'meu chapa',
      'falou', 'tô aqui', 'to aqui', 'se precisar',
      'jm espetinhos', 'sou a gabi', 'sou gabi',
      'como é seu nome', 'como e seu nome', 'como que é o seu',
      'o que vai ser hoje', 'obrigada', 'obrigado',
      'mandei pra cozinha', 'mandou bem', 'boa pedida',
      'quer uma cervejinha', 'que tal', 'pode falar',
    ]
    return patterns.some(p => low.includes(p))
  }

  const listen = async (opts = {}) => {
    const { maxDuration = 10000, silenceTimeout = 2000, initialTimeout = 7000, beep = true } = opts
    if (beep) await playBeep(660, 0.1)
    // Extra buffer to avoid echo of Gabi's last audio
    await new Promise(r => setTimeout(r, 500))
    console.log('👂 LISTEN start')

    return new Promise((resolve) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SR) { console.warn('SR not supported'); resolve(''); return }
      stopCurrentRecognition()
      const rec = new SR()
      recRef.current = rec
      rec.lang = 'pt-BR'
      rec.interimResults = true
      rec.continuous = false
      let final = ''
      let lastInterim = ''   // fallback se não houver resultado final
      let gotAnyResult = false
      let silenceTimer = null
      let maxTimer = null
      let initialTimer = null
      const done = (val) => {
        clearTimeout(silenceTimer); clearTimeout(maxTimer); clearTimeout(initialTimer)
        try { rec.stop() } catch {}
        if (recRef.current === rec) recRef.current = null
        // Usa interim como fallback se não houve resultado final
        const result = (val || lastInterim).trim()
        // Filtro anti-eco: se o que "capturou" parece a própria Gabi, descarta
        if (result && isGabiEcho(result)) {
          console.log('🔕 LISTEN echo filtered:', result)
          window.__gabiEchoInListen = true
          resolve('')
          return
        }
        console.log('👂 LISTEN done:', JSON.stringify(result))
        resolve(result)
      }
      rec.onresult = (e) => {
        gotAnyResult = true
        clearTimeout(initialTimer)
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) final += t
          else interim += t
        }
        if (interim) lastInterim = interim
        setSubtitle(final || interim)
        // Reset silence timer on any result
        clearTimeout(silenceTimer)
        silenceTimer = setTimeout(() => done(final.trim()), silenceTimeout)
      }
      rec.onend = () => done(final.trim())
      rec.onerror = (e) => {
        console.warn('SpeechRecognition error:', e.error)
        // Retorna interim se houve algo capturado antes do erro
        done(final.trim())
      }
      setSubtitle('...')
      setStep('listening')
      try {
        rec.start()
        initialTimer = setTimeout(() => { if (!gotAnyResult) done('') }, initialTimeout)
        maxTimer = setTimeout(() => done(final.trim()), maxDuration)
      } catch (err) {
        console.error('rec.start error', err)
        done('')
      }
    })
  }

  // ── Capture frame from camera ──
  const captureFrame = () => {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c || v.readyState < 2) return null
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480
    c.getContext('2d').drawImage(v, 0, 0)
    return c.toDataURL('image/jpeg', 0.85)
  }

  // ── Chat backend ──
  const chat = async (userText) => {
    setStep('thinking')
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: userText,
          session_id: SESSION_ID,
          customer: customer?.name || null,
        }),
      })
      const d = await res.json()
      setCart(d.cart || [])
      setPhase(d.phase || 'ordering')
      // Expose current state to main loop (window flags for cross-async coordination)
      window.__gabiCurrentCartLength = (d.cart || []).length
      window.__gabiCurrentPhase = d.phase || 'ordering'
      if (d.customer) setCustomer({ name: d.customer })

      // Highlight last added item
      const addAction = (d.actions || []).slice().reverse().find(a => a.type === 'add')
      if (addAction) {
        setHighlightId(addAction.item_id)
        setTimeout(() => setHighlightId(null), 3000)
        // Cliente escolheu → fecha overlay do cardápio se aberto
        setShowMenuOverlay(null)
      }

      // Mentioned items pulse (Gabi falou sobre eles)
      if (d.mentioned && d.mentioned.length) {
        setMentionedIds(d.mentioned)
        setTimeout(() => setMentionedIds([]), 6000)
      }

      // Show menu overlay when Gabi opens the menu
      const menuAction = (d.actions || []).find(a => a.type === 'show_menu')
      console.log('📋 CHAT actions:', d.actions, 'menuAction:', menuAction)
      if (menuAction) {
        console.log('📋 OPENING menu — highlighting section')
        setShowMenuOverlay({ category: menuAction.category || '' })
        window.__gabiMenuJustOpened = true
        // Scroll suave até a seção do cardápio pra chamar atenção
        setTimeout(() => {
          const el = document.getElementById('menu-section')
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
        // Remove highlight depois de 5s
        setTimeout(() => setShowMenuOverlay(null), 5000)
      }

      // Auto-register face when Gabi learned the name for the first time
      const setNameAction = (d.actions || []).find(a => a.type === 'set_name')
      if (setNameAction && setNameAction.name) {
        const frame = captureFrame()
        if (frame) {
          fetch(`${API}/api/register-face`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: setNameAction.name, frame }),
          }).then(r => r.json()).then(rd => {
            console.log('Face registered:', rd)
          }).catch(err => console.error('Face register error:', err))
        }
      }

      if (d.confirmed_order) {
        setOrderId(d.confirmed_order.id)
        setConfirmedOrder(d.confirmed_order)
        setPrepTime(0)
        window.__gabiOrderConfirmed = true
      }
      // If echo detected on backend, propagate flag so main loop skips speak
      window.__gabiEchoIgnored = !!d.echo_ignored
      return d.reply
    } catch (e) {
      console.error(e)
      return 'Ops, tive um probleminha. Pode repetir?'
    }
  }

  // ── Reset session on server ──
  const resetSession = async () => {
    await fetch(`${API}/api/session/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: SESSION_ID }),
    })
    setCart([]); setPhase('greeting'); setCustomer(null); setOrderId(null); setConfirmedOrder(null); setPrepTime(0); setStep('idle'); setGabiText('Bem-vindo ao JM Espetinhos!')
  }

  // ── MAIN LOOP ──
  const sessionActiveRef = useRef(false)
  const stopBackgroundListener = () => {
    if (bgRecRef.current) {
      try { bgRecRef.current.onend = null } catch {}
      try { bgRecRef.current.onerror = null } catch {}
      try { bgRecRef.current.stop() } catch {}
      try { bgRecRef.current.abort() } catch {}
      bgRecRef.current = null
    }
  }

  const start = async () => {
    if (sessionActiveRef.current) return
    console.log('🚀 Starting session')
    sessionActiveRef.current = true

    // CRUCIAL: para o background listener ANTES de qualquer coisa
    stopBackgroundListener()
    stopCurrentRecognition()

    // Give the recognition engine time to fully release
    await new Promise(r => setTimeout(r, 400))

    try {
      await resetSession()

      // Unlock audio (needed for autoplay on first interaction)
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
        }
        if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume()
      } catch (e) { console.warn('audio unlock:', e) }

      // Identify face
    const frame = captureFrame()
    let greeting = 'Ê! Bem-vindo ao JM Espetinhos! Sou a Gabi. Como é seu nome, meu chapa?'
    let multiPeople = false
    let missCount = 0

    if (frame) {
      try {
        const idRes = await fetch(`${API}/api/identify-face`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frame }),
        })
        const idData = await idRes.json()
        multiPeople = (idData.n_faces || 0) > 1

        if (idData.ok && idData.status === 'known') {
          setCustomer({ name: idData.name, history: idData.history || [] })
          const last = idData.history?.[0]?.items?.join(', ')
          const multiPrefix = multiPeople ? 'Opa, tem mais gente aí! ' : ''
          greeting = last
            ? `${multiPrefix}Ê ${idData.name}, tá de volta! Da última foi ${last}. Repete ou vai ser diferente?`
            : `${multiPrefix}Opa ${idData.name}, que bom te ver! O que vai ser hoje?`

          await fetch(`${API}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: '(cliente chegou, foi reconhecido)',
              session_id: SESSION_ID,
              customer: idData.name,
            }),
          }).catch(() => {})
        } else if (multiPeople) {
          greeting = 'Ê, tem uma galera aí! Quem vai pedir? Fala teu nome, chapa!'
        }
      } catch {}
    }

    await speak(greeting)

    // Conversation loop — robusto, sempre progride
    let doneConfirmed = false
    let suggestedClose = false  // já sugeriu fechar 1x?
    for (let turn = 0; turn < 25 && sessionActiveRef.current; turn++) {
      // Cardápio aberto → mais tempo pro cliente ler
      const menuOpen = !!window.__gabiMenuJustOpened
      if (menuOpen) window.__gabiMenuJustOpened = false
      const userText = await listen({
        beep: turn > 0,
        initialTimeout: menuOpen ? 20000 : 6000,
        maxDuration: menuOpen ? 25000 : 10000,
      })

      // Echo filtrado → tenta de novo silencioso
      if (!userText && window.__gabiEchoInListen) {
        window.__gabiEchoInListen = false
        console.log('🔕 Echo filtered — silent retry')
        continue
      }

      if (!userText) {
        missCount++
        const hasItems = window.__gabiCurrentCartLength > 0

        // Se tem itens no carrinho E cliente ficou em silêncio, SUGERE FECHAR
        if (hasItems && !suggestedClose) {
          suggestedClose = true
          const reply = await chat('só isso')
          await speak(reply)
          continue
        }
        // Se JÁ está confirmando e cliente não respondeu, confirma automaticamente
        if (window.__gabiCurrentPhase === 'confirming' && hasItems && missCount === 1) {
          const reply = await chat('sim pode fechar')
          await speak(reply)
          if (window.__gabiOrderConfirmed) {
            window.__gabiOrderConfirmed = false
            doneConfirmed = true
            break
          }
          continue
        }

        if (missCount === 1) {
          // Ativa fallback de texto enquanto tenta ouvir de novo
          setTextFallback(true)
          await speak('Não peguei! Pode falar de novo ou digitar abaixo 👇')
          // Corrida: voz OU texto — o que chegar primeiro
          const textPromise = new Promise(resolve => { textResolveRef.current = resolve })
          const voiceText = await listen({ beep: false, initialTimeout: 12000, maxDuration: 12000 })
          if (voiceText) {
            // Voz funcionou — descarta aguardo de texto
            textResolveRef.current = null
            setTextFallback(false)
            missCount = 0
            const reply = await chat(voiceText)
            await speak(reply)
            if (window.__gabiOrderConfirmed) { doneConfirmed = true; break }
            continue
          }
          // Voz não veio — dá mais 5s pro usuário terminar de digitar
          const typed = await Promise.race([
            textPromise,
            new Promise(r => setTimeout(() => r(''), 5000)),
          ])
          textResolveRef.current = null
          setTextFallback(false)
          if (typed) {
            missCount = 0
            const reply = await chat(typed)
            await speak(reply)
            if (window.__gabiOrderConfirmed) { doneConfirmed = true; break }
            continue
          }
        } else {
          setTextFallback(false)
          await speak('Tô aqui se precisar, é só tocar!')
          break
        }
        continue
      }
      window.__gabiEchoInListen = false
      missCount = 0

      // Trigger LOCAL de menu (antes do chat backend responder)
      const userLow = userText.toLowerCase()
      const MENU_LOCAL = ['cardápio', 'cardapio', 'menu', 'quais opções', 'quais opcoes',
        'me mostra', 'o que voces tem', 'o que vocês tem', 'o que tem']
      if (MENU_LOCAL.some(t => userLow.includes(t))) {
        setShowMenuOverlay({ category: '' })
        window.__gabiMenuJustOpened = true
        setTimeout(() => {
          const el = document.getElementById('menu-section')
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }

      const reply = await chat(userText)
      if (window.__gabiEchoIgnored) {
        window.__gabiEchoIgnored = false
        continue
      }
      await speak(reply)

      // Pedido confirmado → sai
      if (window.__gabiOrderConfirmed) {
        window.__gabiOrderConfirmed = false
        doneConfirmed = true
        break
      }
    }
    } catch (err) {
      console.error('❌ Session error:', err)
    } finally {
      sessionActiveRef.current = false
      console.log('🛑 Session ended')
      // Wait longer to avoid echo from Gabi's own audio bleeding into mic
      setTimeout(() => {
        if (!confirmedOrder && !sessionActiveRef.current) {
          startBackgroundListener()
        }
      }, 3500)
    }
  }

  // ── TRIGGER PHRASE: escuta em background frases de ativação ──
  const bgRecRef = useRef(null)
  const [triggerHint, setTriggerHint] = useState(false)

  const startBackgroundListener = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    if (bgRecRef.current) return  // already running
    if (sessionActiveRef.current) return  // don't run during active session
    if (recRef.current) return  // active interactive recognition
    if (confirmedOrder) return  // ticket showing

    const rec = new SR()
    bgRecRef.current = rec
    rec.lang = 'pt-BR'
    rec.interimResults = true
    rec.continuous = true

    const TRIGGERS = [
      'quero fazer um pedido', 'quero fazer pedido', 'fazer um pedido',
      'quero pedir', 'oi gabi', 'olá gabi', 'oi gabby',
      'quero um espetinho', 'quero pedir algo', 'atendimento',
      'ei gabi', 'oi gabi', 'olá gabi',
    ]
    // Filtros de eco: frases que Gabi mesma fala, não devem disparar
    const ECHO_FILTERS = [
      'falou', 'tô aqui', 'to aqui', 'se precisar',
      'jm espetinhos', 'sou a gabi', 'seu nome',
      'meu amigo', 'meu chapa', 'mandou bem',
      'obrigada', 'obrigado', 'fechou',
    ]

    let recognized = false
    rec.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript + ' '
      }
      const low = text.toLowerCase()
      // Skip if it's an echo of Gabi's own voice
      if (ECHO_FILTERS.some(f => low.includes(f))) {
        console.log('🔕 Ignoring echo:', low.trim())
        return
      }
      const matched = TRIGGERS.some(t => low.includes(t))
      if (matched && !recognized) {
        recognized = true
        console.log('🎙️ Trigger phrase detected:', low)
        try { rec.stop() } catch {}
        bgRecRef.current = null
        start()
      }
    }
    rec.onend = () => {
      bgRecRef.current = null
      // Auto-restart if still idle
      if (!sessionActiveRef.current && !confirmedOrder) {
        setTimeout(() => startBackgroundListener(), 500)
      }
    }
    rec.onerror = (e) => {
      console.warn('bg rec error:', e.error)
      bgRecRef.current = null
      if (e.error === 'not-allowed') {
        setTriggerHint(true)  // need user gesture
      } else {
        // Restart on transient errors
        setTimeout(() => startBackgroundListener(), 1000)
      }
    }
    try {
      rec.start()
    } catch (err) {
      console.warn('bg rec start error:', err)
      bgRecRef.current = null
      setTriggerHint(true)
    }
  }, [confirmedOrder])

  // Start background listener when idle (only on confirmedOrder change)
  useEffect(() => {
    if (confirmedOrder) {
      // Stop bg listener while ticket is shown
      stopBackgroundListener()
      return
    }
    // Start after slight delay to let previous rec release
    const t = setTimeout(() => {
      if (!sessionActiveRef.current) startBackgroundListener()
    }, 800)
    return () => clearTimeout(t)
  }, [confirmedOrder, startBackgroundListener])

  // ── AUTO-RESET: after order confirmed + face gone → reset for next customer ──
  useEffect(() => {
    if (!confirmedOrder) return
    let cleared = false
    const iv = setInterval(() => {
      // If no engagement for 30s after order done, auto-reset
      if (!engagedSinceRef.current && !presenceDetected) {
        if (!cleared) {
          cleared = true
          setTimeout(() => {
            resetSession()
          }, 30000)
        }
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [confirmedOrder, presenceDetected])

  // ── AUTO-START: person standing in front for 3s → show "Toque" button (user gesture) ──
  const [showTouchBtn, setShowTouchBtn] = useState(false)
  useEffect(() => {
    const iv = setInterval(() => {
      if (sessionActiveRef.current) { setShowTouchBtn(false); return }
      if (confirmedOrder) { setShowTouchBtn(false); return }
      if (!engagedSinceRef.current) { setShowTouchBtn(false); return }
      const elapsed = Date.now() - engagedSinceRef.current
      if (elapsed >= 3000) {
        setShowTouchBtn(true)  // mostra botão — NÃO auto-start (precisa de user gesture pro mic)
      }
    }, 500)
    return () => clearInterval(iv)
  }, [confirmedOrder])  // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback de texto quando voz falha
  const [textFallback, setTextFallback] = useState(false)
  const [textInput, setTextInput] = useState('')
  const textResolveRef = useRef(null)

  const listenOrText = async (opts = {}) => {
    setTextFallback(false)
    const result = await listen(opts)
    return result
  }

  const total = cart.reduce((a, c) => a + c.price * c.qty, 0)
  const grouped = menu.reduce((acc, it) => {
    (acc[it.category] = acc[it.category] || []).push(it); return acc
  }, {})

  return (
    <div className="tv">
      {/* Header */}
      <header className="tv-header">
        <div className="brand">
          <div className="logo">
            <img src="/jm/logo.jpg" alt="JM" onError={(e)=>{e.currentTarget.style.display='none'; e.currentTarget.nextElementSibling.style.display='inline-flex'}} />
            <span className="logo-fallback"><Flame size={34} color="#f97316" /></span>
          </div>
          <div>
            <div className="brand-name">JM ESPETINHOS</div>
            <div className="brand-sub">& Assados</div>
          </div>
        </div>
        <div className="cam-mini">
          <video ref={videoRef} autoPlay playsInline muted style={{ transform: 'scaleX(-1)' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className={`presence ${presenceDetected ? 'on' : ''}`}>
            {presenceDetected
              ? (facesCount > 1 ? `👥 ${facesCount} PESSOAS` : '● PRESENTE')
              : '○ AGUARDANDO'}
          </div>
        </div>
      </header>

      {/* Progress bar */}
      {!confirmedOrder && sessionActiveRef.current && (
        <div className="progress-bar">
          <div className={`pb-step ${['ordering','confirming','done'].includes(phase) ? 'done' : 'active'}`}>
            <span className="pb-dot" />1. NOME
          </div>
          <div className={`pb-step ${phase === 'ordering' ? 'active' : phase === 'confirming' || phase === 'done' ? 'done' : ''}`}>
            <span className="pb-dot" />2. PEDIDO
          </div>
          <div className={`pb-step ${phase === 'confirming' ? 'active' : phase === 'done' ? 'done' : ''}`}>
            <span className="pb-dot" />3. CONFIRMAR
          </div>
        </div>
      )}

      {/* Split: Gabi (esquerda) | Cardápio (direita) */}
      <div className="main-split">
      {/* Stage */}
      <section className="stage">
        {(() => {
          const mood = confirmedOrder ? 'confirmed'
            : isSpeaking ? 'speaking'
            : step === 'listening' ? 'listening'
            : presenceDetected ? 'noticed'
            : 'idle'
          const fb = <GabiAvatar isSpeaking={isSpeaking} amplitude={amplitude} mood={mood} />
          if (avatarMode === 'photo') {
            return (
              <React.Suspense fallback={fb}>
                <AvatarPhoto isSpeaking={isSpeaking} amplitude={amplitude} mood={mood} />
              </React.Suspense>
            )
          }
          if (avatarMode === 'video') {
            return (
              <React.Suspense fallback={fb}>
                <AvatarVideo isSpeaking={isSpeaking} amplitude={amplitude} mood={mood} />
              </React.Suspense>
            )
          }
          return fb
        })()}
        <div className="speech-box">
          <div className="speech-label">
            {step === 'listening' && <><Mic size={14} /> ESCUTANDO...</>}
            {step === 'thinking' && <>🧠 PENSANDO...</>}
            {step === 'speaking' && <><Volume2 size={14} /> FALANDO</>}
            {step === 'idle' && !confirmedOrder && (showTouchBtn ? '👆 TOQUE PARA COMEÇAR!' : presenceDetected ? '👁️ TE VEI...' : '💬 CHEGA PRA FALAR COMIGO')}
            {phase === 'confirming' && step !== 'speaking' && <>⚠️ CONFIRME O PEDIDO</>}
            {phase === 'done' && orderId && <>✅ SENHA #{orderId}</>}
          </div>
          <div className="speech-text">{gabiText}</div>
          {subtitle && step === 'listening' && (
            <div className="subtitle">"{subtitle}"</div>
          )}
        </div>

        {/* GIGANTE "FALA AGORA" enquanto escutando */}
        {step === 'listening' && (
          <div className="listen-badge">
            <div className="lb-icon">🎙️</div>
            <div className="lb-text">FALA AGORA!</div>
            <div className="lb-sub">{subtitle || 'Estou te ouvindo...'}</div>
          </div>
        )}

        {/* Botão de toque — aparece quando câmera detecta presença por 3s */}
        {showTouchBtn && !sessionActiveRef.current && !confirmedOrder && (
          <div
            className="trigger-hint touch-pulse"
            style={{ cursor: 'pointer', animation: 'pulse-border 1s infinite' }}
            onClick={async () => {
              setShowTouchBtn(false)
              try {
                if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
                if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume()
              } catch {}
              start()
            }}
          >
            <div className="th-mic" style={{ fontSize: 52, animation: 'bounce 0.7s infinite alternate' }}>👆</div>
            <div className="th-text">
              <div className="th-line1" style={{ fontSize: 22, fontWeight: 900, color: '#f97316' }}>OI! TE VEI AQUI!</div>
              <div className="th-line2" style={{ fontSize: 18, color: '#fbbf24' }}>TOQUE AQUI PARA COMEÇAR</div>
              <div className="th-hint">ou diga: "oi Gabi" / "quero fazer um pedido"</div>
            </div>
          </div>
        )}

        {/* Trigger phrase hint (idle mode, sem presença detectada) */}
        {!showTouchBtn && !sessionActiveRef.current && !confirmedOrder && !isSpeaking && step === 'idle' && (
          <div className="trigger-hint" onClick={async () => {
            try {
              if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
              if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume()
            } catch {}
            start()
          }}>
            <div className="th-mic">🎙️</div>
            <div className="th-text">
              <div className="th-line1">Diga em voz alta:</div>
              <div className="th-line2">"Oi Gabi" ou "Quero pedir"</div>
              <div className="th-hint">ou toque aqui para começar</div>
            </div>
          </div>
        )}

        {/* Fallback de texto quando voz não funciona */}
        {textFallback && sessionActiveRef.current && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 999, display: 'flex', gap: 8, alignItems: 'center',
            background: 'rgba(0,0,0,.85)', border: '2px solid #f97316',
            borderRadius: 16, padding: '12px 16px', minWidth: 340,
          }}>
            <span style={{ fontSize: 20 }}>⌨️</span>
            <input
              autoFocus
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && textInput.trim()) {
                  const val = textInput.trim()
                  setTextInput('')
                  setTextFallback(false)
                  if (textResolveRef.current) { textResolveRef.current(val); textResolveRef.current = null }
                }
              }}
              placeholder="Digite aqui seu nome ou pedido..."
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#fef3c7', fontSize: 16, fontFamily: 'inherit',
              }}
            />
            <button
              onClick={() => {
                const val = textInput.trim()
                if (!val) return
                setTextInput('')
                setTextFallback(false)
                if (textResolveRef.current) { textResolveRef.current(val); textResolveRef.current = null }
              }}
              style={{
                background: '#f97316', border: 'none', borderRadius: 8,
                color: '#fff', fontWeight: 900, fontSize: 14, padding: '8px 14px', cursor: 'pointer',
              }}
            >Enviar</button>
          </div>
        )}

      </section>

      {/* Menu section — sempre visível */}
      <section id="menu-section" className={`menu-section ${showMenuOverlay ? 'pulse-highlight' : ''}`}>
        <div className={`cart-line ${phase === 'confirming' ? 'confirm' : ''}`}>
          {cart.length === 0 ? (
            <span className="cart-empty">Nenhum item ainda</span>
          ) : (
            <>
              <div className="cart-items">
                {cart.map(c => (
                  <span key={c.id} className="cart-chip">{c.qty}× {c.image} {c.name}</span>
                ))}
              </div>
              <div className="cart-total">R$ {total.toFixed(2)}</div>
            </>
          )}
        </div>

        <div className="menu-grid">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="cat-block">
              <div className="cat-title">{cat}</div>
              {items.map(it => (
                <div key={it.id} className={`menu-item ${highlightId === it.id ? 'pop' : ''} ${mentionedIds.includes(it.id) && !cart.find(c => c.id === it.id) ? 'mentioned' : ''} ${cart.find(c => c.id === it.id) ? 'in-cart' : ''}`}>
                  {it.thumb || it.photo ? (
                    <img className="mi-photo" src={it.thumb || it.photo} alt={it.name}
                      onError={(e)=>{e.currentTarget.style.display='none'; e.currentTarget.nextElementSibling.style.display='inline-block'}} />
                  ) : null}
                  <span className="mi-emoji" style={{display: (it.thumb||it.photo) ? 'none' : 'inline-block'}}>{it.image}</span>
                  <div className="mi-body">
                    <div className="mi-name">{it.name}</div>
                    <div className="mi-price">R$ {it.price.toFixed(2)}</div>
                  </div>
                  {cart.find(c => c.id === it.id) && (
                    <div className="mi-qty">{cart.find(c => c.id === it.id).qty}×</div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
      </div>{/* /main-split */}

      {/* Total sticky + Botão FINALIZAR gigante (quando tem itens) */}
      {!confirmedOrder && cart.length > 0 && (
        <div className="finalize-bar">
          <div className="fb-total">
            <div className="fb-label">TOTAL</div>
            <div className="fb-value">R$ {total.toFixed(2).replace('.', ',')}</div>
          </div>
          <button
            className="fb-finalize"
            onClick={async () => {
              // Envia "manda pra cozinha" pro backend pra confirmar
              const reply = await chat('manda pra cozinha')
              await speak(reply)
            }}
          >
            <CheckCircle2 size={22} /> FINALIZAR PEDIDO
          </button>
        </div>
      )}

      {/* Cardápio é permanente no menu-section abaixo — quando show_menu dispara, apenas destaca */}

      {/* Ticket overlay when order confirmed */}
      {confirmedOrder && (
        <div className="ticket-overlay">
          <div className="ticket">
            <div className="tk-header">
              <Flame size={30} color="#f97316" />
              <div>
                <div className="tk-brand">JM ESPETINHOS</div>
                <div className="tk-sub">Comanda Digital</div>
              </div>
            </div>

            <div className="tk-senha">
              <div className="tk-senha-label">SUA SENHA</div>
              <div className="tk-senha-num">#{confirmedOrder.id.toUpperCase()}</div>
            </div>

            <div className="tk-customer">
              {customer?.name ? `${customer.name}, ` : ''}seu pedido tá saindo!
            </div>

            <div className="tk-items">
              {confirmedOrder.items.map((it, i) => (
                <div key={i} className="tk-item">
                  <span className="tk-qty">{it.qty}×</span>
                  <span className="tk-name">{it.name}</span>
                  <span className="tk-price">R$ {(it.price * it.qty).toFixed(2).replace('.', ',')}</span>
                </div>
              ))}
            </div>

            <div className="tk-total">
              <span>TOTAL</span>
              <span>R$ {confirmedOrder.total.toFixed(2).replace('.', ',')}</span>
            </div>

            <div className="tk-timer">
              <Clock size={20} />
              <div>
                <div className="tk-timer-label">EM PREPARO</div>
                <div className="tk-timer-value">
                  {Math.floor(prepTime / 60).toString().padStart(2, '0')}:{(prepTime % 60).toString().padStart(2, '0')}
                </div>
                <div className="tk-eta">Estimado: 12–15 min</div>
              </div>
            </div>

            <div className="tk-qr">
              <QRCodeSVG value={`JM-${confirmedOrder.id}`} size={110} bgColor="#0a0604" fgColor="#f97316" />
              <div className="tk-qr-label">Retire com essa senha no balcão</div>
            </div>

            <button className="tk-new" onClick={resetSession}>
              <CheckCircle2 size={20} /> NOVO PEDIDO
            </button>
          </div>
        </div>
      )}

      <style>{`
        html, body, #root { margin: 0; padding: 0; height: 100vh; overflow: hidden; }
        .tv {
          height: 100vh;
          width: 100vw;
          background:
            radial-gradient(ellipse at top, rgba(249,115,22,0.15) 0%, transparent 50%),
            linear-gradient(180deg, #1a0f08 0%, #0a0604 50%, #1a0f08 100%);
          color: #fef3c7;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* HEADER — compacto */
        .tv-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 14px;
          background: linear-gradient(180deg, rgba(120,53,15,0.5) 0%, rgba(0,0,0,0.6) 100%);
          border-bottom: 2px solid rgba(249,115,22,0.4);
          min-height: 56px;
        }
        .brand { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
        .logo { display: flex; flex-shrink: 0; align-items: center; }
        .logo img { width: 44px; height: 44px; object-fit: cover; border-radius: 10px; border: 2px solid rgba(249,115,22,0.6); box-shadow: 0 0 12px rgba(249,115,22,0.35); }
        .logo-fallback { display: none; }
        .brand-name { font-weight: 900; font-size: 16px; letter-spacing: 2px; color: #f97316; text-shadow: 0 0 10px rgba(249,115,22,0.5); white-space: nowrap; }
        .brand-sub { font-size: 10px; color: #fbbf24; letter-spacing: 4px; text-transform: uppercase; }
        .cam-mini {
          position: relative;
          width: 80px; height: 60px;
          border-radius: 10px;
          overflow: hidden;
          border: 2px solid rgba(249,115,22,0.5);
          box-shadow: 0 0 10px rgba(249,115,22,0.3);
          flex-shrink: 0;
        }
        .cam-mini video { width: 100%; height: 100%; object-fit: cover; }
        .presence {
          position: absolute; bottom: 4px; left: 4px;
          font-size: 9px; padding: 2px 6px; border-radius: 4px;
          background: rgba(0,0,0,0.7); color: #94a3b8; letter-spacing: 1px;
        }
        .presence.on { color: #22c55e; }

        /* PROGRESS BAR */
        .progress-bar {
          display: flex; justify-content: space-around; align-items: center;
          padding: 8px 12px;
          background: rgba(0,0,0,0.4);
          border-bottom: 1px solid rgba(249,115,22,0.2);
          gap: 8px;
        }
        .pb-step {
          display: flex; align-items: center; gap: 6px;
          font-size: 10px; letter-spacing: 2px; font-weight: 800;
          color: #475569;
          transition: color 0.3s;
        }
        .pb-step.active { color: #fbbf24; }
        .pb-step.done { color: #22c55e; }
        .pb-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 8px currentColor;
        }
        .pb-step.active .pb-dot { animation: pbPulse 1s ease-in-out infinite; }
        @keyframes pbPulse { 50% { transform: scale(1.4); } }

        /* SPLIT — Gabi esquerda, cardápio direita (mesma tela) */
        .main-split {
          flex: 1;
          display: flex;
          flex-direction: row;
          min-height: 0;
          overflow: hidden;
        }

        /* STAGE — compacto, deixa espaço pro cardápio */
        .stage {
          flex: 5;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px 10px;
          position: relative;
          min-height: 0;
          overflow: hidden;
        }
        @media (max-width: 900px) {
          .main-split { flex-direction: column; }
          .stage { flex: 1; max-height: 60vh; }
        }
        /* Gabi 3D avatar styles are in GabiAvatar.jsx */

        .speech-box {
          background: rgba(20,10,4,0.9);
          border: 1px solid rgba(249,115,22,0.4);
          border-radius: 16px;
          padding: 10px 20px;
          max-width: 96%;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .speech-label {
          font-size: 9px; letter-spacing: 3px; color: #f97316;
          display: inline-flex; align-items: center; gap: 6px;
          margin-bottom: 4px; font-weight: 800;
        }
        .speech-text { font-size: 17px; font-weight: 600; line-height: 1.3; color: #fef3c7; }
        .subtitle { margin-top: 8px; font-size: 13px; color: #fbbf24; font-style: italic; opacity: 0.85; }

        /* TRIGGER HINT */
        .trigger-hint {
          display: flex;
          align-items: center;
          gap: 16px;
          background: linear-gradient(135deg, rgba(249,115,22,0.25), rgba(220,38,38,0.2));
          border: 2px solid #f97316;
          padding: 18px 28px;
          border-radius: 20px;
          cursor: pointer;
          box-shadow: 0 10px 40px rgba(249,115,22,0.4);
          animation: bob 2s ease-in-out infinite;
          max-width: 90%;
        }
        .th-mic {
          font-size: 44px;
          animation: micPulse 1.5s ease-in-out infinite;
        }
        @keyframes micPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        @keyframes bounce { 0% { transform: translateY(0); } 100% { transform: translateY(-10px); } }
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,.7), 0 10px 40px rgba(249,115,22,0.4); border-color: #f97316; }
          50% { box-shadow: 0 0 0 12px rgba(249,115,22,0), 0 10px 40px rgba(249,115,22,0.6); border-color: #fbbf24; }
        }
        .touch-pulse { animation: pulse-border 1s ease-in-out infinite !important; }
        .th-text { display: flex; flex-direction: column; gap: 3px; }
        .th-line1 { font-size: 12px; letter-spacing: 3px; color: #fbbf24; font-weight: 800; text-transform: uppercase; }
        .th-line2 { font-size: 22px; font-weight: 900; color: #fef3c7; }
        .th-hint { font-size: 11px; color: #94a3b8; letter-spacing: 2px; margin-top: 4px; }

        /* LISTEN BADGE — pequeno, não bloqueia menu */
        .listen-badge {
          position: absolute;
          top: 8px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #22c55e, #059669);
          color: #000;
          padding: 6px 16px; border-radius: 999px;
          box-shadow: 0 4px 12px rgba(34,197,94,0.5);
          animation: listenPulse 1s ease-in-out infinite;
          z-index: 40;
        }
        @keyframes listenPulse {
          0%, 100% { box-shadow: 0 4px 12px rgba(34,197,94,0.5); }
          50% { box-shadow: 0 6px 24px rgba(34,197,94,0.9); }
        }
        .lb-icon { font-size: 18px; }
        .lb-text { font-size: 13px; font-weight: 900; letter-spacing: 2px; }
        .lb-sub { display: none; }

        .debug-tts {
          position: absolute; top: 12px; right: 12px;
          background: rgba(0,0,0,0.7); color: #fbbf24;
          border: 1px solid rgba(251,191,36,0.4);
          padding: 6px 12px; border-radius: 999px;
          font-size: 11px; letter-spacing: 1px; font-weight: 700;
          cursor: pointer; z-index: 50;
        }
        .debug-tts:hover { background: #fbbf24; color: #000; }

        .fixed-menu-btn {
          position: absolute; top: 12px; left: 12px;
          background: linear-gradient(135deg, #f97316, #dc2626);
          color: #fff; border: none;
          padding: 10px 18px; border-radius: 999px;
          font-size: 14px; letter-spacing: 2px; font-weight: 900;
          cursor: pointer; z-index: 50;
          box-shadow: 0 4px 12px rgba(249,115,22,0.4);
          animation: bob 2s ease-in-out infinite;
        }
        .fixed-menu-btn:hover { transform: scale(1.05); }

        .tap-btn {
          background: linear-gradient(135deg, #f97316, #dc2626);
          color: #fff; border: none;
          padding: 20px 40px; border-radius: 999px;
          font-size: 20px; font-weight: 800; letter-spacing: 2px;
          display: flex; align-items: center; gap: 12px;
          cursor: pointer;
          box-shadow: 0 10px 40px rgba(249,115,22,0.6);
          animation: bob 2s ease-in-out infinite;
        }
        .tap-btn.secondary {
          background: linear-gradient(135deg, #22c55e, #059669);
          box-shadow: 0 10px 40px rgba(34,197,94,0.5);
        }
        @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

        /* MENU */
        .menu-section {
          flex: 7;   /* 7/12 da largura no split (side-by-side) */
          background: rgba(0,0,0,0.55);
          border-left: 4px solid #f97316;
          padding: 12px 16px 100px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: hidden;
          min-height: 0;
        }
        @media (max-width: 900px) {
          .menu-section {
            flex: 3;
            border-left: none;
            border-top: 4px solid #f97316;
          }
        }
        .menu-section.pulse-highlight {
          animation: menuBoxPulse 0.6s ease-in-out 5;
          border-top-color: #fbbf24;
        }
        @keyframes menuBoxPulse {
          0%, 100% { background: rgba(0,0,0,0.55); box-shadow: inset 0 0 0 rgba(251,191,36,0); }
          50% { background: rgba(251,191,36,0.15); box-shadow: inset 0 0 60px rgba(251,191,36,0.5); }
        }
        .cart-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(34,197,94,0.12);
          border: 1px solid rgba(34,197,94,0.35);
          padding: 10px 16px;
          border-radius: 12px;
          min-height: 44px;
          transition: all 0.3s;
        }
        .cart-line.confirm {
          background: rgba(251,191,36,0.2);
          border-color: #fbbf24;
          animation: warn 1s ease-in-out infinite;
        }
        @keyframes warn { 0%,100% { box-shadow: 0 0 0 rgba(251,191,36,0); } 50% { box-shadow: 0 0 20px rgba(251,191,36,0.5); } }
        .cart-empty { color: #64748b; font-size: 14px; }
        .cart-items { display: flex; gap: 6px; flex-wrap: wrap; }
        .cart-chip {
          background: rgba(34,197,94,0.25);
          padding: 4px 10px; border-radius: 999px;
          font-size: 13px; color: #86efac; font-weight: 700;
        }
        .cart-total { font-size: 22px; font-weight: 900; color: #22c55e; }

        .menu-grid {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          overflow-y: auto;
          padding: 4px;
        }
        .cat-block { display: flex; flex-direction: column; gap: 8px; }
        .cat-title {
          font-size: 13px; letter-spacing: 4px; color: #f97316; font-weight: 900;
          padding: 8px 6px; border-bottom: 2px solid rgba(249,115,22,0.35);
          text-transform: uppercase;
        }
        .menu-item {
          display: flex; align-items: center; gap: 12px;
          background: rgba(41,25,15,0.7);
          border: 1px solid rgba(120,53,15,0.4);
          padding: 12px 14px; border-radius: 12px;
          transition: all 0.3s;
          position: relative;
        }
        .menu-item.in-cart {
          background: rgba(34,197,94,0.15);
          border-color: rgba(34,197,94,0.4);
        }
        .menu-item.pop {
          background: rgba(249,115,22,0.3);
          border-color: #f97316;
          transform: scale(1.05);
          box-shadow: 0 0 25px rgba(249,115,22,0.6);
        }
        .menu-item.mentioned {
          border-color: #fbbf24;
          background: rgba(251,191,36,0.15);
          animation: mentionedPulse 1.2s ease-in-out infinite;
        }
        @keyframes mentionedPulse {
          0%, 100% { box-shadow: 0 0 0 rgba(251,191,36,0); }
          50% { box-shadow: 0 0 24px rgba(251,191,36,0.6); }
        }
        .mi-emoji { font-size: 30px; }
        .mi-photo {
          width: 52px; height: 52px; object-fit: cover;
          border-radius: 10px;
          border: 1px solid rgba(249,115,22,0.35);
          flex-shrink: 0;
        }
        .mi-body { flex: 1; min-width: 0; }
        .mi-name { font-size: 15px; font-weight: 700; color: #fef3c7; line-height: 1.2; }
        .mi-price { font-size: 14px; color: #fbbf24; font-weight: 800; margin-top: 2px; }
        .mi-qty {
          background: #22c55e; color: #000; padding: 4px 10px;
          border-radius: 999px; font-size: 14px; font-weight: 900;
        }

        /* FINALIZAR BAR — total + botão de finalizar gigante */
        .finalize-bar {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.95));
          backdrop-filter: blur(12px);
          border-top: 3px solid #22c55e;
          padding: 14px 20px;
          display: flex; align-items: center; gap: 14px;
          z-index: 150;
          box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
        }
        .fb-total {
          display: flex; flex-direction: column; align-items: flex-start;
          color: #22c55e; padding: 0 6px;
        }
        .fb-label { font-size: 10px; letter-spacing: 3px; opacity: 0.7; }
        .fb-value { font-size: 28px; font-weight: 900; }
        .fb-finalize {
          flex: 1;
          background: linear-gradient(135deg, #22c55e, #059669);
          color: #000; border: none;
          padding: 18px; border-radius: 14px;
          font-size: 18px; font-weight: 900; letter-spacing: 3px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(34,197,94,0.5);
          animation: finalPulse 2s ease-in-out infinite;
        }
        .fb-finalize:hover { transform: scale(1.02); }
        @keyframes finalPulse {
          0%, 100% { box-shadow: 0 8px 24px rgba(34,197,94,0.5); }
          50% { box-shadow: 0 12px 36px rgba(34,197,94,0.9); }
        }

        /* MENU OVERLAY — só na parte inferior, não cobre a Gabi */
        .menu-overlay {
          position: fixed;
          left: 0; right: 0; bottom: 0;
          height: 62vh;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(6px);
          display: flex; align-items: flex-end; justify-content: center;
          z-index: 180; padding: 0;
          animation: fadeInBottom 0.3s ease;
        }
        @keyframes fadeInBottom {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .menu-panel {
          background: linear-gradient(180deg, #1a0f08 0%, #0a0604 100%);
          border: 3px solid #f97316;
          border-top-left-radius: 24px;
          border-top-right-radius: 24px;
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          padding: 18px 22px;
          width: 100%;
          max-width: 780px;
          max-height: 100%;
          overflow-y: auto;
          box-shadow: 0 -20px 60px rgba(249,115,22,0.4);
          animation: slideUpMenu 0.35s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes slideUpMenu {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .mo-header {
          display: flex; align-items: center; gap: 14px;
          padding-bottom: 14px;
          border-bottom: 2px dashed rgba(249,115,22,0.4);
          margin-bottom: 16px;
          position: relative;
        }
        .mo-title { font-size: 26px; font-weight: 900; color: #f97316; letter-spacing: 4px; }
        .mo-sub { font-size: 13px; color: #fbbf24; margin-top: 2px; }
        .mo-close {
          position: absolute; right: 0; top: 0;
          background: rgba(249,115,22,0.15); color: #f97316;
          border: 1px solid rgba(249,115,22,0.4);
          width: 36px; height: 36px; border-radius: 999px;
          font-size: 22px; font-weight: 900; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .mo-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .mo-cat.highlighted {
          background: rgba(249,115,22,0.1);
          border-radius: 12px; padding: 8px;
          box-shadow: 0 0 20px rgba(249,115,22,0.35);
        }
        .mo-cat-title {
          font-size: 14px; font-weight: 900; letter-spacing: 3px;
          color: #f97316; padding: 8px 0;
          border-bottom: 1px solid rgba(249,115,22,0.3);
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .mo-items { display: flex; flex-direction: column; gap: 6px; }
        .mo-item {
          display: flex; align-items: center; gap: 10px;
          background: rgba(41,25,15,0.7);
          border: 1px solid rgba(120,53,15,0.4);
          padding: 10px 12px; border-radius: 10px;
        }
        .mo-item.in { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.5); }
        .mo-emoji { font-size: 28px; }
        .mo-item-body { flex: 1; }
        .mo-item-name { font-size: 15px; font-weight: 700; color: #fef3c7; }
        .mo-item-price { font-size: 14px; color: #fbbf24; font-weight: 800; margin-top: 2px; }
        .mo-item-qty {
          background: #22c55e; color: #000; padding: 4px 10px;
          border-radius: 999px; font-size: 14px; font-weight: 900;
        }

        /* TICKET OVERLAY */
        .ticket-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          z-index: 200; padding: 20px;
          animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .ticket {
          background: linear-gradient(180deg, #1a0f08 0%, #0a0604 100%);
          border: 2px solid #f97316;
          border-radius: 24px;
          padding: 24px 26px;
          max-width: 420px;
          width: 100%;
          max-height: 92vh;
          overflow-y: auto;
          box-shadow: 0 25px 60px rgba(249,115,22,0.4);
          animation: slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .tk-header {
          display: flex; align-items: center; gap: 12px;
          padding-bottom: 16px;
          border-bottom: 2px dashed rgba(249,115,22,0.3);
          margin-bottom: 18px;
        }
        .tk-brand { font-size: 20px; font-weight: 900; letter-spacing: 3px; color: #f97316; }
        .tk-sub { font-size: 10px; letter-spacing: 3px; color: #fbbf24; }

        .tk-senha {
          text-align: center;
          background: linear-gradient(135deg, rgba(249,115,22,0.2), rgba(220,38,38,0.2));
          border: 2px solid #f97316;
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .tk-senha-label { font-size: 11px; letter-spacing: 4px; color: #fbbf24; font-weight: 800; }
        .tk-senha-num {
          font-size: 46px; font-weight: 900; color: #f97316;
          letter-spacing: 4px; margin-top: 4px;
          text-shadow: 0 0 20px rgba(249,115,22,0.7);
          font-family: 'Courier New', monospace;
        }
        .tk-customer {
          text-align: center; color: #fef3c7;
          font-size: 16px; margin-bottom: 16px; font-weight: 600;
        }
        .tk-items {
          background: rgba(0,0,0,0.4);
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 12px;
        }
        .tk-item {
          display: grid;
          grid-template-columns: 40px 1fr auto;
          gap: 8px;
          padding: 6px 0;
          font-size: 14px;
          color: #fef3c7;
          border-bottom: 1px dashed rgba(148,163,184,0.15);
        }
        .tk-item:last-child { border-bottom: none; }
        .tk-qty { color: #fbbf24; font-weight: 800; }
        .tk-price { color: #22c55e; font-weight: 700; }

        .tk-total {
          display: flex; justify-content: space-between; align-items: center;
          background: rgba(34,197,94,0.15);
          border: 1px solid rgba(34,197,94,0.4);
          border-radius: 12px;
          padding: 14px 18px;
          font-size: 20px; font-weight: 900;
          color: #22c55e;
          margin-bottom: 14px;
        }
        .tk-timer {
          display: flex; align-items: center; gap: 14px;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.3);
          border-radius: 12px;
          padding: 12px 16px;
          margin-bottom: 14px;
          color: #fbbf24;
        }
        .tk-timer-label { font-size: 10px; letter-spacing: 3px; opacity: 0.8; }
        .tk-timer-value {
          font-size: 28px; font-weight: 900;
          font-family: 'Courier New', monospace;
          color: #fbbf24;
        }
        .tk-eta { font-size: 12px; opacity: 0.7; }

        .tk-qr {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 14px;
          background: rgba(0,0,0,0.4);
          border-radius: 12px;
          margin-bottom: 14px;
        }
        .tk-qr-label { font-size: 11px; color: #94a3b8; letter-spacing: 2px; }
        .tk-new {
          width: 100%;
          background: linear-gradient(135deg, #22c55e, #059669);
          color: #000; border: none;
          padding: 16px; border-radius: 12px;
          font-size: 16px; font-weight: 900; letter-spacing: 2px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(34,197,94,0.4);
        }
      `}</style>
    </div>
  )
}
