import type { InputHTMLAttributes } from "react";
import { getCurrencySymbol } from "@/lib/money";

/**
 * A type="number" input for a money amount, YNAB-style: a currency symbol
 * pinned to the input's right edge and the browser's native spinner buttons
 * hidden (they'd overlap the suffixed layout and aren't useful for entering
 * an amount with a keyboard anyway). Every other prop — value, onChange,
 * name, className, etc. — passes straight through to the <input>.
 */
export function MoneyInput({
  currency = "USD",
  className = "",
  style,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { currency?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-neutral-600">
        {getCurrencySymbol(currency)}
      </span>
      <input
        type="number"
        step="0.01"
        {...props}
        style={{ paddingRight: "1.5rem", ...style }}
        className={`no-spinner ${className}`}
      />
    </div>
  );
}
