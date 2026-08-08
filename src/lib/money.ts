/**
 * Medusa v2 stores money in major units (e.g. 20.5 for €20.50).
 * Finbaze stores money in integer minor units (e.g. 2050 cents).
 */

export function currencyDecimals(currency: string): number {
  try {
    return (
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency.toUpperCase(),
      }).resolvedOptions().maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

/** Convert a Medusa major-unit amount to Finbaze minor units. */
export function toMinorUnits(
  amount: unknown,
  currency = "EUR",
): number {
  let value = 0
  if (typeof amount === "number") {
    value = amount
  } else if (typeof amount === "string") {
    value = Number(amount)
  } else if (
    typeof amount === "object" &&
    amount !== null &&
    "numeric" in amount
  ) {
    value = Number((amount as { numeric?: number }).numeric ?? 0)
  } else if (amount != null) {
    value = Number(amount)
  }
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10 ** currencyDecimals(currency))
}
