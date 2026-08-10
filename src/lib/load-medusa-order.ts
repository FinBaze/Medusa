import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type { MedusaOrderLike } from "./order-sync"

/**
 * Fields required for Finbaze invoice sync.
 *
 * Customer is a read-only link to the Customer module — Order Module
 * `relations: ["customer"]` does not populate it. Use Query.graph instead
 * (same pattern as product prices in load-medusa-products.ts).
 */
const ORDER_INVOICE_FIELDS = [
  "id",
  "display_id",
  "currency_code",
  "created_at",
  "status",
  "email",
  "metadata",
  "sales_channel_id",
  "sales_channel.id",
  "customer.id",
  "customer.email",
  "customer.first_name",
  "customer.last_name",
  "customer.company_name",
  "customer.metadata",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.company",
  "billing_address.first_name",
  "billing_address.last_name",
  "billing_address.company",
  "items.id",
  "items.title",
  "items.product_title",
  "items.variant_title",
  "items.quantity",
  "items.unit_price",
  "items.subtotal",
  "items.discount_total",
  "items.tax_total",
  "items.product_id",
  "items.variant_id",
  "items.tax_lines.code",
  "items.tax_lines.rate",
  "items.tax_lines.total",
  "items.tax_lines.name",
  "shipping_methods.id",
  "shipping_methods.name",
  "shipping_methods.amount",
  "shipping_methods.tax_total",
  "shipping_methods.tax_lines.code",
  "shipping_methods.tax_lines.rate",
  "shipping_methods.tax_lines.total",
  "shipping_methods.tax_lines.name",
] as const

function resolveDisplayId(row: Record<string, unknown>): number | null {
  const raw = row.display_id ?? row.displayId
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function resolveSalesChannelId(row: Record<string, unknown>): string | null {
  const direct = row.sales_channel_id ?? row.salesChannelId
  if (typeof direct === "string" && direct.trim()) return direct.trim()

  const channel = row.sales_channel ?? row.salesChannel
  if (channel && typeof channel === "object") {
    const id = (channel as { id?: unknown }).id
    if (typeof id === "string" && id.trim()) return id.trim()
  }
  return null
}

function mapQueryOrder(order: Record<string, unknown>): MedusaOrderLike {
  const mapped = order as MedusaOrderLike
  const displayId = resolveDisplayId(order)
  if (displayId != null) {
    mapped.display_id = displayId
  }
  const salesChannelId = resolveSalesChannelId(order)
  mapped.sales_channel_id = salesChannelId
  return mapped
}

/**
 * Query.graph historically omitted `display_id` on some Medusa schemas.
 * Hydrate from the Order module so invoice `reference` gets `#1001`, not the UUID.
 */
async function hydrateDisplayIds(
  container: MedusaContainer,
  orders: MedusaOrderLike[],
): Promise<void> {
  const missing = orders.filter((order) => order.display_id == null)
  if (missing.length === 0) return

  try {
    const orderModule = container.resolve(Modules.ORDER) as {
      listOrders: (
        filters: { id: string[] },
        config: { select: string[] },
      ) => Promise<Array<{ id: string; display_id?: number | null }>>
    }
    const rows = await orderModule.listOrders(
      { id: missing.map((order) => order.id) },
      { select: ["id", "display_id"] },
    )
    const byId = new Map(
      rows.map((row) => [row.id, row.display_id ?? null] as const),
    )
    for (const order of missing) {
      const displayId = byId.get(order.id)
      if (displayId != null) {
        order.display_id = displayId
      }
    }
  } catch {
    // Display id enrichment is best-effort; sync can still fall back to UUID.
  }
}

/** Load one order with customer email + invoice line relations via Query. */
export async function loadMedusaOrderForInvoice(
  container: MedusaContainer,
  orderId: string,
): Promise<MedusaOrderLike | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [...ORDER_INVOICE_FIELDS],
    filters: { id: orderId },
  })
  const row = (data ?? [])[0] as Record<string, unknown> | undefined
  if (!row) return null
  const order = mapQueryOrder(row)
  await hydrateDisplayIds(container, [order])
  return order
}

/** Load orders for historical import (includes customer email). Oldest first. */
export async function loadMedusaOrdersForInvoice(
  container: MedusaContainer,
  params: { take?: number; skip?: number } = {},
): Promise<MedusaOrderLike[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [...ORDER_INVOICE_FIELDS],
    pagination: {
      skip: params.skip ?? 0,
      take: params.take ?? 50,
      order: { created_at: "ASC" },
    },
  })
  const orders = ((data ?? []) as Record<string, unknown>[]).map(mapQueryOrder)
  await hydrateDisplayIds(container, orders)
  return orders
}
