import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { ensureFinbazeService } from "../../../../lib/ensure-service"
import { listImportedInvoices } from "../../../../lib/imported-invoices"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  ensureFinbazeService(req.scope)

  const page = Math.max(1, Number(req.query.page ?? "1") || 1)
  const preview = await listImportedInvoices({ page })

  if (!preview.connected || preview.rows.length === 0) {
    res.json(preview)
    return
  }

  const orderNamesById = new Map<string, string>()
  try {
    const orderModule = req.scope.resolve(Modules.ORDER)
    const orders = await orderModule.listOrders(
      { id: preview.rows.map((row) => row.medusaOrderId) },
      { select: ["id", "display_id"] },
    )
    for (const order of orders as Array<{
      id: string
      display_id?: number | null
    }>) {
      if (order.display_id != null) {
        orderNamesById.set(order.id, `#${order.display_id}`)
      }
    }
  } catch {
    // Order names are optional display enrichment.
  }

  if (orderNamesById.size === 0) {
    res.json(preview)
    return
  }

  res.json({
    ...preview,
    rows: preview.rows.map((row) => ({
      ...row,
      orderName: orderNamesById.get(row.medusaOrderId) ?? row.orderName,
    })),
  })
}
