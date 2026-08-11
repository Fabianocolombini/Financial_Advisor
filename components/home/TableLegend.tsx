"use client";

/**
 * Reading guide for the market table.
 *
 * Every column here answers a different question, and two of them used to be
 * named after the model's internals ("Stage", "Entry / Validated") rather than
 * after the question. This panel states the question each column answers, so the
 * table can be read without knowing how the motor works.
 */

const ENTRIES: { term: string; text: string }[] = [
  {
    term: "Score",
    text: "Onde este papel fica no ranking da própria classe, de 0 a 1. 0,5 é o papel mediano do grupo; quanto mais alto, melhor ele se compara aos concorrentes diretos. Não compara classes diferentes — o score alto de um papel de caixa não o torna melhor que uma ação com score parecido. Abra “Como o score é calculado” abaixo de cada tabela para ver os ingredientes daquela classe.",
  },
  {
    term: "Volume 15d",
    text: "Quantos papéis, em média, foram negociados por dia nas últimas 15 sessões, e quanto isso representa do volume da classe. É a massa realmente negociada: volume alto significa entrar e sair sem mexer no preço.",
  },
  {
    term: "Tendência",
    text: "Para onde a classe está indo. Aumentar = o vento está a favor, faz sentido colocar mais dinheiro. Manter = sem direção definida, segure o que já tem sem acelerar. Reduzir = a tendência virou contra — não quer dizer que já deu prejuízo, quer dizer que a direção mudou. Reduzir forte = corte a exposição.",
  },
  {
    term: "Dinheiro novo",
    text: "Se vale colocar dinheiro novo neste papel agora. Pode aportar = a classe está favorável e o papel está entre os melhores do grupo. Esperar = é elegível, mas falta confirmação. Não aportar = o modelo desaconselha entrar agora (quem já tem posição não precisa vender por causa disso). Indiferente = é reserva de caixa, onde não existe momento bom ou ruim de entrada.",
  },
  {
    term: "Principal fator",
    text: "O ingrediente que mais pesou no score deste papel hoje — o motivo número um de ele estar onde está no ranking.",
  },
];

export function TableLegend() {
  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
        Como ler esta tabela
      </summary>

      <dl className="mt-3 space-y-2.5">
        {ENTRIES.map((e) => (
          <div key={e.term}>
            <dt className="text-xs font-medium text-zinc-200">{e.term}</dt>
            <dd className="text-[11px] leading-relaxed text-zinc-500">{e.text}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
        Dentro de cada classe os papéis vêm ordenados do maior para o menor score.
        Os scores são recalculados todo dia para os papéis mais líquidos (~90% do
        volume da classe); um símbolo recém-marcado com ★ é calculado sob demanda e
        aparece depois de 1–2 minutos.
      </p>
    </details>
  );
}
