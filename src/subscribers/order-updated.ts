import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import { loadMedusaOrderForInvoice } from "../lib/load-medusa-order"
import { syncMedusaOrder } from "../lib/order-sync"

export default async function orderUpdatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  ensureFinbazeService(container)

  const order = await loadMedusaOrderForInvoice(container, data.id)
  if (!order) return

  await syncMedusaOrder({
    order,
    mode: "event",
    event: "order.updated",
  })
}

export const config: SubscriberConfig = {
  event: "order.updated",
}
