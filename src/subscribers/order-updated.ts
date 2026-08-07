import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ensureFinbazeService } from "../lib/ensure-service"
import { syncMedusaOrder } from "../lib/order-sync"

export default async function orderUpdatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  ensureFinbazeService(container)

  const orderModule = container.resolve("order")
  const order = await orderModule.retrieveOrder(data.id, {
    relations: [
      "items",
      "items.tax_lines",
      "shipping_methods",
      "shipping_methods.tax_lines",
      "shipping_address",
      "customer",
    ],
  })

  await syncMedusaOrder({
    order,
    mode: "event",
    event: "order.updated",
  })
}

export const config: SubscriberConfig = {
  event: "order.updated",
}
