import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import {
  loadMedusaProductIdForVariant,
  loadMedusaProductWithPrices,
} from "../lib/load-medusa-products"
import { syncMedusaProductToFinbaze } from "../lib/product-sync"

/**
 * Variant-only edits often do not emit `product.updated`.
 * Re-sync the parent product (all variants) so Finbaze stays current.
 */
export default async function productVariantUpsertedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    ensureFinbazeService(container)

    const productId = await loadMedusaProductIdForVariant(container, data.id)
    if (!productId) return

    const product = await loadMedusaProductWithPrices(container, productId)
    if (!product) return

    await syncMedusaProductToFinbaze({ product })
  } catch (error) {
    console.warn(
      "[finbaze] product-variant sync failed",
      data.id,
      error instanceof Error ? error.message : error,
    )
  }
}

export const config: SubscriberConfig = {
  event: ["product-variant.created", "product-variant.updated"],
}
