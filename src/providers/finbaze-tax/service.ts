import type {
  ITaxProvider,
  ItemTaxCalculationLine,
  ItemTaxLineDTO,
  Logger,
  ShippingTaxCalculationLine,
  ShippingTaxLineDTO,
  TaxCalculationContext,
} from "@medusajs/framework/types"
import { getStoreKey, type FinbazePluginOptions } from "../../lib/config"
import {
  authFromLink,
  loadConnectedLink,
  quoteSalesTax,
  type QuoteSalesTaxLineInput,
} from "../../lib/finbaze-client"
import { tryGetFinbazeModuleService } from "../../lib/module-access"

type InjectedDependencies = {
  logger: Logger
}

function toNumber(value: unknown): number {
  if (value == null) return 0
  if (typeof value === "number") return value
  if (typeof value === "object" && value !== null && "numeric" in value) {
    return Number((value as { numeric?: number }).numeric ?? 0)
  }
  return Number(value)
}

function customerVatNumber(context: TaxCalculationContext): string | undefined {
  const fromMeta = context.customer?.metadata?.vat_number
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.trim()
  }
  const fromAdditional = context.additional_context?.customer_vat_number
  if (typeof fromAdditional === "string" && fromAdditional.trim()) {
    return fromAdditional.trim()
  }
  return undefined
}

async function resolveFinbazeProductId(
  storeKey: string,
  medusaProductId?: string | null,
): Promise<string | undefined> {
  if (!medusaProductId) return undefined
  const service = tryGetFinbazeModuleService()
  if (!service) return undefined
  const links = await service.listProductLinks({
    store_key: storeKey,
    medusa_product_id: medusaProductId,
  })
  return links[0]?.finbaze_product_id
}

export default class FinbazeTaxProvider implements ITaxProvider {
  static identifier = "finbaze"

  protected logger_: Logger
  protected options_: FinbazePluginOptions
  protected storeKey_: string

  constructor(
    { logger }: InjectedDependencies,
    options: FinbazePluginOptions = {},
  ) {
    this.logger_ = logger
    this.options_ = options
    this.storeKey_ = getStoreKey(options.storeKey)
  }

  getIdentifier(): string {
    return FinbazeTaxProvider.identifier
  }

  async getTaxLines(
    itemLines: ItemTaxCalculationLine[],
    shippingLines: ShippingTaxCalculationLine[],
    context: TaxCalculationContext,
  ): Promise<(ItemTaxLineDTO | ShippingTaxLineDTO)[]> {
    const destinationCountry = (
      context.address?.country_code ?? ""
    ).toUpperCase()
    if (!destinationCountry) {
      this.logger_.warn(
        "Finbaze tax provider: missing destination country; returning empty tax lines",
      )
      return []
    }

    const link = await loadConnectedLink(this.storeKey_).catch(() => null)
    if (!link) {
      this.logger_.warn(
        "Finbaze tax provider: store is not connected; returning empty tax lines",
      )
      return []
    }

    const auth = authFromLink(link)
    const quoteLines: QuoteSalesTaxLineInput[] = []

    for (const item of itemLines) {
      const productId = await resolveFinbazeProductId(
        this.storeKey_,
        item.line_item.product_id,
      )
      quoteLines.push({
        externalLineId: `item:${item.line_item.id}`,
        productId,
        quantity: toNumber(item.line_item.quantity) || 1,
        unitPriceMinor: Math.round(toNumber(item.line_item.unit_price)),
        currency: item.line_item.currency_code?.toUpperCase(),
        isShipping: false,
      })
    }

    for (const shipping of shippingLines) {
      quoteLines.push({
        externalLineId: `shipping:${shipping.shipping_line.id}`,
        quantity: 1,
        unitPriceMinor: Math.round(toNumber(shipping.shipping_line.unit_price)),
        currency: shipping.shipping_line.currency_code?.toUpperCase(),
        isShipping: true,
      })
    }

    if (quoteLines.length === 0) {
      return []
    }

    let quote
    try {
      quote = await quoteSalesTax(auth, {
        destinationCountry,
        customerVatNumber: customerVatNumber(context),
        lines: quoteLines,
      })
    } catch (error) {
      this.logger_.error(
        `Finbaze quoteSalesTax failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      throw error
    }

    const byExternalId = new Map(
      (quote.lines ?? []).map((line) => [line.externalLineId, line]),
    )

    const taxLines: (ItemTaxLineDTO | ShippingTaxLineDTO)[] = []

    for (const item of itemLines) {
      const result = byExternalId.get(`item:${item.line_item.id}`)
      if (!result) continue
      taxLines.push({
        rate: result.ratePercent,
        name: result.name?.trim() || result.taxCode,
        code: result.taxCode,
        line_item_id: item.line_item.id,
        provider_id: this.getIdentifier(),
      })
    }

    for (const shipping of shippingLines) {
      const result = byExternalId.get(`shipping:${shipping.shipping_line.id}`)
      if (!result) continue
      taxLines.push({
        rate: result.ratePercent,
        name: result.name?.trim() || result.taxCode,
        code: result.taxCode,
        shipping_line_id: shipping.shipping_line.id,
        provider_id: this.getIdentifier(),
      })
    }

    return taxLines
  }
}
