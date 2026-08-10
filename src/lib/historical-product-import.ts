import type { MedusaContainer } from "@medusajs/framework/types"
import { getStoreKey } from "./config"
import { loadConnectedLink } from "./finbaze-client"
import { loadMedusaProductsWithPrices } from "./load-medusa-products"
import {
  syncAllMedusaProducts,
  touchLastProductSyncAt,
} from "./product-sync"
import {
  HISTORICAL_DONE,
  HISTORICAL_PRODUCTS_BATCH,
  HISTORICAL_PRODUCTS_KIND,
  clearSyncCursor,
  getSyncCursor,
  parseSkipCursor,
  setSyncCursor,
} from "./sync-cursor"

export type HistoricalProductBatchResult = {
  synced: number
  created: number
  updated: number
  failed: number
  processed: number
  complete: boolean
}

/**
 * One page of historical product import (Shopify-parity async batches).
 * Call repeatedly until `complete`. Pass `reset: true` to restart from offset 0.
 */
export async function runHistoricalProductImportBatch(params: {
  container: MedusaContainer
  limit?: number
  reset?: boolean
  storeKey?: string
}): Promise<HistoricalProductBatchResult> {
  const storeKey = getStoreKey(params.storeKey)
  const link = await loadConnectedLink(storeKey)
  if (!link) {
    return {
      synced: 0,
      created: 0,
      updated: 0,
      failed: 0,
      processed: 0,
      complete: true,
    }
  }

  const limit = Math.min(
    Math.max(params.limit ?? HISTORICAL_PRODUCTS_BATCH, 1),
    100,
  )

  if (params.reset) {
    await clearSyncCursor(HISTORICAL_PRODUCTS_KIND, storeKey)
  }

  const existingCursor = await getSyncCursor(HISTORICAL_PRODUCTS_KIND, storeKey)
  if (existingCursor === HISTORICAL_DONE && !params.reset) {
    return {
      synced: 0,
      created: 0,
      updated: 0,
      failed: 0,
      processed: 0,
      complete: true,
    }
  }

  const skip = parseSkipCursor(existingCursor)
  const products = await loadMedusaProductsWithPrices(params.container, {
    take: limit,
    skip,
  })

  const result = await syncAllMedusaProducts({
    products,
    storeKey,
    touchLastSync: false,
  })

  const complete = products.length < limit
  await setSyncCursor(
    HISTORICAL_PRODUCTS_KIND,
    complete ? HISTORICAL_DONE : String(skip + products.length),
    storeKey,
  )

  if (result.synced > 0 || complete) {
    await touchLastProductSyncAt(storeKey)
  }

  return {
    ...result,
    processed: products.length,
    complete,
  }
}
