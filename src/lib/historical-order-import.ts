import type { MedusaContainer } from "@medusajs/framework/types"
import { getStoreKey } from "./config"
import { loadConnectedLink } from "./finbaze-client"
import { loadMedusaOrdersForInvoice } from "./load-medusa-order"
import { getFinbazeModuleService } from "./module-access"
import { syncHistoricalOrders } from "./order-sync"
import {
  HISTORICAL_DONE,
  HISTORICAL_ORDERS_BATCH,
  HISTORICAL_ORDERS_KIND,
  clearSyncCursor,
  getSyncCursor,
  parseSkipCursor,
  setSyncCursor,
} from "./sync-cursor"

export type HistoricalOrderBatchResult = {
  synced: number
  failed: number
  skipped: number
  processed: number
  complete: boolean
}

/**
 * One page of historical order import (Shopify-parity async batches).
 * Call repeatedly until `complete`. Pass `reset: true` to restart from offset 0.
 */
export async function runHistoricalOrderImportBatch(params: {
  container: MedusaContainer
  limit?: number
  reset?: boolean
  storeKey?: string
}): Promise<HistoricalOrderBatchResult> {
  const storeKey = getStoreKey(params.storeKey)
  const link = await loadConnectedLink(storeKey)
  if (!link) {
    return { synced: 0, failed: 0, skipped: 0, processed: 0, complete: true }
  }

  const limit = Math.min(
    Math.max(params.limit ?? HISTORICAL_ORDERS_BATCH, 1),
    100,
  )

  if (params.reset) {
    await clearSyncCursor(HISTORICAL_ORDERS_KIND, storeKey)
  }

  const existingCursor = await getSyncCursor(HISTORICAL_ORDERS_KIND, storeKey)
  if (existingCursor === HISTORICAL_DONE && !params.reset) {
    return { synced: 0, failed: 0, skipped: 0, processed: 0, complete: true }
  }

  const skip = parseSkipCursor(existingCursor)
  const orders = await loadMedusaOrdersForInvoice(params.container, {
    take: limit,
    skip,
  })

  const result = await syncHistoricalOrders({ orders, storeKey })

  const complete = orders.length < limit
  await setSyncCursor(
    HISTORICAL_ORDERS_KIND,
    complete ? HISTORICAL_DONE : String(skip + orders.length),
    storeKey,
  )

  if (result.synced > 0 || complete) {
    await getFinbazeModuleService().updateFinbazeLinks({
      id: link.id,
      last_order_sync_at: new Date(),
    })
  }

  return {
    ...result,
    processed: orders.length,
    complete,
  }
}
