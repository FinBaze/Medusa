import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ensureFinbazeService } from "../../../../lib/ensure-service"
import { syncAllMedusaProducts } from "../../../../lib/product-sync"

type SyncBody = {
  limit?: number
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  ensureFinbazeService(req.scope)
  const body = (req.body ?? {}) as SyncBody
  const limit = Math.min(Math.max(body.limit ?? 100, 1), 500)

  const productModule = req.scope.resolve("product")
  const [products] = await productModule.listAndCountProducts(
    {},
    {
      take: limit,
      relations: ["variants", "variants.prices"],
    },
  )

  const result = await syncAllMedusaProducts({ products })
  res.json(result)
}
