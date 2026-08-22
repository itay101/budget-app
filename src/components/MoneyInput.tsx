import type { InputHTMLAttributes } from "react";
import { getCurrencySymbol } from "@/lib/money";

/**
 * A type="number" input for a money amount, YNAB-style: a currency symbol
 * pinned to the input's left edge and the browser's native spinner buttons
 * hidden (they crowd the prefixed layout and aren't useful for entering an
 * amount with a keyboard anyway). Every other prop — value, onChange,
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
      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-neutral-600">
        {getCurrencySymbol(currency)}
      </span>
      <input
        type="number"
        step="0.01"
        {...props}
        style={{ paddingLeft: "1.5rem", ...style }}
        className={`no-spinner ${className}`}
      />
    </div>
  );
}
