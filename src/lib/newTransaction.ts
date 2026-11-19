import { numberToMilliunits } from "@/lib/money";

/**
 * The fields createTransaction reads off a new-row form. Kept out of the
 * server-actions module: every export there has to be an async action.
 */
export function readNewTransaction(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) throw new Error("accountId is required");
  const dateInput = String(formData.get("date") ?? "");
  if (!dateInput) throw new Error("Date is required");
  return {
    accountId,
    payeeName: String(formData.get("payeeName") ?? "").trim(),
    categoryId: String(formData.get("categoryId") ?? "") || null,
    memo: String(formData.get("memo") ?? "").trim() || null,
    amount: numberToMilliunits(Number(formData.get("amount")) || 0),
    date: new Date(dateInput),
    transferAccountId: String(formData.get("transferAccountId") ?? "") || null,
    linkTransactionId: String(formData.get("linkTransactionId") ?? "") || null,
  };
}
