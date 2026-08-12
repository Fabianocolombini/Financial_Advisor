import type { WalletPositionStatus } from "./position-status";

export type WalletHoldingView = {
  id: string;
  symbol: string;
  classId: string;
  name: string;
  exchange: string | null;
  kind: string | null;
  quantity: number;
  costPrice: number;
  purchasedAt: string;
  targetMin: number | null;
  targetMax: number | null;
  notes: string | null;
  last: number | null;
  changePercent: number | null;
  currency: string | null;
  status: WalletPositionStatus;
};

export type WalletAlertView = {
  id: string;
  createdAt: string;
  read: boolean;
  items: Array<{
    symbol: string;
    action: string;
    label: string;
    hint: string;
    pnlPct: number | null;
  }>;
};
