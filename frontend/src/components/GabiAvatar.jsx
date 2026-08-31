import React, { useEffect, useRef, useState } from 'react'

/**
 * GabiAvatar — SVG com estado emocional + idle behaviors autônomos.
 *
 * moods:
 *  - idle: entediada, olha em volta, bocejo, checa unha, celular, mexe cabelo
 *  - noticed: sorriu, olha pra câmera, animada
 *  - listening: atenta, olha fixo
 *  - speaking: falando, boca anima com amplitude, cabeça bala
 *  - confirmed: pedido pronto, feliz, acena
 */
export default function GabiAvatar({ isSpeaking, amplitude = 0, mood = 'idle' }) {
  const [behavior, setBehavior] = useState('normal')  // normal | yawn | nails | phone | hair | look_left | look_right | wave
  const [blink, setBlink] = useState(false)
  const [gaze, setGaze] = useState({ x: 0, y: 0 })
  const ampRef = useRef(0)
  const [smoothAmp, setSmoothAmp] = useState(0)
  const [headTilt, setHeadTilt] = useState({ x: 0, y: 0 })
  const tRef = useRef(0)

  // Piscar
  useEffect(() => {
    const iv = setInterval(() => {
      setBlink(true); setTimeout(() => setBlink(false), 130)
    }, 3000 + Math.random() * 3000)
    return () => clearInterval(iv)
  }, [])

  // Random idle behaviors quando mood = idle
  useEffect(() => {
    if (mood !== 'idle') { setBehavior('normal'); return }
    const behaviors = ['yawn', 'nails', 'phone', 'hair', 'look_left', 'look_right', 'normal', 'normal', 'normal']
    const pickNext = () => {
      const b = behaviors[Math.floor(Math.random() * behaviors.length)]
      setBehavior(b)
      // Duration of behavior
      const duration = 2500 + Math.random() * 3000
      return duration
    }
    let timer
    const cycle = () => {
      const dur = pickNext()
      timer = setTimeout(cycle, dur)
    }
    cycle()
    return () => clearTimeout(timer)
  }, [mood])

  // On mood change to 'noticed', wave
  useEffect(() => {
    if (mood === 'noticed') {
      setBehavior('wave')
      const t = setTimeout(() => setBehavior('normal'), 2000)
      return () => clearTimeout(t)
    }
  }, [mood])

  // Gaze based on mood/behavior
  useEffect(() => {
    let iv
    const setRandomGaze = () => {
      if (mood === 'listening' || mood === 'speaking') {
        setGaze({ x: 0, y: 0 })  // olho fixo na câmera
      } else if (behavior === 'look_left') {
        setGaze({ x: -5, y: 0 })
      } else if (behavior === 'look_right') {
        setGaze({ x: 5, y: 0 })
      } else if (behavior === 'phone') {
        setGaze({ x: 0, y: 4 })
      } else if (behavior === 'nails') {
        setGaze({ x: -3, y: 3 })
      } else if (behavior === 'yawn') {
        setGaze({ x: 0, y: -2 })
      } else {
        setGaze({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 2.5 })
      }
    }
    setRandomGaze()
    if (mood === 'idle' && behavior === 'normal') {
      iv = setInterval(setRandomGaze, 2500 + Math.random() * 2000)
    }
    return () => iv && clearInterval(iv)
  }, [mood, behavior])

  // Amplitude smoothing + head sway
  useEffect(() => {
    let raf
    const loop = () => {
      tRef.current += 0.016
      const target = isSpeaking ? amplitude : 0
      ampRef.current += (target - ampRef.current) * 0.35
      setSmoothAmp(ampRef.current)

      const t = tRef.current
      let sway = {
        x: Math.sin(t * 0.7) * 0.6,
        y: Math.sin(t * 0.4) * 0.4,
      }
      if (isSpeaking) {
        sway.x += Math.sin(t * 3.0) * 0.5 * ampRef.current
        sway.y += Math.cos(t * 2.4) * 0.3 * ampRef.current
      }
      // Behavior head positions
      if (behavior === 'phone') sway.y += 2
      if (behavior === 'nails') sway.y += 1.5
      if (behavior === 'yawn') sway.x = Math.sin(t * 3) * 1.2
      if (behavior === 'look_left') sway.x -= 3
      if (behavior === 'look_right') sway.x += 3
      if (behavior === 'hair') sway.x += Math.sin(t * 4) * 0.8
      setHeadTilt(sway)

      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [isSpeaking, amplitude, behavior])

  const openness = Math.min(1, Math.max(0, smoothAmp * 3))
  const yawnOpen = behavior === 'yawn' ? 0.7 : 0
  const mouthOpen = Math.max(openness, yawnOpen)

  // Smile intensifies for noticed/confirmed
  const smileAmount = mood === 'noticed' ? 1.2 : mood === 'confirmed' ? 1.5 : isSpeaking ? 0.3 : 0.9
  const breathScale = 1 + Math.sin(tRef.current * 1.2) * 0.008

  const mouthCy = 268
  const mouthRx = 24 + smileAmount * 6
  const mouthRy = 3 + mouthOpen * 22

  return (
    <div className={`gabi-wrap ${isSpeaking ? 'speaking' : ''} mood-${mood} behavior-${behavior}`}>
      <div className="gabi-glow" />
      <div className="gabi-frame">
        <svg
          viewBox="0 0 340 400"
          width="100%"
          height="100%"
          style={{
            transform: `rotate(${headTilt.x}deg) translateY(${headTilt.y}px) scale(${breathScale})`,
            transition: 'transform 0.2s ease-out',
          }}
        >
          <defs>
            {/* Filtros pra dar profundidade 3D */}
            <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
              <feOffset dx="0" dy="3" result="offset" />
              <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
              <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="innerShade" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
            </filter>
            <radialGradient id="skinG" cx="0.42" cy="0.3" r="0.85">
              <stop offset="0%" stopColor="#fff2df" />
              <stop offset="25%" stopColor="#fbdcbb" />
              <stop offset="55%" stopColor="#e8b587" />
              <stop offset="85%" stopColor="#c69268" />
              <stop offset="100%" stopColor="#8b5e3a" />
            </radialGradient>
            {/* Sombra lateral do rosto pra volume */}
            <radialGradient id="faceShade" cx="0.85" cy="0.6" r="0.65">
              <stop offset="0%" stopColor="#000000" stopOpacity="0" />
              <stop offset="55%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#4a2810" stopOpacity="0.35" />
            </radialGradient>
            <radialGradient id="faceHi" cx="0.28" cy="0.22" r="0.55">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="hairG" x1="0.3" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="#6b4028" />
              <stop offset="35%" stopColor="#4a2818" />
              <stop offset="70%" stopColor="#2a1408" />
              <stop offset="100%" stopColor="#120802" />
            </linearGradient>
            <linearGradient id="hairHi" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a86840" stopOpacity="0.55" />
              <stop offset="40%" stopColor="#a86840" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="shirtG" x1="0.3" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="35%" stopColor="#f97316" />
              <stop offset="75%" stopColor="#c2410c" />
              <stop offset="100%" stopColor="#7c2d12" />
            </linearGradient>
            <linearGradient id="shirtHi" x1="0" y1="0" x2="1" y2="0.4">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lipG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c94040" />
              <stop offset="100%" stopColor="#8a2828" />
            </linearGradient>
            <radialGradient id="eyeG" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="80%" stopColor="#f5f5f5" />
              <stop offset="100%" stopColor="#d4d4d4" />
            </radialGradient>
            <radialGradient id="irisG" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#5a3c28" />
              <stop offset="70%" stopColor="#3a2418" />
              <stop offset="100%" stopColor="#1a0f08" />
            </radialGradient>
            <radialGradient id="mouthG" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#5a1010" />
              <stop offset="100%" stopColor="#2a0505" />
            </radialGradient>
          </defs>

          {/* SHIRT / BODY — com sombra + brilho + logo JM */}
          <path d="M 40 400 Q 40 315 110 295 L 230 295 Q 300 315 300 400 Z" fill="url(#shirtG)" filter="url(#softShadow)" />
          {/* Dobras/vincos pra dar volume */}
          <path d="M 130 295 Q 155 315 170 320 Q 185 315 210 295 L 210 305 Q 170 335 130 305 Z" fill="rgba(0,0,0,0.22)" />
          <path d="M 60 340 Q 90 345 110 360 L 100 400 L 40 400 Z" fill="rgba(0,0,0,0.18)" />
          <path d="M 280 340 Q 250 345 230 360 L 240 400 L 300 400 Z" fill="rgba(0,0,0,0.18)" />
          {/* Brilho superior no ombro */}
          <path d="M 60 315 Q 130 300 170 300 Q 210 300 280 315 L 280 340 Q 170 320 60 340 Z" fill="url(#shirtHi)" />
          {/* LOGO JM na camiseta — círculo branco com foto */}
          <g>
            <circle cx="170" cy="365" r="26" fill="#ffffff" stroke="#fef3c7" strokeWidth="2" filter="url(#softShadow)" />
            <clipPath id="logoClip"><circle cx="170" cy="365" r="23" /></clipPath>
            <image href="/jm/logo.jpg" x="147" y="342" width="46" height="46" clipPath="url(#logoClip)" preserveAspectRatio="xMidYMid slice" />
          </g>

          {/* Hand doing nails (mão direita levantada em frente com dedos abertos) */}
          {behavior === 'nails' && (
            <g style={{ animation: 'nailsMove 2s ease-in-out infinite' }}>
              <ellipse cx="245" cy="310" rx="22" ry="14" fill="url(#skinG)" transform="rotate(-35 245 310)" />
              {/* Dedos */}
              <ellipse cx="235" cy="290" rx="4" ry="10" fill="url(#skinG)" />
              <ellipse cx="245" cy="285" rx="4" ry="12" fill="url(#skinG)" />
              <ellipse cx="255" cy="288" rx="4" ry="11" fill="url(#skinG)" />
              <ellipse cx="264" cy="294" rx="4" ry="9" fill="url(#skinG)" />
              {/* Unhas pintadas */}
              <ellipse cx="235" cy="283" rx="2.5" ry="3.5" fill="#e11d48" />
              <ellipse cx="245" cy="277" rx="2.5" ry="3.5" fill="#e11d48" />
              <ellipse cx="255" cy="281" rx="2.5" ry="3.5" fill="#e11d48" />
              <ellipse cx="264" cy="287" rx="2.5" ry="3.5" fill="#e11d48" />
            </g>
          )}

          {/* Phone in hand */}
          {behavior === 'phone' && (
            <g>
              <rect x="145" y="335" width="50" height="70" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
              <rect x="150" y="342" width="40" height="55" rx="2" fill="#0ea5e9" opacity="0.7" />
              {/* Reflexo na tela */}
              <rect x="152" y="344" width="15" height="20" rx="1" fill="#ffffff" opacity="0.3" />
              {/* Mão segurando */}
              <ellipse cx="140" cy="365" rx="12" ry="18" fill="url(#skinG)" />
              <ellipse cx="200" cy="365" rx="12" ry="18" fill="url(#skinG)" />
            </g>
          )}

          {/* Hand waving on 'wave' behavior */}
          {behavior === 'wave' && (
            <g style={{ animation: 'waveHand 0.6s ease-in-out infinite' }}>
              <ellipse cx="270" cy="240" rx="18" ry="24" fill="url(#skinG)" />
              <ellipse cx="270" cy="205" rx="8" ry="14" fill="url(#skinG)" />
              <ellipse cx="285" cy="215" rx="6" ry="12" fill="url(#skinG)" />
              <ellipse cx="255" cy="215" rx="6" ry="12" fill="url(#skinG)" />
            </g>
          )}

          {/* Hand touching hair */}
          {behavior === 'hair' && (
            <g style={{ animation: 'hairTouch 1.5s ease-in-out infinite' }}>
              <ellipse cx="70" cy="180" rx="16" ry="22" fill="url(#skinG)" transform="rotate(-20 70 180)" />
              <ellipse cx="72" cy="150" rx="6" ry="12" fill="url(#skinG)" />
              <ellipse cx="82" cy="155" rx="5" ry="11" fill="url(#skinG)" />
              <ellipse cx="60" cy="155" rx="5" ry="11" fill="url(#skinG)" />
            </g>
          )}

          {/* NECK — com sombra sob queixo pra 3D */}
          <path d="M 148 250 Q 148 285 155 300 Q 170 310 185 300 Q 192 285 192 250 Z" fill="url(#skinG)" />
          <path d="M 148 250 Q 152 268 170 272 Q 188 268 192 250 L 190 260 Q 170 268 150 260 Z" fill="rgba(0,0,0,0.28)" />
          <ellipse cx="170" cy="300" rx="22" ry="6" fill="rgba(0,0,0,0.22)" />

          {/* HAIR BACK */}
          <path d="M 60 180 Q 50 300 100 340 L 100 260 Q 70 220 80 150 Z" fill="url(#hairG)" />
          <path d="M 280 180 Q 290 300 240 340 L 240 260 Q 270 220 260 150 Z" fill="url(#hairG)" />

          {/* FACE — pele + sombras + highlights pra 3D */}
          <ellipse cx="170" cy="180" rx="88" ry="105" fill="url(#skinG)" filter="url(#softShadow)" />
          {/* Sombra lateral (bochecha direita) */}
          <ellipse cx="170" cy="180" rx="88" ry="105" fill="url(#faceShade)" />
          {/* Highlight (bochecha esquerda + testa) */}
          <ellipse cx="170" cy="180" rx="88" ry="105" fill="url(#faceHi)" />
          {/* Sombra queixo/pescoço */}
          <path d="M 100 200 Q 105 260 170 280 Q 235 260 240 200 Q 235 250 170 265 Q 105 250 100 200" fill="rgba(0,0,0,0.08)" />
          {/* Contorno da mandíbula (leve) */}
          <path d="M 90 195 Q 100 260 170 280 Q 240 260 250 195" fill="none" stroke="rgba(139,94,58,0.35)" strokeWidth="2" />

          {/* HAIR FRONT — com highlights pra dar volume */}
          <path
            d="M 78 145 Q 92 55 170 55 Q 248 55 262 145
               Q 258 118 220 108 Q 200 130 170 122 Q 140 130 120 108 Q 82 118 78 145 Z"
            fill="url(#hairG)" filter="url(#softShadow)"
          />
          {/* Highlight brilhante em cima */}
          <path d="M 90 100 Q 130 65 170 62 Q 210 65 250 100 Q 220 82 170 78 Q 120 82 90 100 Z" fill="url(#hairHi)" />
          <path d="M 88 148 Q 78 220 110 260" fill="none" stroke="url(#hairG)" strokeWidth="26" strokeLinecap="round" />
          <path d="M 252 148 Q 262 220 230 260" fill="none" stroke="url(#hairG)" strokeWidth="26" strokeLinecap="round" />
          {/* Fios de brilho nas laterais */}
          <path d="M 92 150 Q 84 210 108 250" fill="none" stroke="#8a5028" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <path d="M 248 150 Q 256 210 232 250" fill="none" stroke="#8a5028" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <path d="M 130 130 Q 122 145 128 165" fill="none" stroke="#3a2016" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
          <path d="M 210 130 Q 218 145 212 165" fill="none" stroke="#3a2016" strokeWidth="3" strokeLinecap="round" opacity="0.7" />

          {/* EYEBROWS (adjust for noticed/confirmed = higher) */}
          {(() => {
            const raise = (mood === 'noticed' || mood === 'confirmed') ? -4 : 0
            return (
              <>
                <path d={`M 108 ${152 + raise} Q 128 ${138 + raise} 152 ${148 + raise}`}
                      fill="none" stroke="#2a1810" strokeWidth="5.5" strokeLinecap="round" />
                <path d={`M 188 ${148 + raise} Q 212 ${138 + raise} 232 ${152 + raise}`}
                      fill="none" stroke="#2a1810" strokeWidth="5.5" strokeLinecap="round" />
              </>
            )
          })()}

          {/* EYES */}
          {blink ? (
            <>
              <path d="M 108 178 Q 130 186 152 178" fill="none" stroke="#2a1810" strokeWidth="4" strokeLinecap="round" />
              <path d="M 188 178 Q 212 186 232 178" fill="none" stroke="#2a1810" strokeWidth="4" strokeLinecap="round" />
            </>
          ) : (
            <>
              <g>
                <ellipse cx="130" cy="178" rx="16" ry="12" fill="url(#eyeG)" />
                <circle cx={130 + gaze.x} cy={178 + gaze.y} r="9" fill="url(#irisG)" />
                <circle cx={130 + gaze.x} cy={178 + gaze.y} r="4.5" fill="#0a0604" />
                <circle cx={130 + gaze.x + 2} cy={178 + gaze.y - 2} r="2" fill="#ffffff" />
                <circle cx={130 + gaze.x - 2.5} cy={178 + gaze.y + 2.5} r="1" fill="#ffffff" opacity="0.7" />
                <path d="M 114 172 Q 130 168 146 172" fill="none" stroke="#2a1810" strokeWidth="2" strokeLinecap="round" />
                <path d="M 116 168 L 114 163 M 122 166 L 121 161 M 130 165 L 130 160 M 138 166 L 139 161 M 144 168 L 146 163"
                      stroke="#2a1810" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              </g>
              <g>
                <ellipse cx="210" cy="178" rx="16" ry="12" fill="url(#eyeG)" />
                <circle cx={210 + gaze.x} cy={178 + gaze.y} r="9" fill="url(#irisG)" />
                <circle cx={210 + gaze.x} cy={178 + gaze.y} r="4.5" fill="#0a0604" />
                <circle cx={210 + gaze.x + 2} cy={178 + gaze.y - 2} r="2" fill="#ffffff" />
                <circle cx={210 + gaze.x - 2.5} cy={178 + gaze.y + 2.5} r="1" fill="#ffffff" opacity="0.7" />
                <path d="M 194 172 Q 210 168 226 172" fill="none" stroke="#2a1810" strokeWidth="2" strokeLinecap="round" />
                <path d="M 196 168 L 194 163 M 202 166 L 201 161 M 210 165 L 210 160 M 218 166 L 219 161 M 224 168 L 226 163"
                      stroke="#2a1810" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              </g>
            </>
          )}

          {/* NOSE */}
          <path d="M 170 195 Q 162 225 168 245 Q 174 246 176 240" fill="none" stroke="#c99575" strokeWidth="2.2" strokeLinecap="round" />
          <ellipse cx="164" cy="245" rx="3" ry="1.6" fill="#8a5a3a" opacity="0.55" />
          <ellipse cx="177" cy="245" rx="3" ry="1.6" fill="#8a5a3a" opacity="0.55" />
          <path d="M 170 205 L 170 225" stroke="#fff" strokeWidth="1.2" opacity="0.35" strokeLinecap="round" />

          {/* BLUSH */}
          <ellipse cx="105" cy="230" rx="18" ry="10" fill="#f08080" opacity={mood === 'noticed' || mood === 'confirmed' ? 0.6 : 0.35} />
          <ellipse cx="235" cy="230" rx="18" ry="10" fill="#f08080" opacity={mood === 'noticed' || mood === 'confirmed' ? 0.6 : 0.35} />

          {/* MOUTH */}
          {mouthOpen < 0.05 ? (
            <>
              <path
                d={`M ${170 - mouthRx} ${mouthCy} Q 170 ${mouthCy + 4 + smileAmount * 8} ${170 + mouthRx} ${mouthCy}`}
                fill="none" stroke="url(#lipG)" strokeWidth="5" strokeLinecap="round"
              />
              <path
                d={`M ${170 - mouthRx * 0.5} ${mouthCy + 5} Q 170 ${mouthCy + 7 + smileAmount * 4} ${170 + mouthRx * 0.5} ${mouthCy + 5}`}
                fill="none" stroke="#ff9090" strokeWidth="1" opacity="0.6" strokeLinecap="round"
              />
            </>
          ) : (
            <g>
              <ellipse cx="170" cy={mouthCy + mouthOpen * 2} rx={mouthRx * 0.85} ry={mouthRy} fill="url(#mouthG)" />
              <path
                d={`M ${170 - mouthRx} ${mouthCy - mouthRy * 0.6}
                    Q 170 ${mouthCy - mouthRy * 1.2}
                    ${170 + mouthRx} ${mouthCy - mouthRy * 0.6}`}
                fill="none" stroke="url(#lipG)" strokeWidth="3.5" strokeLinecap="round"
              />
              <path
                d={`M ${170 - mouthRx} ${mouthCy + mouthRy * 0.6}
                    Q 170 ${mouthCy + mouthRy * 1.4}
                    ${170 + mouthRx} ${mouthCy + mouthRy * 0.6}`}
                fill="none" stroke="url(#lipG)" strokeWidth="4" strokeLinecap="round"
              />
              {mouthOpen > 0.25 && (
                <rect
                  x={170 - mouthRx * 0.6}
                  y={mouthCy - mouthOpen * 4}
                  width={mouthRx * 1.2}
                  height={Math.max(3, mouthOpen * 8)}
                  fill="#ffffff" opacity="0.9" rx="1.5"
                />
              )}
            </g>
          )}

          {/* EARRINGS — com brilho */}
          <g filter="url(#softShadow)">
            <circle cx="90" cy="215" r="6" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
            <circle cx="88" cy="213" r="1.5" fill="#fff8c5" opacity="0.9" />
            <circle cx="250" cy="215" r="6" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
            <circle cx="248" cy="213" r="1.5" fill="#fff8c5" opacity="0.9" />
          </g>
        </svg>

        {/* Behavior thought bubble */}
        {behavior === 'yawn' && <div className="thought">🥱 tédio...</div>}
        {behavior === 'phone' && <div className="thought">📱 scrollando...</div>}
        {behavior === 'nails' && <div className="thought">💅 unha nova</div>}
        {behavior === 'hair' && <div className="thought">✨ cabelinho</div>}
        {mood === 'noticed' && behavior === 'wave' && <div className="thought yay">👋 Oi!</div>}
      </div>

      <div className="gabi-tag">
        <span className="tag-dot" />
        <span>GABI · ATENDENTE IA</span>
      </div>

      <style>{`
        .gabi-wrap {
          position: relative;
          width: min(460px, 78vw);
          height: min(520px, 55vh);
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .gabi-glow {
          position: absolute; inset: -20px;
          background: radial-gradient(circle at center, rgba(249,115,22,0.28) 0%, rgba(239,68,68,0.08) 45%, transparent 70%);
          pointer-events: none;
          border-radius: 50%;
          transition: background 0.6s ease, opacity 0.6s ease;
          opacity: 0.6;
        }
        .mood-noticed .gabi-glow { background: radial-gradient(circle at center, rgba(251,191,36,0.32) 0%, rgba(249,115,22,0.12) 45%, transparent 70%); opacity: 0.75; }
        .mood-confirmed .gabi-glow { background: radial-gradient(circle at center, rgba(34,197,94,0.3) 0%, rgba(59,130,246,0.1) 45%, transparent 70%); opacity: 0.75; }
        .mood-idle .gabi-glow { opacity: 0.35; }
        .gabi-wrap.speaking .gabi-glow {
          animation: gpulseSubtle 1.4s ease-in-out infinite;
        }
        @keyframes gpulse {
          0%,100% { opacity: 0.6; }
          50% { opacity: 0.9; }
        }
        @keyframes gpulseSubtle {
          0%,100% { opacity: 0.55; }
          50% { opacity: 0.85; }
        }
        @keyframes waveHand {
          0%, 100% { transform: rotate(-15deg); }
          50% { transform: rotate(15deg); }
        }
        @keyframes nailsMove {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-5px) translateY(-2px); }
        }
        @keyframes hairTouch {
          0%, 100% { transform: translateY(0) rotate(-15deg); }
          50% { transform: translateY(-8px) rotate(-5deg); }
        }
        .gabi-frame {
          position: relative;
          width: 100%;
          height: calc(100% - 40px);
          border-radius: 24px;
          overflow: hidden;
          background:
            radial-gradient(ellipse at 50% 30%, rgba(249,115,22,0.2) 0%, transparent 60%),
            linear-gradient(180deg, #2a1810 0%, #0a0604 100%);
          border: 3px solid rgba(249,115,22,0.5);
          box-shadow:
            0 20px 60px rgba(0,0,0,0.6),
            0 0 40px rgba(249,115,22,0.35),
            inset 0 0 40px rgba(249,115,22,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .thought {
          position: absolute; top: 20px; right: 16px;
          background: rgba(0,0,0,0.85);
          border: 1px solid rgba(251,191,36,0.4);
          padding: 6px 12px; border-radius: 14px;
          font-size: 12px; letter-spacing: 1px;
          color: #fef3c7;
          animation: thoughtIn 0.3s ease-out;
        }
        .thought.yay {
          background: rgba(34,197,94,0.85); border-color: #22c55e; color: #fff;
        }
        @keyframes thoughtIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .gabi-tag {
          margin-top: 12px;
          background: rgba(0,0,0,0.9);
          border: 1px solid rgba(249,115,22,0.6);
          padding: 6px 16px; border-radius: 999px;
          font-size: 11px; letter-spacing: 3px; font-weight: 800;
          color: #fbbf24;
          display: flex; align-items: center; gap: 8px;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .tag-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #22c55e;
          animation: gpulse 1.5s infinite;
        }
      `}</style>
    </div>
  )
}
