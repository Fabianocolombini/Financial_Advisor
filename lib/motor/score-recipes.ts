/**
 * What the score of each asset class is actually made of.
 *
 * The score is not an absolute measure of how good an investment is. It is a
 * ranking *inside one class*: each ingredient below is turned into a position
 * relative to the peers scored on the same day (0 = worst of the group, 1 = best),
 * and the score is the weighted average of those positions. A 0.62 in Cash and a
 * 0.62 in US Equity therefore say the same thing about the peer group and nothing
 * about which of the two sleeves to prefer.
 *
 * Weights mirror `motor/config/models/*_regime.json`; ingredient descriptions
 * mirror the corresponding `motor/src/calculo/*_security_score.py`.
 */

export type ScoreIngredient = {
  label: string;
  weight: number;
  /** Explains the direction: what counts as good for this ingredient. */
  meaning: string;
};

export type ScoreRecipe = {
  headline: string;
  ingredients: ScoreIngredient[];
};

const RECIPES: Record<string, ScoreRecipe> = {
  cash_equivalents: {
    headline:
      "Em caixa o score mede qual papel guarda dinheiro melhor — não qual vai render mais.",
    ingredients: [
      { label: "Volume negociado", weight: 0.4, meaning: "mais líquido é melhor: dá para entrar e sair sem custo" },
      { label: "Volatilidade 20 dias", weight: 0.35, meaning: "menos oscilação é melhor: caixa não deve balançar" },
      { label: "Distância da média de 50 dias", weight: 0.25, meaning: "quanto mais colado na média, melhor: preço esticado é anomalia" },
    ],
  },
  fi_treasury: {
    headline: "Em treasuries o score premia o ponto da curva com melhor momentum e liquidez.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.35, meaning: "preço acima das médias de 50 e 200 dias" },
      { label: "Momentum (RSI)", weight: 0.25, meaning: "força recente do movimento" },
      { label: "Volume negociado", weight: 0.2, meaning: "mais líquido é melhor" },
      { label: "Posicionamento (COT)", weight: 0.2, meaning: "desconto quando o mercado está aglomerado no mesmo trade" },
    ],
  },
  fi_ig: {
    headline: "Em crédito grau de investimento o score combina técnica com o encaixe da duration no cenário.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.3, meaning: "preço acima das médias" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "força recente do movimento" },
      { label: "Volume negociado", weight: 0.15, meaning: "mais líquido é melhor" },
      { label: "Encaixe da duration", weight: 0.35, meaning: "duration adequada ao prêmio de prazo atual" },
    ],
  },
  fi_hy: {
    headline: "Em high yield o score premia tendência e pune volatilidade, que é o risco real da classe.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.35, meaning: "preço acima das médias" },
      { label: "Momentum (RSI)", weight: 0.25, meaning: "força recente do movimento" },
      { label: "Volume negociado", weight: 0.15, meaning: "mais líquido é melhor" },
      { label: "Volatilidade 20 dias", weight: 0.25, meaning: "desconto para quem oscila mais que os pares" },
    ],
  },
  fi_tips: {
    headline: "Em TIPS o score combina técnica com o encaixe da duration no juro real.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.3, meaning: "preço acima das médias" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "força recente do movimento" },
      { label: "Volume negociado", weight: 0.15, meaning: "mais líquido é melhor" },
      { label: "Encaixe no juro real", weight: 0.35, meaning: "duration adequada ao juro real atual" },
    ],
  },
  fi_preferred: {
    headline: "Em preferenciais o score pesa renda e tendência, descontando oscilação.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.3, meaning: "preço acima das médias" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "força recente do movimento" },
      { label: "Dividend yield", weight: 0.25, meaning: "renda distribuída vs pares" },
      { label: "Volatilidade 20 dias", weight: 0.25, meaning: "desconto para quem oscila mais" },
    ],
  },
  us_equity: {
    headline: "Em ações americanas o score premia tendência e momentum, descontando volatilidade.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.35, meaning: "preço acima das médias de 50 e 200 dias" },
      { label: "Momentum (RSI)", weight: 0.25, meaning: "força recente do movimento" },
      { label: "Volume negociado", weight: 0.2, meaning: "mais líquido é melhor" },
      { label: "Volatilidade 20 dias", weight: 0.2, meaning: "desconto para quem oscila mais que os pares" },
    ],
  },
  intl_equity: {
    headline: "Em ações internacionais o score inclui o quanto o papel depende do dólar.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.3, meaning: "preço acima das médias" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "força recente do movimento" },
      { label: "Estabilidade", weight: 0.2, meaning: "menos oscilação é melhor" },
      { label: "Exposição cambial", weight: 0.3, meaning: "sensibilidade ao dólar próxima do alvo da classe" },
    ],
  },
  em_equity: {
    headline: "Em emergentes o score inclui o quanto o papel depende da China.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.3, meaning: "preço acima das médias" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "força recente do movimento" },
      { label: "Volume negociado", weight: 0.2, meaning: "mais líquido é melhor" },
      { label: "Exposição à China", weight: 0.3, meaning: "sensibilidade à China próxima do alvo da classe" },
    ],
  },
  reits: {
    headline: "Em REITs o score pesa renda e tendência, descontando oscilação.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.3, meaning: "preço acima das médias" },
      { label: "Dividend yield", weight: 0.25, meaning: "renda distribuída vs pares" },
      { label: "Volume negociado", weight: 0.25, meaning: "mais líquido é melhor" },
      { label: "Volatilidade 20 dias", weight: 0.2, meaning: "desconto para quem oscila mais" },
    ],
  },
  credito_alternativo: {
    headline: "Em crédito alternativo o score olha o desconto sobre o valor patrimonial.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.25, meaning: "preço acima das médias" },
      { label: "Desconto sobre o NAV", weight: 0.3, meaning: "comprar abaixo do valor patrimonial é melhor" },
      { label: "Dividend yield", weight: 0.25, meaning: "renda distribuída vs pares" },
      { label: "Volatilidade 20 dias", weight: 0.2, meaning: "desconto para quem oscila mais" },
    ],
  },
  commodities_precious: {
    headline: "Em metais preciosos o score inclui o custo do fundo, que corrói o retorno no longo prazo.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.35, meaning: "preço acima das médias" },
      { label: "Momentum (RSI)", weight: 0.25, meaning: "força recente do movimento" },
      { label: "Volume negociado", weight: 0.25, meaning: "mais líquido é melhor" },
      { label: "Taxa de administração", weight: 0.15, meaning: "mais barato é melhor" },
    ],
  },
  commodities_energy: {
    headline: "Em energia o score inclui o quanto o papel acompanha o petróleo.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.35, meaning: "preço acima das médias" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "força recente do movimento" },
      { label: "Volume negociado", weight: 0.2, meaning: "mais líquido é melhor" },
      { label: "Aderência ao petróleo", weight: 0.25, meaning: "sensibilidade ao petróleo próxima do alvo da classe" },
    ],
  },
  energy_mlp: {
    headline: "Em MLPs de energia o score pesa renda e tendência, descontando oscilação.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.3, meaning: "preço acima das médias" },
      { label: "Dividend yield", weight: 0.3, meaning: "renda distribuída vs pares" },
      { label: "Volume negociado", weight: 0.2, meaning: "mais líquido é melhor" },
      { label: "Volatilidade 20 dias", weight: 0.2, meaning: "desconto para quem oscila mais" },
    ],
  },
  healthcare_biotech: {
    headline: "Em saúde e biotecnologia o score inclui a densidade de catalisadores regulatórios.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.25, meaning: "preço acima das médias" },
      { label: "Momentum (RSI)", weight: 0.2, meaning: "força recente do movimento" },
      { label: "Volume negociado", weight: 0.2, meaning: "mais líquido é melhor" },
      { label: "Catalisadores (FDA)", weight: 0.35, meaning: "calendário regulatório da classe" },
    ],
  },
  alt_infrastructure: {
    headline: "Em infraestrutura o score pesa renda, tendência e estabilidade.",
    ingredients: [
      { label: "Tendência de preço", weight: 0.35, meaning: "preço acima das médias" },
      { label: "Dividend yield", weight: 0.25, meaning: "renda distribuída vs pares" },
      { label: "Estabilidade", weight: 0.2, meaning: "menos oscilação é melhor" },
      { label: "Volume negociado", weight: 0.2, meaning: "mais líquido é melhor" },
    ],
  },
  currencies: {
    headline: "Em câmbio o score premia custo baixo, liquidez e a exposição correta ao dólar.",
    ingredients: [
      { label: "Taxa de administração", weight: 0.5, meaning: "mais barato é melhor" },
      { label: "Liquidez", weight: 0.3, meaning: "mais líquido é melhor" },
      { label: "Exposição ao dólar", weight: 0.2, meaning: "sensibilidade ao dólar próxima do alvo da classe" },
    ],
  },
};

export function scoreRecipeFor(classId: string): ScoreRecipe | null {
  return RECIPES[classId] ?? null;
}
