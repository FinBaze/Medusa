import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getStoreKey } from "../../../../lib/config"
import { ensureFinbazeService } from "../../../../lib/ensure-service"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = ensureFinbazeService(req.scope)
  const storeKey = getStoreKey()
  const links = await service.listFinbazeLinks({ store_key: storeKey })
  const link = links[0]
  if (!link) {
    res.json({ disconnected: true })
    return
  }

  await service.updateFinbazeLinks({
    id: link.id,
    connected: false,
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    oauth_state: null,
  })

  res.json({ disconnected: true })
}
