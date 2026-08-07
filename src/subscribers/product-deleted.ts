import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import { deactivateMedusaProductInFinbaze } from "../lib/product-sync"

export default async function productDeletedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  ensureFinbazeService(container)
  await deactivateMedusaProductInFinbaze({ medusaProductId: data.id })
}

export const config: SubscriberConfig = {
  event: "product.deleted",
}
