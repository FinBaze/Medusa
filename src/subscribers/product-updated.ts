import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import { loadMedusaProductWithPrices } from "../lib/load-medusa-products"
import { syncMedusaProductToFinbaze } from "../lib/product-sync"

export default async function productUpdatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    ensureFinbazeService(container)

    const product = await loadMedusaProductWithPrices(container, data.id)
    if (!product) return

    await syncMedusaProductToFinbaze({ product })
  } catch (error) {
    console.warn(
      "[finbaze] product.updated sync failed",
      data.id,
      error instanceof Error ? error.message : error,
    )
  }
}

export const config: SubscriberConfig = {
  event: "product.updated",
}
