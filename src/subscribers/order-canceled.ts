import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import { syncMedusaOrder } from "../lib/order-sync"

export default async function orderCanceledHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  ensureFinbazeService(container)

  const orderModule = container.resolve("order")
  const order = await orderModule.retrieveOrder(data.id, {
    relations: ["items", "shipping_methods", "customer"],
  })

  await syncMedusaOrder({
    order: { ...order, status: "canceled" },
    mode: "event",
    event: "order.canceled",
  })
}

export const config: SubscriberConfig = {
  event: "order.canceled",
}
