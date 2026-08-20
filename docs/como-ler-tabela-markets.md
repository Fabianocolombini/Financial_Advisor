# Como ler a tabela Markets

Este guia explica, em linguagem simples, o que cada número e ícone da tabela significa. Não é preciso entender fórmula nenhuma — só saber o que cada coluna está respondendo.

A tabela responde duas perguntas sobre cada papel:

1. **Esse papel é bom?** → Score
2. **Está na hora de comprar?** → Trend, Money, To buy

São perguntas independentes. Um papel pode ser ótimo (Score alto) e ainda assim não ser hora de comprar — isso não é contradição, é o sistema separando "qualidade do papel" de "momento do mercado".

A UI em inglês usa estas mesmas ideias. Contas por trás: [markets-tabela-matematica-colunas.md](markets-tabela-matematica-colunas.md).

---

## Score — a nota do papel

Um número de 0 a 1 (ex.: 0.836) que compara o papel com os outros da mesma classe (só Treasuries com Treasuries, só Cash com Cash — nunca entre classes diferentes).

| Faixa | Selo |
|---|---|
| 0.65 ou mais | **Among the best** |
| 0.25 a 0.65 | **In the middle** |
| Abaixo de 0.25 | **Among the weakest** |

Pense nisso como uma prova: o Score diz a posição do papel na turma, não se é um bom momento pra comprar.

---

## Trend — a seta ao lado do Score

Mostra a fase do papel, calculada a partir do próprio Score:

| Ícone | Fase | Quando aparece |
|---|---|---|
| 🟢 ↑ verde, seta pra cima | **Increase** | Score ≥ 0.65 |
| 🟡 ● amarelo, bolinha | **Hold** | Score entre 0.25 e 0.65 |
| 🔴 ↓ vermelho, seta pra baixo | **Reduce** | Score abaixo de 0.25 |

Sim, existe um índice por trás — é o próprio Score do papel, só que traduzido em 3 faixas visuais em vez de um número. Não é um indicador novo, é o Score "com cara de semáforo".

A linha **The whole class** acima da tabela é outra coisa: o clima da *classe inteira*, que pode estar em Hold enquanto este papel está em Increase.

---

## Money — o sinal de entrada

O ícone central da tabela. É a resposta oficial do sistema para "posso colocar dinheiro nesse papel agora?".

| Ícone | Significado |
|---|---|
| **+** | **Pode comprar** — o papel e a classe estão alinhados |
| **…** | **Espere** — o papel já está pronto, mas a classe ainda não deu sinal |
| **×** | **Não compre agora** — a classe está desfavorável; quem já tem não precisa vender só por causa disso |
| **~** | **Indiferente** (só aparece em Cash) — não existe "timing" de preço em caixa |

Ao lado do ícone aparece **Risk**, um número de 0 a 100 que resume o quão arriscado é o momento — misturando principalmente o clima da classe inteira com, em menor peso, a força do próprio papel. Risk baixo = ambiente calmo. Risk alto = ambiente tenso (normalmente porque a classe como um todo está em um momento ruim, não porque o papel específico é ruim).

O número Gain (Score × 100) não aparece na tabela: era o Score numa outra escala.

---

## To buy — quanto falta

Essa coluna existe pra responder exatamente a dúvida "o papel já é ótimo, então por que não é Buy ainda?". Ela mostra **a distância que falta** e **de quem é a demora**.

### Quando aparece um número

| Exemplo | Leitura |
|---|---|
| `0.10 · Class` | Falta pouco (0.10) — e quem está devendo é **a classe**, não o papel |
| `0.19 · Name` | Falta um pouco mais — e quem está devendo é **o próprio papel** |
| `0.00 · Can add` | Não falta nada — é Buy |

Regra simples: **quanto menor o número, mais perto está da compra.** Zero significa que já é compra.

O rótulo (`Class` ou `Name`) diz onde está o gargalo:
- **Class** → o papel já está pronto, falta a classe (o mercado daquele tipo de ativo) melhorar
- **Name** → a classe já está favorável, falta esse papel específico melhorar frente aos concorrentes dele

### Quando aparece um estado em vez de número

Nem sempre dá pra medir "quanto falta" — às vezes o caminho está fechado, e aí a coluna troca o número por uma palavra:

| Estado | O que significa |
|---|---|
| **Blocked** | Bloqueado. A classe está em um momento ruim (Reduce) ou o próprio papel está fraco demais. Não é "quase lá" — é "não é a hora, ponto". |
| **Watch** | Situação especial de acompanhar de perto: o papel é excelente mesmo com a classe ruim (um caso raro de "papel indo bem enquanto o resto do grupo vai mal"). Não é compra ainda, mas merece atenção porque pode virar antes do normal. |

**Resumindo em uma frase**: número pequeno = perto de comprar; Blocked = esquece por enquanto; Watch = fica de olho, é um caso fora da curva.

---

## Juntando tudo — como ler uma linha, do começo ao fim

1. Olhe o **Score** → o papel é bom?
2. Olhe o **Trend** (a seta) → em que fase ele está?
3. Olhe o **Money** → o sistema libera comprar agora?
4. Se não libera, olhe o **To buy** → quanto falta, e é o papel ou a classe que está travando?

Um papel pode ter Score altíssimo, Trend verde, e ainda assim Money "…" com To buy pequeno rotulado "Class" — isso não é erro do sistema. Significa: **o papel está pronto, só falta o mercado daquele tipo de ativo dar o sinal de entrada.**

Educacional — não é assessoria de investimento.
