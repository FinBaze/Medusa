import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import { syncMedusaProductToFinbaze } from "../lib/product-sync"

export default async function productCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  ensureFinbazeService(container)

  const productModule = container.resolve("product")
  const product = await productModule.retrieveProduct(data.id, {
    relations: ["variants", "variants.prices"],
  })

  await syncMedusaProductToFinbaze({ product })
}

export const config: SubscriberConfig = {
  event: "product.created",
}
