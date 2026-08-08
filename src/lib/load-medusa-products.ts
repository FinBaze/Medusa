import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaProductLike } from "./product-sync"

const PRODUCT_PRICE_FIELDS = [
  "id",
  "title",
  "handle",
  "description",
  "status",
  "metadata",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.barcode",
  "variants.metadata",
  "variants.hs_code",
  "variants.prices.amount",
  "variants.prices.currency_code",
] as const

type QueryProduct = {
  id: string
  title?: string | null
  handle?: string | null
  description?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  variants?: Array<{
    id?: string | null
    title?: string | null
    sku?: string | null
    barcode?: string | null
    hs_code?: string | null
    metadata?: Record<string, unknown> | null
    prices?: Array<{
      amount?: number | string | { numeric?: number } | null
      currency_code?: string | null
    }> | null
  }> | null
}

function mapQueryProduct(product: QueryProduct): MedusaProductLike {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: product.description,
    status: product.status,
    metadata: product.metadata,
    variants: (product.variants ?? [])
      .filter((variant) => !!variant?.id)
      .map((variant) => {
        const metadata = {
          ...(variant.metadata ?? {}),
        } as Record<string, unknown>
        // Prefer native variant HS when metadata does not already set one.
        if (
          typeof variant.hs_code === "string" &&
          variant.hs_code.trim() &&
          !metadata.hs_code &&
          !metadata.finbaze_hs_code
        ) {
          metadata.hs_code = variant.hs_code.trim()
        }
        return {
          id: variant.id!,
          title: variant.title,
          sku: variant.sku,
          barcode: variant.barcode,
          metadata,
          prices: (variant.prices ?? []).map((price) => ({
            amount:
              typeof price.amount === "object" &&
              price.amount !== null &&
              "numeric" in price.amount
                ? Number(price.amount.numeric ?? 0)
                : (price.amount as number | string | null | undefined),
            currency_code: price.currency_code,
          })),
        }
      }),
  }
}

/**
 * Load products with variant prices via Query (Pricing Module link).
 * Product Module `relations: ["variants.prices"]` does not populate prices.
 */
export async function loadMedusaProductsWithPrices(
  container: MedusaContainer,
  params: {
    ids?: string[]
    take?: number
    skip?: number
  } = {},
): Promise<MedusaProductLike[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const filters =
    params.ids && params.ids.length > 0 ? { id: params.ids } : undefined

  const { data } = await query.graph({
    entity: "product",
    fields: [...PRODUCT_PRICE_FIELDS],
    filters,
    pagination: {
      take: params.take ?? 100,
      skip: params.skip ?? 0,
    },
  })

  return ((data ?? []) as QueryProduct[]).map(mapQueryProduct)
}

export async function loadMedusaProductWithPrices(
  container: MedusaContainer,
  productId: string,
): Promise<MedusaProductLike | null> {
  const products = await loadMedusaProductsWithPrices(container, {
    ids: [productId],
    take: 1,
  })
  return products[0] ?? null
}
