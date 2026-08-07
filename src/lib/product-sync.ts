import { getStoreKey } from "./config"
import {
  authFromLink,
  createOneProduct,
  fetchProfileSellToCountries,
  loadConnectedLink,
  suggestTaxCodesForHsCode,
  updateOneProduct,
  type FinbazeLinkAuth,
  type FinbazeProductInput,
} from "./finbaze-client"
import { getFinbazeModuleService } from "./module-access"

export type MedusaProductLike = {
  id: string
  title?: string | null
  handle?: string | null
  description?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  variants?: Array<{
    id?: string
    sku?: string | null
    barcode?: string | null
    prices?: Array<{
      amount?: number | null
      currency_code?: string | null
    }> | null
  }> | null
}

function hsCodeFromMetadata(
  metadata?: Record<string, unknown> | null,
): string | undefined {
  if (!metadata) return undefined
  const raw =
    metadata.hs_code ??
    metadata.finbaze_hs_code ??
    metadata.hsCode ??
    metadata.HS_CODE
  if (typeof raw === "string" && raw.trim()) return raw.trim()
  return undefined
}

function pricesFromProduct(
  product: MedusaProductLike,
): Record<string, number> | undefined {
  const prices: Record<string, number> = {}
  for (const variant of product.variants ?? []) {
    for (const price of variant.prices ?? []) {
      const currency = price.currency_code?.toUpperCase()
      if (!currency || price.amount == null) continue
      // Prefer first price per currency
      if (prices[currency] == null) {
        prices[currency] = Number(price.amount)
      }
    }
  }
  return Object.keys(prices).length > 0 ? prices : undefined
}

function primarySku(product: MedusaProductLike): string | undefined {
  for (const variant of product.variants ?? []) {
    if (variant.sku?.trim()) return variant.sku.trim()
  }
  return undefined
}

function primaryEan(product: MedusaProductLike): string | undefined {
  for (const variant of product.variants ?? []) {
    if (variant.barcode?.trim()) return variant.barcode.trim()
  }
  return undefined
}

async function buildTaxCodesByCountry(
  auth: FinbazeLinkAuth,
  hsCode?: string,
): Promise<Record<string, string> | undefined> {
  if (!hsCode) return undefined
  const countries = await fetchProfileSellToCountries(auth)
  if (countries.length === 0) return undefined
  const suggestions = await suggestTaxCodesForHsCode(auth, hsCode, countries)
  if (suggestions.length === 0) return undefined
  const map: Record<string, string> = {}
  for (const suggestion of suggestions) {
    if (suggestion.country && suggestion.taxCode) {
      map[suggestion.country] = suggestion.taxCode
    }
  }
  return Object.keys(map).length > 0 ? map : undefined
}

function toProductInput(
  product: MedusaProductLike,
  taxCodesByCountry?: Record<string, string>,
): FinbazeProductInput {
  const hsCode = hsCodeFromMetadata(product.metadata)
  const active = (product.status ?? "published").toLowerCase() !== "draft"
  return {
    name: product.title?.trim() || product.handle?.trim() || product.id,
    description: product.description ?? undefined,
    sku: primarySku(product),
    ean: primaryEan(product),
    hsCode,
    prices: pricesFromProduct(product),
    taxCodesByCountry,
    active,
    type: "goods",
    code: product.handle ?? undefined,
  }
}

async function upsertProductLink(params: {
  storeKey: string
  medusaProductId: string
  finbazeProductId: string
}) {
  const service = getFinbazeModuleService()
  const existing = await service.listProductLinks({
    store_key: params.storeKey,
    medusa_product_id: params.medusaProductId,
  })
  if (existing[0]) {
    if (existing[0].finbaze_product_id !== params.finbazeProductId) {
      await service.updateProductLinks({
        id: existing[0].id,
        finbaze_product_id: params.finbazeProductId,
      })
    }
    return existing[0]
  }
  return service.createProductLinks({
    store_key: params.storeKey,
    medusa_product_id: params.medusaProductId,
    finbaze_product_id: params.finbazeProductId,
  })
}

export async function syncMedusaProductToFinbaze(params: {
  product: MedusaProductLike
  storeKey?: string
}): Promise<{ finbazeProductId: string; created: boolean } | null> {
  const storeKey = getStoreKey(params.storeKey)
  const link = await loadConnectedLink(storeKey)
  if (!link) return null

  const auth = authFromLink(link)
  const service = getFinbazeModuleService()
  const existingLinks = await service.listProductLinks({
    store_key: storeKey,
    medusa_product_id: params.product.id,
  })
  const existing = existingLinks[0]
  const hsCode = hsCodeFromMetadata(params.product.metadata)

  if (existing?.finbaze_product_id) {
    const input = toProductInput(params.product)
    // Don't overwrite tax map on update unless HS present and map empty on create path
    const updated = await updateOneProduct(auth, existing.finbaze_product_id, {
      name: input.name,
      description: input.description,
      sku: input.sku,
      ean: input.ean,
      hsCode: input.hsCode,
      prices: input.prices,
      active: input.active,
      code: input.code,
    })
    return { finbazeProductId: updated.id, created: false }
  }

  const taxCodesByCountry = await buildTaxCodesByCountry(auth, hsCode)
  const created = await createOneProduct(
    auth,
    toProductInput(params.product, taxCodesByCountry),
  )
  await upsertProductLink({
    storeKey,
    medusaProductId: params.product.id,
    finbazeProductId: created.id,
  })
  return { finbazeProductId: created.id, created: true }
}

export async function deactivateMedusaProductInFinbaze(params: {
  medusaProductId: string
  storeKey?: string
}): Promise<boolean> {
  const storeKey = getStoreKey(params.storeKey)
  const link = await loadConnectedLink(storeKey)
  if (!link) return false

  const service = getFinbazeModuleService()
  const existingLinks = await service.listProductLinks({
    store_key: storeKey,
    medusa_product_id: params.medusaProductId,
  })
  const existing = existingLinks[0]
  if (!existing?.finbaze_product_id) return false

  await updateOneProduct(authFromLink(link), existing.finbaze_product_id, {
    active: false,
  })
  return true
}

export async function syncAllMedusaProducts(params: {
  products: MedusaProductLike[]
  storeKey?: string
}): Promise<{ synced: number; created: number; updated: number; failed: number }> {
  let synced = 0
  let created = 0
  let updated = 0
  let failed = 0

  for (const product of params.products) {
    try {
      const result = await syncMedusaProductToFinbaze({
        product,
        storeKey: params.storeKey,
      })
      if (!result) {
        failed += 1
        continue
      }
      synced += 1
      if (result.created) created += 1
      else updated += 1
    } catch {
      failed += 1
    }
  }

  const storeKey = getStoreKey(params.storeKey)
  const link = await loadConnectedLink(storeKey).catch(() => null)
  if (link) {
    const service = getFinbazeModuleService()
    await service.updateFinbazeLinks({
      id: link.id,
      last_product_sync_at: new Date(),
    })
  }

  return { synced, created, updated, failed }
}

export async function loadProductIdMap(
  storeKey?: string,
): Promise<Map<string, string>> {
  const service = getFinbazeModuleService()
  const key = getStoreKey(storeKey)
  const links = await service.listProductLinks({ store_key: key })
  return new Map(
    links.map((link: { medusa_product_id: string; finbaze_product_id: string }) => [
      link.medusa_product_id,
      link.finbaze_product_id,
    ]),
  )
}
