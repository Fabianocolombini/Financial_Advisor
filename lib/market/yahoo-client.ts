import YahooFinance from "yahoo-finance2";

/** Shared yahoo-finance2 v3 client (requires explicit construction). */
export const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});
