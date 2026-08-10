import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import { loadMedusaOrderForInvoice } from "../lib/load-medusa-order"
import { syncMedusaOrder, type MedusaRefundLike } from "../lib/order-sync"

export default async function orderRefundedHandler({
  event: { data },
  container,
}: SubscriberArgs<{
  id: string
  order_id?: string
  amount?: number
  created_at?: string
  items?: MedusaRefundLike["items"]
}>) {
  ensureFinbazeService(container)

  const orderId = data.order_id
  if (!orderId) return

  const order = await loadMedusaOrderForInvoice(container, orderId)
  if (!order) return

  const refund: MedusaRefundLike = {
    id: data.id,
    amount: data.amount,
    created_at: data.created_at,
    items: data.items,
  }

  await syncMedusaOrder({
    order,
    mode: "event",
    event: "order.refund_created",
    refunds: [refund],
  })
}

export const config: SubscriberConfig = {
  event: ["order.refund_created", "refund.created"],
}
