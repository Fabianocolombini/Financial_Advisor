/** Tipos de domínio iniciais — evoluir com API/persistência. */

export type Money = {
  amount: number;
  currency: "BRL";
};

export type FinancialGoal = {
  id: string;
  title: string;
  targetAmount: Money;
  deadline?: string;
};

export type AssetSummary = {
  label: string;
  value: Money;
};
