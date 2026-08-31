import React, { useEffect, useRef, useState } from 'react'

/**
 * AvatarPhoto — foto real de uma pessoa + micro-animações.
 *  - Boca "abre" via overlay que segue amplitude da voz (isSpeaking + amplitude)
 *  - Piscar de olhos periódico (overlay preto sobre região dos olhos)
 *  - Zoom sutil respirando
 *  - Glow reativo ao mood
 *
 * TROCA DE FOTO: substitua /public/avatars/attendant.jpg
 * AJUSTE POSIÇÃO DOS OLHOS/BOCA: mexe em EYES_TOP, EYES_LEFT, MOUTH_TOP.
 *
 * Custo: ZERO (é uma imagem estática + CSS + JS).
 */

const PHOTO_URL = '/avatars/attendant.jpg'

// % da altura/largura da foto onde ficam as features (ajuste fino via localStorage)
// Defaults calibrados pra foto vertical padrão (rosto no terço superior).
const DEFAULTS = {
  eyesTop: 22,      // % do topo até os olhos
  eyesLeft: 32,     // % da esquerda até olho esquerdo
  eyesRight: 60,    // % da esquerda até olho direito
  eyesWidth: 8,     // largura de cada olho em %
  eyesHeight: 3,    // altura do overlay de piscar
  mouthTop: 34,     // % do topo até a boca
  mouthLeft: 42,    // % da esquerda até início da boca
  mouthWidth: 16,   // largura da boca em %
  mouthHeight: 2.5, // altura base
}

function getConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('avatarPhotoCfg') || '{}')
    return { ...DEFAULTS, ...saved }
  } catch { return DEFAULTS }
}

export default function AvatarPhoto({ isSpeaking = false, amplitude = 0, mood = 'idle' }) {
  const [cfg] = useState(getConfig())
  const [imgOk, setImgOk] = useState(true)
  const holderRef = useRef(null)
  const mouthRef = useRef(null)
  const blinkLRef = useRef(null)
  const blinkRRef = useRef(null)
  const rafRef = useRef(0)
  const tRef = useRef(0)
  const ampRef = useRef(0)
  const speakingRef = useRef(isSpeaking)
  const amplitudeRef = useRef(amplitude)
  speakingRef.current = isSpeaking
  amplitudeRef.current = amplitude

  // Piscar aleatório (2-5s) — direto no DOM
  useEffect(() => {
    const iv = setInterval(() => {
      if (blinkLRef.current) blinkLRef.current.style.opacity = '1'
      if (blinkRRef.current) blinkRRef.current.style.opacity = '1'
      setTimeout(() => {
        if (blinkLRef.current) blinkLRef.current.style.opacity = '0'
        if (blinkRRef.current) blinkRRef.current.style.opacity = '0'
      }, 140)
    }, 2500 + Math.random() * 2500)
    return () => clearInterval(iv)
  }, [])

  // RAF loop — muta DOM direto, ZERO re-render (performático)
  useEffect(() => {
    const loop = () => {
      tRef.current += 0.016
      const target = speakingRef.current ? Math.min(1, amplitudeRef.current || 0) : 0
      ampRef.current += (target - ampRef.current) * 0.35
      const mouthOpen = Math.max(0, Math.min(1, ampRef.current * 2.5))

      if (holderRef.current) {
        const breath = 1 + Math.sin(tRef.current * 1.4) * 0.008
        holderRef.current.style.transform = `scale(${breath})`
      }
      if (mouthRef.current) {
        mouthRef.current.style.height = `${cfg.mouthHeight + mouthOpen * 4}%`
        mouthRef.current.style.opacity = mouthOpen > 0.05 ? String(0.55 + mouthOpen * 0.35) : '0'
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [cfg])

  return (
    <div className={`ap-wrap mood-${mood}`}>
      <div className="ap-glow" />
      <div className="ap-frame">
        {imgOk ? (
          <div className="ap-photo-holder" ref={holderRef}>
            <img
              className="ap-photo"
              src={PHOTO_URL}
              alt="Atendente"
              onError={() => setImgOk(false)}
            />
            {/* Piscar (overlay escuro sobre olhos) */}
            <div className="ap-blink" ref={blinkLRef}
              style={{
                top: `${cfg.eyesTop}%`,
                left: `${cfg.eyesLeft}%`,
                width: `${cfg.eyesWidth}%`,
                height: `${cfg.eyesHeight}%`,
                opacity: 0,
              }}
            />
            <div className="ap-blink" ref={blinkRRef}
              style={{
                top: `${cfg.eyesTop}%`,
                left: `${cfg.eyesRight}%`,
                width: `${cfg.eyesWidth}%`,
                height: `${cfg.eyesHeight}%`,
                opacity: 0,
              }}
            />
            {/* Boca — overlay escuro que "abre" com amplitude */}
            <div className="ap-mouth" ref={mouthRef}
              style={{
                top: `${cfg.mouthTop}%`,
                left: `${cfg.mouthLeft}%`,
                width: `${cfg.mouthWidth}%`,
                height: `${cfg.mouthHeight}%`,
                opacity: 0,
              }}
            />
            {/* Vinheta */}
            <div className="ap-vignette" />
          </div>
        ) : (
          <div className="ap-missing">
            <div className="ap-mi">📷</div>
            <div className="ap-mt">FOTO NÃO ENCONTRADA</div>
            <div className="ap-mb">
              Coloque uma imagem em<br/>
              <code>frontend/public/avatars/attendant.jpg</code>
            </div>
            <div className="ap-mh">
              Ou volte ao SVG: <code>?2d=1</code>
            </div>
          </div>
        )}
      </div>
      <div className="ap-tag">
        <span className="ap-dot" />
        <span>ATENDENTE · AO VIVO</span>
      </div>

      <style>{`
        .ap-wrap {
          position: relative;
          width: min(460px, 78vw);
          height: min(520px, 55vh);
          display: flex; flex-direction: column; align-items: center;
        }
        .ap-glow {
          position: absolute; inset: -20px;
          background: radial-gradient(circle at center, rgba(249,115,22,0.28) 0%, rgba(239,68,68,0.08) 45%, transparent 70%);
          pointer-events: none; border-radius: 50%; opacity: 0.55;
          transition: opacity 0.4s, background 0.4s;
        }
        .mood-noticed .ap-glow { background: radial-gradient(circle, rgba(251,191,36,0.4) 0%, rgba(249,115,22,0.12) 45%, transparent 70%); opacity: 0.85; }
        .mood-confirmed .ap-glow { background: radial-gradient(circle, rgba(34,197,94,0.35) 0%, rgba(59,130,246,0.1) 45%, transparent 70%); opacity: 0.85; }
        .mood-speaking .ap-glow { animation: apPulse 1.3s ease-in-out infinite; }
        @keyframes apPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 0.9; } }

        .ap-frame {
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
        .ap-photo-holder {
          position: absolute; inset: 0;
          will-change: transform;
        }
        .ap-photo {
          width: 100%; height: 100%;
          object-fit: cover; object-position: 50% 25%;
          display: block;
        }
        .ap-blink {
          position: absolute;
          background: #1a0f08;
          border-radius: 40%;
          transition: opacity 60ms ease;
          pointer-events: none;
        }
        .ap-mouth {
          position: absolute;
          background: radial-gradient(ellipse at center, rgba(30,10,10,0.9) 30%, rgba(60,20,20,0.55) 100%);
          border-radius: 40% / 50%;
          transition: height 80ms ease-out, opacity 100ms;
          pointer-events: none;
        }
        .ap-vignette {
          position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%);
        }
        .ap-missing {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 100%; padding: 30px; text-align: center; gap: 8px;
          background: linear-gradient(180deg, #2a1810, #0a0604);
        }
        .ap-mi { font-size: 52px; }
        .ap-mt { color: #f97316; font-size: 15px; letter-spacing: 3px; font-weight: 900; }
        .ap-mb { color: #fef3c7; font-size: 12px; line-height: 1.5; }
        .ap-mb code, .ap-mh code {
          background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px;
          color: #fbbf24; font-size: 11px;
        }
        .ap-mh { color: #64748b; font-size: 11px; margin-top: 10px; }

        .ap-tag {
          margin-top: 12px;
          background: rgba(0,0,0,0.9);
          border: 1px solid rgba(249,115,22,0.6);
          padding: 6px 16px; border-radius: 999px;
          font-size: 11px; letter-spacing: 3px; font-weight: 800; color: #fbbf24;
          display: flex; align-items: center; gap: 8px; white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .ap-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
          animation: apDot 1.5s infinite;
        }
        @keyframes apDot { 0%,100% { opacity: 0.6; } 50% { opacity: 1; box-shadow: 0 0 8px #22c55e; } }
      `}</style>
    </div>
  )
}
