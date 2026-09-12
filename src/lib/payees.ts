/**
 * The payee name createAccount (src/app/accounts/actions.ts) gives a
 * nonzero starting balance's synthetic transaction. Shared here so the
 * three places that create, filter, or specially render that convention's
 * rows - createAccount, accounts/all's "exclude these from the list"
 * query, and TransactionsTable's "can't be categorized" special-case -
 * import one constant instead of independently retyping the literal and
 * risking drift (#48).
 */
export const STARTING_BALANCE_PAYEE = "Starting Balance";
