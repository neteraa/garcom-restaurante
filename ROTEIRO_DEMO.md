# 🎬 Roteiro de Demonstração — Garçom IA (Totem JM Espetinhos)

> **Duração estimada:** 10–15 minutos  
> **URL do sistema:** `http://localhost:8011` (ou IP do servidor)  
> **Pré-requisito:** Backend rodando (`python3 -m uvicorn main:app --host 0.0.0.0 --port 8011`)

---

## ⚡ Antes de Começar (Setup — 2 min antes)

```bash
# 1. Entrar na pasta do backend
cd backend

# 2. Iniciar o servidor (tudo numa porta)
python3 -m uvicorn main:app --host 0.0.0.0 --port 8011

# 3. Abrir 3 abas no navegador:
#    Aba A (Totem): http://IP:8011/
#    Aba B (Cozinha): http://IP:8011/#/kitchen
#    Aba C (Mesas): http://IP:8011/#/mesas

# 4. Opcional — Estoque: http://IP:8011/#/estoque
# 5. Opcional — Caixa: http://IP:8011/#/caixa
```

---

## 📋 Roteiro Passo a Passo

### 1. Abertura — O Problema (1 min)
> *"O CardapioWeb cobra R$XXX/mês, garçons erram pedidos, não tem controle de estoque em tempo real.  
> Construímos uma solução própria do restaurante JM Espetinhos — totalmente customizável."*

---

### 2. TELA TOTEM — Gabi, o Avatar IA (3 min)

**Abra a Aba A (Totem)**

- ✅ Mostrar a **Gabi** (avatar animado, uniforme JM)  
- ✅ Clicar no totem → mostra o cardápio completo com **fotos reais, preços, categorias**  
- ✅ Filtrar por categoria (ex: "Espetinhos", "Combos Promocionais")  
- ✅ Adicionar item ao carrinho com `+`  
- ✅ Mostrar o **total atualizado em tempo real**  
- ✅ Botão "Fazer Pedido" → pedido vai para a cozinha  

> *"O cliente chega, toca na tela, escolhe, paga. Sem fila, sem erros de garçom."*

---

### 3. COZINHA recebendo o pedido em tempo real (2 min)

**Abra a Aba B (Cozinha — `/#/kitchen`)**

- ✅ Mostrar o pedido aparecendo **instantaneamente** (WebSocket)
- ✅ Ver o badge **"Mesa X"** no pedido (pedidos de mesa têm destaque)
- ✅ Clicar "MARCAR PRONTO" → pedido vai pra coluna "Prontos"
- ✅ Clicar "ENTREGUE" → confirma entrega
- ✅ Mostrar contadores: **18 Preparando / 2 Prontos / R$240 Caixa**

> *"A cozinha vê em tempo real, sem papel, sem telefone. Quando fica pronto, aparece automático."*

---

### 4. MESAS — Comanda Digital com QR Code (3 min)

**Abra a Aba C (Mesas — `/#/mesas`)**

- ✅ Mostrar as **12 mesas** com status Livre/Aberta
- ✅ Clicar em uma mesa → digitar nome do cliente → **"Abrir Mesa"**
- ✅ Adicionar itens pela comanda (buscar, filtrar, clicar `+`)
- ✅ Mostrar **total da mesa em tempo real**
- ✅ Clicar no botão **QR** → exibe QR code para o cliente escanear
- ✅ *[Se tiver celular]* Escanear o QR → abre o cardápio mobile da mesa
- ✅ **Fechar conta** → selecionar pagamento (PIX / Cartão / Dinheiro)

> *"Garçom abre a mesa no sistema, o cliente escaneia o QR e faz o pedido pelo celular. A cozinha já recebe."*

---

### 5. ESTOQUE — Controle em Tempo Real (2 min)

**Abrir `/#/estoque`**

- ✅ Mostrar os **86 itens** com fotos, quantidades e barras de progresso
- ✅ Mostrar que ao fazer pedidos, o estoque **decrementa automaticamente**
- ✅ Mostrar **alertas de estoque baixo** (badge vermelho)
- ✅ Botão **"Repor"** para adicionar unidades
- ✅ **"Abrir o Dia"** → zera as vendas diárias (botão laranja no canto)
- ✅ Ranking de vendas do dia

> *"Sabemos exatamente o que acabou, sem ter que conferir físico. Alerta automático quando baixo."*

---

### 6. CAIXA — Dashboard Gerencial (1 min)

**Abrir `/#/caixa`**

- ✅ Faturamento do dia, pedidos, ticket médio
- ✅ Gráfico de vendas por hora
- ✅ Top 3 itens mais vendidos com ranking e receita
- ✅ Lista de últimos pedidos com status

> *"Gestor vê o desempenho do dia em tempo real, do celular ou computador."*

---

### 7. Diferenciais vs CardapioWeb (1 min)

| Feature | CardapioWeb | Garçom IA |
|---|---|---|
| Cardápio digital | ✅ | ✅ |
| Controle de estoque | ❌ | ✅ |
| Dashboard cozinha | ❌ | ✅ |
| Sistema de mesas | Limitado | ✅ Completo |
| QR por mesa | ✅ | ✅ |
| Avatar IA | ❌ | ✅ Gabi |
| Reconhecimento facial | ❌ | ✅ (infra pronta) |
| Custo mensal | R$ pago | **R$ 0** (próprio) |

---

## 🔄 Script de Reset para Nova Demo

Antes de cada apresentação, execute para estado limpo:

```bash
# Zerar pedidos e estoque do dia
curl -X POST http://localhost:8011/api/inventory/reset-day

# Fechar todas as mesas abertas (se houver)
# Ou usar o botão "Fechar conta" em cada mesa no painel Mesas

# O backend auto-cria estoque e dados ao iniciar do zero
```

---

## 🔧 Comandos Úteis

```bash
# Iniciar sistema completo
cd /workspace/garcom-restaurante/backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8011

# Verificar saúde do sistema
curl http://localhost:8011/api/stats

# Repor estoque (demo fresh)
python3 -c "
import urllib.request, json
BASE = 'http://localhost:8011'
menu = json.loads(urllib.request.urlopen(f'{BASE}/api/menu').read())['items']
batch = [{'item_id': m['id'], 'qty': 50} for m in menu]
req = urllib.request.Request(f'{BASE}/api/inventory/restock-batch',
    data=json.dumps({'items': batch}).encode(),
    headers={'Content-Type':'application/json'})
print(json.loads(urllib.request.urlopen(req).read()))
"
```

---

## ✅ Checklist Final Antes da Apresentação

- [ ] Backend rodando: `curl http://localhost:8011/api/stats`
- [ ] Totem carregando: `http://IP:8011/`
- [ ] Kitchen em aba separada: `/#/kitchen`
- [ ] Mesas em aba separada: `/#/mesas`
- [ ] Estoque zerado ou aberto com estoque farto: `/#/estoque`
- [ ] Celular disponível para demo do QR code
- [ ] Internet ligada (fotos do cardápio carregam de CDN)
