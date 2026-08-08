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
import { toMinorUnits } from "./money"
import { getFinbazeModuleService } from "./module-access"

export type MedusaVariantLike = {
  id?: string
  title?: string | null
  sku?: string | null
  barcode?: string | null
  metadata?: Record<string, unknown> | null
  prices?: Array<{
    amount?: number | null
    currency_code?: string | null
  }> | null
}

export type MedusaProductLike = {
  id: string
  title?: string | null
  handle?: string | null
  description?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  variants?: MedusaVariantLike[] | null
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

function pricesFromVariant(
  variant: MedusaVariantLike,
): Record<string, number> | undefined {
  const prices: Record<string, number> = {}
  for (const price of variant.prices ?? []) {
    const currency = price.currency_code?.toUpperCase()
    if (!currency || price.amount == null) continue
    if (prices[currency] == null) {
      // Medusa major units → Finbaze minor units
      prices[currency] = toMinorUnits(price.amount, currency)
    }
  }
  return Object.keys(prices).length > 0 ? prices : undefined
}

function variantDisplayName(
  product: MedusaProductLike,
  variant: MedusaVariantLike,
): string {
  const productName =
    product.title?.trim() || product.handle?.trim() || product.id
  const variantTitle = variant.title?.trim()
  if (
    !variantTitle ||
    variantTitle.toLowerCase() === "default" ||
    variantTitle.toLowerCase() === "default variant"
  ) {
    return productName
  }
  return `${productName} / ${variantTitle}`
}

function variantCode(
  product: MedusaProductLike,
  variant: MedusaVariantLike,
): string | undefined {
  const sku = variant.sku?.trim()
  if (sku) return sku
  if (product.handle && variant.id) return `${product.handle}:${variant.id}`
  return product.handle ?? undefined
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
  variant: MedusaVariantLike,
  taxCodesByCountry?: Record<string, string>,
): FinbazeProductInput {
  const hsCode =
    hsCodeFromMetadata(variant.metadata) ??
    hsCodeFromMetadata(product.metadata)
  const active = (product.status ?? "published").toLowerCase() !== "draft"
  return {
    name: variantDisplayName(product, variant),
    description: product.description ?? undefined,
    sku: variant.sku?.trim() || undefined,
    ean: variant.barcode?.trim() || undefined,
    hsCode,
    prices: pricesFromVariant(variant),
    taxCodesByCountry,
    active,
    type: "goods",
    code: variantCode(product, variant),
  }
}

async function upsertVariantLink(params: {
  storeKey: string
  medusaProductId: string
  medusaVariantId: string
  finbazeProductId: string
}) {
  const service = getFinbazeModuleService()
  const existing = await service.listProductLinks({
    store_key: params.storeKey,
    medusa_variant_id: params.medusaVariantId,
  })
  if (existing[0]) {
    const patch: Record<string, string> = {}
    if (existing[0].finbaze_product_id !== params.finbazeProductId) {
      patch.finbaze_product_id = params.finbazeProductId
    }
    if (existing[0].medusa_product_id !== params.medusaProductId) {
      patch.medusa_product_id = params.medusaProductId
    }
    if (Object.keys(patch).length > 0) {
      await service.updateProductLinks({
        id: existing[0].id,
        ...patch,
      })
    }
    return existing[0]
  }
  return service.createProductLinks({
    store_key: params.storeKey,
    medusa_product_id: params.medusaProductId,
    medusa_variant_id: params.medusaVariantId,
    finbaze_product_id: params.finbazeProductId,
  })
}

async function syncMedusaVariantToFinbaze(params: {
  product: MedusaProductLike
  variant: MedusaVariantLike
  storeKey: string
  auth: FinbazeLinkAuth
  taxCodesByCountry?: Record<string, string>
}): Promise<{ finbazeProductId: string; created: boolean } | null> {
  const variantId = params.variant.id
  if (!variantId) return null

  const service = getFinbazeModuleService()
  const existingLinks = await service.listProductLinks({
    store_key: params.storeKey,
    medusa_variant_id: variantId,
  })
  const existing = existingLinks[0]

  if (existing?.finbaze_product_id) {
    const input = toProductInput(params.product, params.variant)
    const updated = await updateOneProduct(
      params.auth,
      existing.finbaze_product_id,
      {
        name: input.name,
        description: input.description,
        sku: input.sku,
        ean: input.ean,
        hsCode: input.hsCode,
        prices: input.prices,
        active: input.active,
        code: input.code,
      },
    )
    await upsertVariantLink({
      storeKey: params.storeKey,
      medusaProductId: params.product.id,
      medusaVariantId: variantId,
      finbazeProductId: updated.id,
    })
    return { finbazeProductId: updated.id, created: false }
  }

  const created = await createOneProduct(
    params.auth,
    toProductInput(
      params.product,
      params.variant,
      params.taxCodesByCountry,
    ),
  )
  await upsertVariantLink({
    storeKey: params.storeKey,
    medusaProductId: params.product.id,
    medusaVariantId: variantId,
    finbazeProductId: created.id,
  })
  return { finbazeProductId: created.id, created: true }
}

export async function syncMedusaProductToFinbaze(params: {
  product: MedusaProductLike
  storeKey?: string
}): Promise<{
  finbazeProductIds: string[]
  created: number
  updated: number
} | null> {
  const storeKey = getStoreKey(params.storeKey)
  const link = await loadConnectedLink(storeKey)
  if (!link) return null

  const auth = authFromLink(link)
  const variants = (params.product.variants ?? []).filter((v) => v.id)
  if (variants.length === 0) {
    return { finbazeProductIds: [], created: 0, updated: 0 }
  }

  const hsCode =
    hsCodeFromMetadata(params.product.metadata) ??
    variants.map((v) => hsCodeFromMetadata(v.metadata)).find(Boolean)
  const taxCodesByCountry = await buildTaxCodesByCountry(auth, hsCode)

  const service = getFinbazeModuleService()
  const existingLinks = await service.listProductLinks({
    store_key: storeKey,
    medusa_product_id: params.product.id,
  })

  const seenVariantIds = new Set<string>()
  const finbazeProductIds: string[] = []
  let created = 0
  let updated = 0

  for (const variant of variants) {
    const variantId = variant.id!
    seenVariantIds.add(variantId)
    const result = await syncMedusaVariantToFinbaze({
      product: params.product,
      variant,
      storeKey,
      auth,
      taxCodesByCountry,
    })
    if (!result) continue
    finbazeProductIds.push(result.finbazeProductId)
    if (result.created) created += 1
    else updated += 1
  }

  for (const existing of existingLinks) {
    const variantId = existing.medusa_variant_id as string | undefined
    if (!variantId || seenVariantIds.has(variantId)) continue
    if (existing.finbaze_product_id) {
      await updateOneProduct(auth, existing.finbaze_product_id, {
        active: false,
      })
    }
    await service.deleteProductLinks(existing.id)
  }

  return { finbazeProductIds, created, updated }
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
  if (existingLinks.length === 0) return false

  const auth = authFromLink(link)
  for (const existing of existingLinks) {
    if (!existing?.finbaze_product_id) continue
    await updateOneProduct(auth, existing.finbaze_product_id, {
      active: false,
    })
  }
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
      synced += result.created + result.updated
      created += result.created
      updated += result.updated
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

/** Map Medusa variant id → Finbaze product id. */
export async function loadVariantIdMap(
  storeKey?: string,
): Promise<Map<string, string>> {
  const service = getFinbazeModuleService()
  const key = getStoreKey(storeKey)
  const links = await service.listProductLinks({ store_key: key })
  return new Map(
    links
      .filter(
        (link: { medusa_variant_id?: string }) => !!link.medusa_variant_id,
      )
      .map(
        (link: {
          medusa_variant_id: string
          finbaze_product_id: string
        }) => [link.medusa_variant_id, link.finbaze_product_id],
      ),
  )
}
