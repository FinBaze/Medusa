import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ensureFinbazeService } from "../../../../lib/ensure-service"
import { syncHistoricalOrders } from "../../../../lib/order-sync"

type SyncBody = {
  limit?: number
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  ensureFinbazeService(req.scope)
  const body = (req.body ?? {}) as SyncBody
  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200)

  const orderModule = req.scope.resolve("order")
  const [orders] = await orderModule.listAndCountOrders(
    {},
    {
      take: limit,
      order: { created_at: "DESC" },
      relations: [
        "items",
        "items.tax_lines",
        "shipping_methods",
        "shipping_methods.tax_lines",
        "shipping_address",
        "customer",
      ],
    },
  )

  const result = await syncHistoricalOrders({ orders })
  res.json(result)
}
