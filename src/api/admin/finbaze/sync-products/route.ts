import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ensureFinbazeService } from "../../../../lib/ensure-service"
import { runHistoricalProductImportBatch } from "../../../../lib/historical-product-import"
import { HISTORICAL_PRODUCTS_BATCH } from "../../../../lib/sync-cursor"

type SyncBody = {
  /** Page size (Medusa products per request). Default 25, max 100. */
  limit?: number
  /** Restart from offset 0 (clears SyncCursor). */
  reset?: boolean
}

/**
 * Async historical product import — one batch per request.
 * Admin UI loops until `complete: true` (Shopify-parity pattern).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  ensureFinbazeService(req.scope)
  const body = (req.body ?? {}) as SyncBody
  const limit = Math.min(
    Math.max(body.limit ?? HISTORICAL_PRODUCTS_BATCH, 1),
    100,
  )

  const result = await runHistoricalProductImportBatch({
    container: req.scope,
    limit,
    reset: body.reset === true,
  })

  res.json(result)
}
