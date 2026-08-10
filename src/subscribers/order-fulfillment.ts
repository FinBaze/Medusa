import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import { loadMedusaOrderForInvoice } from "../lib/load-medusa-order"
import { syncMedusaOrder } from "../lib/order-sync"

/**
 * Fulfillment events vary by Medusa version / workflow.
 * We treat these as "fully fulfilled" candidates and close+send when order is completed.
 */
export default async function orderFulfillmentHandler({
  event: { name, data },
  container,
}: SubscriberArgs<{ id: string; order_id?: string }>) {
  ensureFinbazeService(container)

  const orderId = data.order_id ?? data.id
  if (!orderId) return

  const order = await loadMedusaOrderForInvoice(container, orderId)
  if (!order) return

  await syncMedusaOrder({
    order: {
      ...order,
      metadata: {
        ...(order.metadata ?? {}),
        finbaze_fulfilled: true,
      },
      status: order.status ?? "completed",
    },
    mode: "event",
    event: name ?? "order.fulfillment_created",
  })
}

export const config: SubscriberConfig = {
  event: [
    "order.fulfillment_created",
    "shipment.created",
    "delivery.created",
  ],
}
