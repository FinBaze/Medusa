import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import { loadMedusaProductWithPrices } from "../lib/load-medusa-products"
import { syncMedusaProductToFinbaze } from "../lib/product-sync"

export default async function productCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  ensureFinbazeService(container)

  const product = await loadMedusaProductWithPrices(container, data.id)
  if (!product) return

  await syncMedusaProductToFinbaze({ product })
}

export const config: SubscriberConfig = {
  event: "product.created",
}
