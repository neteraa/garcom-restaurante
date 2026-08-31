import React, { useEffect, useRef, useState } from 'react'

/**
 * AvatarVideo — atendente REAL via clipes de vídeo.
 *
 * Coloque os arquivos em: frontend/public/videos/human/
 *   - idle.mp4       (pessoa parada olhando pra câmera — loop)
 *   - speaking.mp4   (pessoa falando — loop)
 *   - wave.mp4       (pessoa acenando — toca 1x quando cliente detectado)
 *   - thumbsup.mp4   (pessoa fazendo joia — toca 1x quando pedido confirmado)
 *   - listening.mp4  (opcional: pessoa atenta escutando)
 *
 * Fallback: se algum clipe não existir, cai pro idle. Se NENHUM existir,
 * mostra placeholder e sinaliza pra usar o SVG (?2d=1).
 *
 * Mesma interface do GabiAvatar: isSpeaking, amplitude, mood.
 */

const CLIPS = {
  idle:      '/videos/human/idle.mp4',
  speaking:  '/videos/human/speaking.mp4',
  noticed:   '/videos/human/wave.mp4',
  confirmed: '/videos/human/thumbsup.mp4',
  listening: '/videos/human/listening.mp4',
}

// mood → { src, loop, fallback }
const MOOD_MAP = {
  idle:      { src: CLIPS.idle,      loop: true },
  speaking:  { src: CLIPS.speaking,  loop: true,  fb: CLIPS.idle },
  noticed:   { src: CLIPS.noticed,   loop: false, fb: CLIPS.idle },
  confirmed: { src: CLIPS.confirmed, loop: false, fb: CLIPS.idle },
  listening: { src: CLIPS.listening, loop: true,  fb: CLIPS.idle },
}

export default function AvatarVideo({ isSpeaking = false, amplitude = 0, mood = 'idle' }) {
  const vidRef = useRef(null)
  const [currentSrc, setCurrentSrc] = useState(CLIPS.idle)
  const [missing, setMissing] = useState({})   // { src: true } se 404
  const [allMissing, setAllMissing] = useState(false)

  // Detecta se pelo menos o idle.mp4 existe (Vite SPA fallback responde 200+html, validar content-type)
  useEffect(() => {
    fetch(CLIPS.idle, { method: 'HEAD' })
      .then(r => {
        const ct = r.headers.get('content-type') || ''
        if (!r.ok || !ct.startsWith('video')) setAllMissing(true)
      })
      .catch(() => setAllMissing(true))
  }, [])

  // Trocar clipe conforme mood
  useEffect(() => {
    const cfg = MOOD_MAP[mood] || MOOD_MAP.idle
    let target = cfg.src
    if (missing[target] && cfg.fb) target = cfg.fb
    if (missing[target]) target = CLIPS.idle
    if (target !== currentSrc) setCurrentSrc(target)
  }, [mood, missing, currentSrc])

  // Play/pause
  useEffect(() => {
    const v = vidRef.current
    if (!v) return
    v.playbackRate = isSpeaking ? 1 + Math.min(1, amplitude || 0) * 0.3 : 1
  }, [isSpeaking, amplitude, currentSrc])

  const handleError = () => {
    setMissing(m => ({ ...m, [currentSrc]: true }))
  }

  if (allMissing) {
    return (
      <div className="avwrap">
        <div className="avframe placeholder">
          <div className="ph-icon">🎬</div>
          <div className="ph-title">AVATAR EM VÍDEO</div>
          <div className="ph-body">
            Nenhum clipe encontrado.<br/>
            Coloque <code>idle.mp4</code> em <code>frontend/public/videos/human/</code>
          </div>
          <div className="ph-hint">
            Ou use <code>?2d=1</code> pra voltar ao SVG
          </div>
        </div>
        <div className="avtag"><span className="dot"/>ATENDENTE · VÍDEO</div>
        <VideoStyles />
      </div>
    )
  }

  const cfg = MOOD_MAP[mood] || MOOD_MAP.idle
  return (
    <div className={`avwrap mood-${mood}`}>
      <div className="avglow" />
      <div className="avframe">
        <video
          ref={vidRef}
          src={currentSrc}
          autoPlay
          muted
          playsInline
          loop={cfg.loop}
          onError={handleError}
          onEnded={() => {
            // volta pro idle quando one-shot termina
            if (!cfg.loop && cfg.fb) setCurrentSrc(cfg.fb)
          }}
        />
        {/* Overlay sutil (glow + vinheta) */}
        <div className="vignette" />
      </div>
      <div className="avtag">
        <span className="dot" />
        <span>ATENDENTE · AO VIVO</span>
      </div>
      <VideoStyles />
    </div>
  )
}

function VideoStyles() {
  return (
    <style>{`
      .avwrap {
        position: relative;
        width: min(460px, 78vw);
        height: min(520px, 55vh);
        display: flex; flex-direction: column; align-items: center;
      }
      .avglow {
        position: absolute; inset: -20px;
        background: radial-gradient(circle at center, rgba(249,115,22,0.28) 0%, rgba(239,68,68,0.08) 45%, transparent 70%);
        pointer-events: none; border-radius: 50%; opacity: 0.55;
        transition: opacity 0.4s;
      }
      .mood-noticed .avglow { background: radial-gradient(circle at center, rgba(251,191,36,0.4) 0%, rgba(249,115,22,0.12) 45%, transparent 70%); opacity: 0.85; }
      .mood-confirmed .avglow { background: radial-gradient(circle at center, rgba(34,197,94,0.35) 0%, rgba(59,130,246,0.1) 45%, transparent 70%); opacity: 0.85; }
      .mood-speaking .avglow { animation: avPulse 1.3s ease-in-out infinite; }
      @keyframes avPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 0.9; } }

      .avframe {
        position: relative;
        width: 100%; height: calc(100% - 40px);
        border-radius: 24px; overflow: hidden;
        background: #0a0604;
        border: 3px solid rgba(249,115,22,0.55);
        box-shadow:
          0 20px 60px rgba(0,0,0,0.65),
          0 0 40px rgba(249,115,22,0.4),
          inset 0 0 40px rgba(249,115,22,0.15);
      }
      .avframe video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .vignette {
        position: absolute; inset: 0; pointer-events: none;
        background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%);
      }

      .avframe.placeholder {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 10px; padding: 30px; text-align: center;
        background: linear-gradient(180deg, #2a1810, #0a0604);
      }
      .ph-icon { font-size: 56px; }
      .ph-title { font-size: 16px; letter-spacing: 4px; color: #f97316; font-weight: 900; }
      .ph-body { font-size: 13px; color: #fef3c7; line-height: 1.5; }
      .ph-body code, .ph-hint code { background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px; color: #fbbf24; font-size: 11px; }
      .ph-hint { font-size: 11px; color: #64748b; margin-top: 10px; }

      .avtag {
        margin-top: 12px;
        background: rgba(0,0,0,0.9);
        border: 1px solid rgba(249,115,22,0.6);
        padding: 6px 16px; border-radius: 999px;
        font-size: 11px; letter-spacing: 3px; font-weight: 800; color: #fbbf24;
        display: flex; align-items: center; gap: 8px; white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      }
      .avtag .dot {
        width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
        animation: avDot 1.5s infinite;
      }
      @keyframes avDot { 0%,100% { opacity: 0.6; } 50% { opacity: 1; box-shadow: 0 0 8px #22c55e; } }
    `}</style>
  )
}
