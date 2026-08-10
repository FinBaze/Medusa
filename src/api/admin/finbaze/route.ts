import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { getFinbazeConfig, getStoreKey } from "../../../lib/config"
import { ensureFinbazeService } from "../../../lib/ensure-service"
import {
  buildFinbazeProfileBaseUrl,
  getFinbazeOAuthRedirectUri,
} from "../../../lib/finbaze-client"
import { normalizeSalesChannelAllowlist } from "../../../lib/order-sync"

type SalesChannelOption = {
  id: string
  name: string
  isDisabled: boolean
}

async function listSalesChannelOptions(
  req: MedusaRequest,
): Promise<SalesChannelOption[]> {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "sales_channel",
      fields: ["id", "name", "is_disabled"],
    })
    return ((data ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const id = typeof row.id === "string" ? row.id : null
        if (!id) return null
        return {
          id,
          name:
            typeof row.name === "string" && row.name.trim()
              ? row.name.trim()
              : id,
          isDisabled: Boolean(row.is_disabled ?? row.isDisabled),
        } satisfies SalesChannelOption
      })
      .filter((row): row is SalesChannelOption => row != null)
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    // Fallback if Query graph entity name differs on older Medusa builds.
    try {
      const salesChannelModule = req.scope.resolve(Modules.SALES_CHANNEL) as {
        listSalesChannels: (
          filters?: Record<string, unknown>,
          config?: { select?: string[] },
        ) => Promise<
          Array<{ id: string; name?: string | null; is_disabled?: boolean }>
        >
      }
      const rows = await salesChannelModule.listSalesChannels(
        {},
        { select: ["id", "name", "is_disabled"] },
      )
      return rows
        .map((row) => ({
          id: row.id,
          name: row.name?.trim() || row.id,
          isDisabled: Boolean(row.is_disabled),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = ensureFinbazeService(req.scope)
  const storeKey = getStoreKey()
  const links = await service.listFinbazeLinks({ store_key: storeKey })
  const link = links[0]
  const config = getFinbazeConfig()

  const [productCount, orderCount, creditCount, cursorCount, salesChannels] =
    await Promise.all([
      service.listProductLinks({ store_key: storeKey }),
      service.listOrderLinks({ store_key: storeKey }),
      service.listOrderCreditLinks({ store_key: storeKey }),
      service.listSyncCursors({ store_key: storeKey }),
      listSalesChannelOptions(req),
    ])

  const salesChannelIds = normalizeSalesChannelAllowlist(
    link?.sales_channel_ids,
  )

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
    orderCreditLinkCount: creditCount.length,
    syncCursorCount: cursorCount.length,
    hasFinbazeLink: Boolean(link?.id),
    salesChannelIds,
    salesChannels,
    clientId: config.clientId,
    apiUrl: config.apiUrl,
    oauthRedirectUri: getFinbazeOAuthRedirectUri(),
  })
}

type PatchBody = {
  salesChannelIds?: unknown
}

/**
 * Update Finbaze connection settings (sales-channel order-import allowlist).
 * Empty array clears the filter (import from all channels).
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const service = ensureFinbazeService(req.scope)
  const storeKey = getStoreKey()
  const links = await service.listFinbazeLinks({ store_key: storeKey })
  const link = links[0]
  if (!link?.id) {
    res.status(404).json({ message: "Finbaze is not connected for this store." })
    return
  }

  const body = (req.body ?? {}) as PatchBody
  if (!("salesChannelIds" in body)) {
    res.status(400).json({ message: "Provide salesChannelIds (string[])." })
    return
  }

  const salesChannelIds = normalizeSalesChannelAllowlist(body.salesChannelIds)

  await service.updateFinbazeLinks({
    id: link.id,
    sales_channel_ids: salesChannelIds.length > 0 ? salesChannelIds : null,
  })

  res.json({
    salesChannelIds,
  })
}
