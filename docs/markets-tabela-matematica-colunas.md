# Matemática da tabela Markets — linha a linha

Documento da **conta que cada coluna faz**. A linha de exemplo é **VGSH** (Vanguard Short-Term Treasury ETF), classe Treasuries (`fi_treasury`), no snapshot que mostrou:

| Score | Vol 15d | 1D | 7D | 15D | Trend | Money | To buy | Factor | Trend 35% | RSI 25% | Volume 20% | COT 20% |
|-------|---------|----|----|-----|-------|-------|--------|--------|-----------|---------|------------|---------|
| 0.836 Among the best | 2.9M · 4% | +0.01% | +0.23% | +0.37% | ↑ Increase | … Wait · Gain 84 · Risk 34 | 0.10 Class | Trend | 1.00 Adds | 1.00 Adds | 0.68 Adds | 0.50 Neutral |

Duas camadas, duas perguntas:

1. **Security Score** (os pilares à direita + Score) — *qual ponto da curva* é o melhor veículo *hoje, contra os pares da classe*.
2. **Regime Score** (não aparece como número na linha; alimenta Money e To buy) — *a classe deve receber mais peso ou menos*.

O motor **não** prevê se o preço sobe. 1D/7D/15D verdes com Money `…` são preço, não entrada.

Código: `motor/src/calculo/treasury_security_score.py` · `lib/motor/entry-setup.ts` · `lib/motor/buy-proximity.ts` · árvore de timing em [motor-timing-entrada-por-classe.md](motor-timing-entrada-por-classe.md).

---

## 0. Percentil cruzado (o 0–1 que a tabela mostra)

Cada pilar (exceto COT, ver §8) **não** é o valor bruto. É o rank de VGSH contra os outros Treasuries *no mesmo dia*.

Para um vetor de valores brutos \(x_t\) no universo da classe, com empates compartilhando o rank médio:

\[
p(t) = \frac{\operatorname{rank}_{\text{médio}}(x_t)}{N-1} \in [0,1]
\]

- \(p = 0\) = pior do dia · \(p = 0.5\) = mediana · \(p = 1\) = melhor do dia.
- Se `inverte_percentil = true`, o motor ranqueia \(-x\) (menor bruto vira melhor).
- Chip na UI (`lib/motor/indicator-stance.ts`):

| Percentil | Chip |
|-----------|------|
| \(\ge 0.65\) | Adds |
| \(0.35 \le p < 0.65\) | Neutral |
| \(< 0.35\) | Drags |

VGSH: Trend 1.00 e RSI 1.00 = topo do ranking naquele dia. Volume 0.68 = Adds. COT 0.50 = Neutral (é o mesmo número para *todos* os Treasuries — ver §8).

---

## 1. Score `0.836` · Among the best

**Pergunta:** onde este nome senta no ranking da *própria* classe hoje.

**Fórmula (Treasuries, Security Score v2):**

\[
S = 0.35\,p_{\text{Trend}} + 0.25\,p_{\text{RSI}} + 0.20\,p_{\text{Volume}} + 0.20\,p_{\text{COT}}
\]

VGSH:

\[
\begin{align*}
S &= 0.35\times 1.00 + 0.25\times 1.00 + 0.20\times 0.68 + 0.20\times 0.50 \\
  &= 0.35 + 0.25 + 0.136 + 0.10 \\
  &= 0.836
\end{align*}
\]

O rótulo debaixo do número é `instrumentQuality`, não um “rating de compra”:

| \(S\) | Qualidade | UI |
|-------|-----------|-----|
| \(\ge 0.65\) | Preferred | Among the best |
| \(\ge 0.25\) | Competitive | In the middle |
| \(< 0.25\) | Weak | Among the weakest |

VGSH \(0.836 \ge 0.65\) → Preferred.

**O que não é:** comparação com Cash, HY ou ações. 0.836 em Treasuries ≠ “melhor que um equity 0.70”.

Duration usada para VGSH no mapa estático: **1.9 anos** (`motor/config/treasury_duration_map.json`). SHY/SPTS/SCHO usam o mesmo D — o rank diferencia o *preço vs médias / D* e o RSI / D, não a duration em si.

---

## 2. Vol 15d `2.9M` · `4%`

**Pergunta:** quantas cotas transacionam, em média, e que fração isso é da classe *na watchlist*.

Não entra no Score. É Yahoo EOD, janela de **15 sessões** com volume > 0 (`VOLUME_SESSIONS` em `lib/motor/enrich-yahoo-perf.ts`):

\[
\bar{V}_{15} = \frac{1}{k}\sum_{i=1}^{k} V_{t-i+1},\quad k = \min(15,\;\text{sessões com }V>0)
\]

(mínimo 5 sessões; senão a célula é —.)

Formato: \(2.9\times 10^6\) cotas → `2.9M`.

A percentagem é a fatia *entre os nomes da tabela desta classe hoje*, não do universo Yahoo inteiro:

\[
\text{share} = 100 \times \frac{\bar{V}_{15}(\text{VGSH})}{\sum_{j \in \text{classe visível}} \bar{V}_{15}(j)}
\]

VGSH = 4% da liquidez visível de Treasuries naquela tela.

O **Volume 20%** da direita é outra conta: percentil do volume *bruto do dia do snapshot* contra os pares do motor, não a média de 15 sessões.

---

## 3. 1D / 7D / 15D

**Pergunta:** o que o preço fez. Nunca alimenta Money, Score ou To buy.

Lookback em **barras de pregão**, não em dias de calendário (`perfFromCloses`):

\[
r_n = 100 \times \frac{P_t - P_{t-n}}{P_{t-n}}
\]

| Coluna | \(n\) | VGSH |
|--------|------|------|
| 1D | 1 | +0.01% |
| 7D | 7 | +0.23% |
| 15D | 15 | +0.37% |

Verde = \(r > 0\). Um +7% com Money `×` continua sendo preço, não autorização de entrada.

---

## 4. Trend `↑` Increase

**Pergunta:** estágio *deste papel* a partir do Security Score. **Não** é o estágio da classe (esse está na linha “The whole class” acima da tabela).

Do motor (`_security_estagio`):

| Security Score | `estagio` | UI |
|----------------|-----------|-----|
| \(\ge 0.65\) | Ascendente | Increase `↑` |
| \(\ge 0.25\) | Maduro | Hold `●` |
| \(< 0.25\) | Descendente | Reduce `↓` |

VGSH \(0.836 \ge 0.65\) → Increase. Por isso a seta verde no *nome* pode coexistir com To buy **Class**: o papel já passou o corte; a manga ainda não.

---

## 5. Money `…` Wait · Gain 84 · Risk 34

Três números, duas funções.

### 5.1 O glifo (`…`)

Fonte de verdade: `entryTiming` do motor. Árvore em [motor-timing-entrada-por-classe.md](motor-timing-entrada-por-classe.md). Buy fora de Cash exige **ao mesmo tempo**:

- classe `Overweight` (regime \(\ge 0.65\))
- papel `Preferred` (security \(\ge 0.65\))

VGSH é Preferred, mas a classe está em Hold → **Wait** (`…`). Não é um “quase Buy” no glifo; o “quanto falta” é a coluna To buy.

| `entryTiming` | Glifo | UI |
|---------------|-------|-----|
| Buy | `+` | Can add |
| Wait | `…` | Wait |
| Avoid | `×` | Do not add |
| Neutral | `~` | Indifferent (só Cash) |

### 5.2 Gain

\[
\text{Gain} = \operatorname{round}(100 \times S)
\]

VGSH: \(\operatorname{round}(83.6) = 84\). É o Security Score em 0–100. Não é retorno esperado.

### 5.3 Risk

Mistura clima da **classe** (70%) com quão fraco o **papel** é vs pares (30%). `lib/motor/entry-setup.ts`:

\[
\begin{align*}
\text{nameRisk} &= 100 - \text{Gain} \\
\text{Risk} &= \operatorname{round}\bigl(0.7 \times \text{sleeveRisk} + 0.3 \times \text{nameRisk}\bigr)
\end{align*}
\]

`sleeveRisk` vem do estágio da *classe* (não do Trend da linha):

| Classe | sleeveRisk |
|--------|------------|
| Increase | 18 |
| Hold | 42 |
| Reduce | 72 |
| Reduce hard | 90 |

VGSH: Gain 84 → nameRisk 16. Risk 34 implica classe em **Hold**:

\[
\operatorname{round}(0.7\times 42 + 0.3\times 16) = \operatorname{round}(29.4 + 4.8) = 34
\]

Gain alto com Risk moderado e Money `…` é o caso Treasuries de VGSH: bom veículo, manga ainda em Hold.

---

## 6. To buy `0.10` · Class

**Pergunta:** quanto falta para o motor virar Buy. App layer; não muda `entryTiming`.

Dois eixos (classes não-Cash):

\[
\begin{align*}
d_{\text{regime}} &= \max(0,\; 0.65 - \text{regimeScore}) \\
d_{\text{papel}}  &= \max(0,\; 0.65 - S) \\
\text{To buy}     &= \max(d_{\text{regime}},\, d_{\text{papel}})
\end{align*}
\]

O número é o **gargalo**, não a média. Zero = Buy. O rótulo diz *qual* eixo atrasou: **Class** = regime, **Name** = security.

VGSH: \(S = 0.836 \ge 0.65\) → \(d_{\text{papel}} = 0\). To buy 0.10 Class →

\[
d_{\text{regime}} = 0.10 \implies \text{regimeScore} = 0.55
\]

\(0.45 \le 0.55 < 0.65\) confirma Hold. Falta a classe virar Overweight; o papel já é Preferred.

Estados sem número (não “0.10 de um veto”):

| Estado | Quando | UI |
|--------|--------|-----|
| Blocked | Reduce / Strong Reduce sem divergência+Preferred, ou Weak | Blocked · Reduce / Weak |
| Watch | Reduce + diverge + Preferred | Watch · Diverges |
| Ready | os dois eixos em 0 | 0.00 · Can add |

Cash ignora \(d_{\text{papel}}\) (só regime).

---

## 7. Factor `Trend`

O ingrediente com **maior \(|\text{contribuição}|\)** no dia:

\[
\text{contribuição}_i = w_i \times p_i
\]

VGSH:

| Pilar | \(w \times p\) | \|contrib\| |
|-------|----------------|-------------|
| Trend | \(0.35 \times 1.00 = 0.35\) | 0.35 ← dominante |
| RSI | \(0.25 \times 1.00 = 0.25\) | 0.25 |
| Volume | \(0.20 \times 0.68 = 0.136\) | 0.136 |
| COT | \(0.20 \times 0.50 = 0.10\) | 0.10 |

Por isso a célula diz Trend: é *a razão nº 1* de o Score estar em 0.836, não um sinal de compra.

---

## 8. Pilares (Score mix)

Pesos fixos da receita Treasuries (`motor/config/indicadores_tecnicos_treasury.json`). O número na célula é o percentil \(p\) que entra em \(S\), não o RSI 14 bruto nem o volume em cotas.

### 8.1 Trend 35% — `1.00` Adds

Preço vs médias, **dividido pela duration**, para TLT não ganhar só porque se mexe mais:

\[
\begin{align*}
x_{50}  &= \frac{P/\mathrm{MM}_{50} - 1}{D},\quad
x_{200} = \frac{P/\mathrm{MM}_{200} - 1}{D} \\
p_{\text{Trend}} &= \tfrac{1}{2}\bigl(p_{\text{cs}}(x_{50}) + p_{\text{cs}}(x_{200})\bigr)
\end{align*}
\]

VGSH \(D = 1.9\). \(p = 1.00\): no dia do snapshot, era o (ou empatado no) melhor ponto da curva *por unidade de risco de taxa*.

### 8.2 RSI 25% — `1.00` Adds

RSI 14 de Wilder (EWMA \(\alpha = 1/14\)) aplicado ao **retorno diário / duration**, não ao preço cru:

\[
\Delta_t = \frac{P_t/P_{t-1} - 1}{D},\quad
\text{RSI}_t = 100 - \frac{100}{1 + \mathrm{RS}_t}
\]

Depois, percentil cruzado desse RSI contra os pares. VGSH 1.00 = momentum por unidade de duration no topo da classe.

### 8.3 Volume 20% — `0.68` Adds

Volume **bruto do dia** (cotas no snapshot), percentil cruzado, *não* invertido — mais volume é melhor (entrar/sair sem mover o preço). 0.68 ≥ 0.65 → Adds. Distinto do **Vol 15d** da esquerda.

### 8.4 COT 20% — `0.50` Neutral

Único voto **contrarian**, e **igual para todos os Treasuries** no dia: não ranqueia VGSH vs TLT.

1. Série semanal CFTC net Treasuries, último print **segurado** até a próxima (sem interpolar).
2. \(|z|\) vs ~5 anos (1260 sessões).
3. Percentil temporal de crowding: \(c = P(|z|)\).
4. Invertido: \(p_{\text{COT}} = 1 - c\).

\(p = 0.50\) → crowding na mediana da história → Neutral. Contribuição \(0.20 \times 0.50 = 0.10\) para *cada* nome da classe.

---

## 9. Como as colunas se encadeiam (VGSH)

```text
pilares 1.00 / 1.00 / 0.68 / 0.50
        └──────────┬──────────┘
                   S = 0.836  →  Preferred  →  Gain 84
                   │                         Trend ↑ (S ≥ 0.65)
                   │
regime ≈ 0.55 Hold → sleeveRisk 42 → Risk 34
                   │
                   ├─ Money …  (falta Overweight ∧ já tem Preferred)
                   └─ To buy 0.10 Class
```

Ler a linha da esquerda para a direita:

1. Os pilares **constroem** o Score.
2. O Score **rotula** qualidade, Gain e Trend do nome.
3. 1D/7D/15D e Vol 15d são **mercado**, à parte.
4. Money combina Score + regime da classe (árvore).
5. To buy **quantifica** o eixo que a árvore ainda não fechou.

---

## 10. O que esta linha não está dizendo

- “Compre VGSH.” Money `…` é Wait.
- “A classe Treasuries está tão forte quanto o papel.” To buy Class diz o contrário: falta 0.10 no regime.
- “COT 0.50 é um problema de VGSH.” É o crowding da *curva*, o mesmo número em SHY e TLT naquele dia.
- Comparar 0.836 de VGSH com o Score de um equity ou de Cash.

Educacional — não é assessoria de investimento.
