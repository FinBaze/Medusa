import type { BigNumberValue } from "@medusajs/framework/types"
import type { MarketplaceInvoiceLineInput } from "./finbaze-client"
import { toMinorUnits } from "./money"

/**
 * Medusa v2 money/qty fields use BigNumberValue (number | string | BigNumber).
 * Keep this wide so OrderDTO / OrderLineItemDTO assign cleanly.
 */
export type MedusaNumericLike = BigNumberValue | null | undefined

export type MedusaTaxLineLike = {
  code?: string | null
  rate?: MedusaNumericLike
  total?: MedusaNumericLike
  name?: string | null
}

export type MedusaOrderLineLike = {
  id?: string
  title?: string | null
  product_title?: string | null
  variant_title?: string | null
  quantity?: MedusaNumericLike
  unit_price?: MedusaNumericLike
  /** Major units in Medusa v2 — converted to Finbaze minor units on sync. */
  subtotal?: MedusaNumericLike
  discount_total?: MedusaNumericLike
  tax_total?: MedusaNumericLike
  product_id?: string | null
  variant_id?: string | null
  tax_lines?: MedusaTaxLineLike[] | null
}

export type MedusaShippingLineLike = {
  id?: string
  name?: string | null
  amount?: MedusaNumericLike
  tax_total?: MedusaNumericLike
  tax_lines?: MedusaTaxLineLike[] | null
}

function taxCodeFromLines(
  taxLines?: MedusaTaxLineLike[] | null,
): string | undefined {
  const first = taxLines?.[0]
  if (first?.code?.trim()) return first.code.trim()
  if (first?.name?.trim()) return first.name.trim()
  return undefined
}

/**
 * Build Finbaze draft invoice lines from a Medusa order.
 * Converts Medusa major-unit amounts to Finbaze minor units.
 */
export function buildInvoiceLinesFromMedusaOrder(params: {
  items: MedusaOrderLineLike[]
  shippingMethods?: MedusaShippingLineLike[]
  currency: string
  /** Medusa variant id → Finbaze product id */
  productIdByMedusaVariantId?: Map<string, string>
}): MarketplaceInvoiceLineInput[] {
  const lines: MarketplaceInvoiceLineInput[] = []
  const productMap = params.productIdByMedusaVariantId ?? new Map()
  const currency = params.currency

  for (const item of params.items) {
    const quantity = Number(item.quantity ?? 0)
    if (quantity <= 0) continue

    const unitPrice = toMinorUnits(item.unit_price, currency)
    const discountTotal = toMinorUnits(item.discount_total, currency)
    const discountPerUnit =
      quantity > 0 ? Math.round(discountTotal / quantity) : 0
    const name =
      item.title?.trim() ||
      [item.product_title, item.variant_title].filter(Boolean).join(" / ") ||
      "Item"

    const finbazeProductId = item.variant_id
      ? productMap.get(item.variant_id)
      : undefined

    lines.push({
      name,
      quantity,
      price: unitPrice,
      discount: discountPerUnit > 0 ? discountPerUnit : undefined,
      taxCode: taxCodeFromLines(item.tax_lines),
      productId: finbazeProductId,
    })
  }

  for (const shipping of params.shippingMethods ?? []) {
    const amount = toMinorUnits(shipping.amount, currency)
    if (amount === 0) continue
    lines.push({
      name: shipping.name?.trim() || "Shipping",
      quantity: 1,
      price: amount,
      taxCode: taxCodeFromLines(shipping.tax_lines),
    })
  }

  return lines
}

export function buildCreditLineFromAmounts(params: {
  name: string
  quantity: number
  /** Already in Finbaze minor units */
  unitPriceMinor: number
  taxCode?: string
  productId?: string
}): { name: string; quantity: number; price: number; taxCode?: string; productId?: string } | null {
  if (params.quantity <= 0) return null
  return {
    name: params.name,
    quantity: params.quantity,
    // Credit lines use negative unit prices (Shopify parity)
    price: -Math.abs(params.unitPriceMinor),
    taxCode: params.taxCode,
    productId: params.productId,
  }
}
