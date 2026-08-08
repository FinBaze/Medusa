import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getStoreKey } from "../../../../lib/config"
import { ensureFinbazeService } from "../../../../lib/ensure-service"

/**
 * Debug helper: wipe local Finbaze link tables for this store.
 * Requires disconnect first so a live connection cannot be cleared by mistake.
 * Does not delete products/invoices in Finbaze — only Medusa-side link rows.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = ensureFinbazeService(req.scope)
  const storeKey = getStoreKey()
  const links = await service.listFinbazeLinks({ store_key: storeKey })
  const link = links[0]

  if (link?.connected) {
    res.status(400).json({
      message: "Disconnect from Finbaze before clearing local DB links.",
    })
    return
  }

  const [productLinks, orderLinks, creditLinks, syncCursors] =
    await Promise.all([
      service.listProductLinks({ store_key: storeKey }),
      service.listOrderLinks({ store_key: storeKey }),
      service.listOrderCreditLinks({ store_key: storeKey }),
      service.listSyncCursors({ store_key: storeKey }),
    ])

  const productIds = productLinks.map((row: { id: string }) => row.id)
  const orderIds = orderLinks.map((row: { id: string }) => row.id)
  const creditIds = creditLinks.map((row: { id: string }) => row.id)
  const cursorIds = syncCursors.map((row: { id: string }) => row.id)

  // Credits first (FK to order links); cascade also covers this on order delete.
  if (creditIds.length > 0) {
    await service.deleteOrderCreditLinks(creditIds)
  }
  if (orderIds.length > 0) {
    await service.deleteOrderLinks(orderIds)
  }
  if (productIds.length > 0) {
    await service.deleteProductLinks(productIds)
  }
  if (cursorIds.length > 0) {
    await service.deleteSyncCursors(cursorIds)
  }
  if (link?.id) {
    await service.deleteFinbazeLinks(link.id)
  }

  res.json({
    cleared: true,
    deleted: {
      productLinks: productIds.length,
      orderLinks: orderIds.length,
      orderCreditLinks: creditIds.length,
      syncCursors: cursorIds.length,
      finbazeLinks: link?.id ? 1 : 0,
    },
  })
}
