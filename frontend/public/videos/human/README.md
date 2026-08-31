# 🎬 Avatar em Vídeo — Pessoa Real

Coloque aqui **clipes curtos MP4** de uma pessoa real (você, o dono do bar, um garçom).  
O sistema troca automaticamente o vídeo conforme o estado da Gabi.

## 📹 Arquivos necessários

| Arquivo | Duração | Conteúdo | Loop? |
|---|---|---|---|
| `idle.mp4` | 8-15s | Pessoa parada, olhando pra câmera, respirando naturalmente | ✅ Sim |
| `speaking.mp4` | 5-10s | Pessoa falando (qualquer coisa, a boca em movimento) | ✅ Sim |
| `wave.mp4` | 2-4s | Pessoa acenando "olá" | ❌ 1x |
| `thumbsup.mp4` | 2-4s | Pessoa fazendo joia / sorrindo pra confirmação | ❌ 1x |
| `listening.mp4` | 5-10s | *(opcional)* Pessoa atenta, escutando | ✅ Sim |

## 📱 Como gravar (5 minutos)

1. **Fundo neutro** (parede lisa, cor sólida) — não precisa fundo verde
2. **Enquadre do peito pra cima** (busto)
3. **Boa iluminação frontal** (janela ou luz de teto)
4. **Câmera do celular no modo Selfie** (1080p vertical fica ótimo em totem)
5. Grava os 4 clipes de acordo com a tabela acima
6. Transfere pro Mac (AirDrop, Google Drive, etc.)
7. Salva nesta pasta com os nomes exatos da tabela

## ✅ Ativar

Depois de colocar os arquivos:

```bash
# No console do Chrome (F12):
localStorage.setItem('useVideo', '1')
# Recarrega (Cmd+R) → agora é a pessoa real na tela
```

## 🔄 Fallback

- Sem arquivos aqui → mostra placeholder + instrução
- Videos quebrados → cai pro SVG animado da Gabi
- Desativar: `localStorage.removeItem('useVideo')` + F5

## 💡 Dicas pra ficar top

- Use fone de ouvido durante gravação pra ter boa dicção mesmo mudo (o áudio é ignorado)
- Grave 2-3 versões de cada e escolhe a melhor
- Loop suave: primeiro e último frame parecidos
- Pra clipes que fazem loop (idle, speaking): comece e termine na mesma pose
