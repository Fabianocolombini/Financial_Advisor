"use client";

import { flagUrl, inferCountryCode, symbolLogoUrl } from "@/lib/catalog/symbol-visual";
import { useState } from "react";

type SymbolAvatarProps = {
  symbol: string;
  exchange: string;
  classId: string;
  size?: "xs" | "sm" | "md" | "lg";
};

export function SymbolAvatar({
  symbol,
  exchange,
  classId,
  size = "md",
}: SymbolAvatarProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const country = inferCountryCode(symbol, exchange, classId);
  const dim =
    size === "xs"
      ? "h-6 w-6"
      : size === "sm"
        ? "h-8 w-8"
        : size === "lg"
          ? "h-12 w-12"
          : "h-9 w-9";
  const flagDim =
    size === "xs"
      ? "h-2.5 w-2.5"
      : size === "sm"
        ? "h-3.5 w-3.5"
        : size === "lg"
          ? "h-5 w-5"
          : "h-4 w-4";

  return (
    <div className={`relative shrink-0 ${dim}`}>
      <div
        className={`flex ${dim} items-center justify-center overflow-hidden rounded-full bg-zinc-900 ring-1 ring-zinc-800`}
      >
        {!logoFailed ? (
          <img
            src={symbolLogoUrl(symbol)}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <span className={`font-black text-zinc-400 ${size === "xs" ? "text-[8px]" : "text-[10px]"}`}>
            {symbol.slice(0, 2)}
          </span>
        )}
      </div>
      {country ? (
        <img
          src={flagUrl(country)}
          alt=""
          className={`absolute -bottom-0.5 -right-0.5 ${flagDim} rounded-full object-cover ring-2 ring-black`}
        />
      ) : null}
    </div>
  );
}
