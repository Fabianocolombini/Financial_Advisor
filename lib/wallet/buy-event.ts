export const WALLET_BUY_EVENT = "fa:wallet-buy";

export type WalletBuyPayload = {
  symbol: string;
  classId: string;
  name: string;
  exchange: string | null;
  kind: string | null;
  lastPrice?: number | null;
};

export function requestWalletBuy(payload: WalletBuyPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WALLET_BUY_EVENT, { detail: payload }));
}
