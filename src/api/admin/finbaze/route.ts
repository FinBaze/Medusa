import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getFinbazeConfig, getStoreKey } from "../../../lib/config"
import { ensureFinbazeService } from "../../../lib/ensure-service"
import {
  buildFinbazeProfileBaseUrl,
  getFinbazeOAuthRedirectUri,
} from "../../../lib/finbaze-client"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = ensureFinbazeService(req.scope)
  const storeKey = getStoreKey()
  const links = await service.listFinbazeLinks({ store_key: storeKey })
  const link = links[0]
  const config = getFinbazeConfig()

  const productCount = await service.listProductLinks({ store_key: storeKey })
  const orderCount = await service.listOrderLinks({ store_key: storeKey })

  res.json({
    storeKey,
    connected: Boolean(link?.connected && link?.profile_id),
    profileId: link?.profile_id ?? null,
    profileName: link?.profile_name ?? null,
    profileUrl: link?.profile_url ?? null,
    profileBaseUrl: link?.profile_url
      ? buildFinbazeProfileBaseUrl(link.profile_url)
      : null,
    lastOrderSyncAt: link?.last_order_sync_at ?? null,
    lastProductSyncAt: link?.last_product_sync_at ?? null,
    productLinkCount: productCount.length,
    orderLinkCount: orderCount.length,
    clientId: config.clientId,
    apiUrl: config.apiUrl,
    oauthRedirectUri: getFinbazeOAuthRedirectUri(),
  })
}
