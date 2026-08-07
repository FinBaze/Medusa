import { randomBytes } from "node:crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getStoreKey } from "../../../../lib/config"
import { ensureFinbazeService } from "../../../../lib/ensure-service"
import { buildFinbazeAuthorizeUrl } from "../../../../lib/finbaze-client"

type ConnectBody = {
  profileId?: string
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = ensureFinbazeService(req.scope)
  const storeKey = getStoreKey()
  const body = (req.body ?? {}) as ConnectBody
  const state = randomBytes(32).toString("base64url")

  const existing = await service.listFinbazeLinks({ store_key: storeKey })
  if (existing[0]) {
    await service.updateFinbazeLinks({
      id: existing[0].id,
      oauth_state: state,
      connected: false,
    })
  } else {
    await service.createFinbazeLinks({
      store_key: storeKey,
      profile_id: body.profileId ?? "pending",
      oauth_state: state,
      connected: false,
    })
  }

  const authorizeUrl = buildFinbazeAuthorizeUrl({
    state,
    profileId: body.profileId,
    storeKey,
  })

  res.json({ authorizeUrl, state })
}
