import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import { deactivateMedusaVariantInFinbaze } from "../lib/product-sync"

export default async function productVariantDeletedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    ensureFinbazeService(container)
    await deactivateMedusaVariantInFinbaze({ medusaVariantId: data.id })
  } catch (error) {
    console.warn(
      "[finbaze] product-variant.deleted sync failed",
      data.id,
      error instanceof Error ? error.message : error,
    )
  }
}

export const config: SubscriberConfig = {
  event: "product-variant.deleted",
}
