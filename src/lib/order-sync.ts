import { getStoreKey } from "./config"
import {
  authFromLink,
  closeSalesInvoice,
  createPartialCreditSalesInvoice,
  createSalesInvoice,
  creditSalesInvoice,
  fetchSalesInvoiceDetails,
  loadConnectedLink,
  syncDraftSalesInvoice,
  type FinbazeCreditLineInput,
  type FinbazeLinkAuth,
  type FinbazeSalesInvoiceDetails,
  type MarketplaceInvoiceInput,
} from "./finbaze-client"
import {
  buildCreditLineFromAmounts,
  buildInvoiceLinesFromMedusaOrder,
  type MedusaNumericLike,
  type MedusaOrderLineLike,
  type MedusaShippingLineLike,
} from "./invoice-lines"
import { getFinbazeModuleService } from "./module-access"
import { loadProductIdMap } from "./product-sync"

export type MedusaOrderLike = {
  id: string
  display_id?: number | null
  currency_code?: string | null
  created_at?: string | Date | null
  status?: string | null
  email?: string | null
  customer?: {
    email?: string | null
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
    metadata?: Record<string, unknown> | null
  } | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    company?: string | null
  } | null
  items?: MedusaOrderLineLike[] | null
  shipping_methods?: MedusaShippingLineLike[] | null
  metadata?: Record<string, unknown> | null
}

export type MedusaRefundLike = {
  id: string
  created_at?: string | Date | null
  amount?: MedusaNumericLike
  items?: Array<{
    id?: string
    quantity?: MedusaNumericLike
    line_item_id?: string | null
    item?: MedusaOrderLineLike | null
  }> | null
}

type CloseBehavior = "none" | "close_send" | "close_no_send"

const CREATE_LOCK_STALE_MS = 60_000
const CREATE_WAIT_TIMEOUT_MS = 30_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function orderReference(order: MedusaOrderLike): string {
  if (order.display_id != null) return `#${order.display_id}`
  return order.id
}

function customerVatNumber(order: MedusaOrderLike): string | undefined {
  const meta = order.customer?.metadata
  const vat = meta?.vat_number ?? meta?.vatNumber
  return typeof vat === "string" && vat.trim() ? vat.trim() : undefined
}

function mapOrderToInvoiceInput(
  order: MedusaOrderLike,
  productMap: Map<string, string>,
): MarketplaceInvoiceInput {
  const first = order.shipping_address?.first_name ?? order.customer?.first_name
  const last = order.shipping_address?.last_name ?? order.customer?.last_name
  const legalName =
    order.shipping_address?.company ??
    order.customer?.company_name ??
    [first, last].filter(Boolean).join(" ")

  return {
    reference: orderReference(order),
    currency: (order.currency_code ?? "eur").toUpperCase(),
    date:
      order.created_at instanceof Date
        ? order.created_at.toISOString()
        : (order.created_at ?? undefined),
    customer: {
      email: order.email ?? order.customer?.email ?? undefined,
      firstName: first ?? undefined,
      lastName: last ?? undefined,
      legalName: legalName || undefined,
      vatNumber: customerVatNumber(order),
    },
    lines: buildInvoiceLinesFromMedusaOrder({
      items: order.items ?? [],
      shippingMethods: order.shipping_methods ?? [],
      productIdByMedusaProductId: productMap,
    }),
  }
}

function isCanceledStatus(status?: string | null): boolean {
  const normalized = (status ?? "").toLowerCase()
  return (
    normalized === "canceled" ||
    normalized === "cancelled" ||
    normalized === "archived"
  )
}

function isFullyFulfilled(order: MedusaOrderLike): boolean {
  const metaFulfilled = order.metadata?.finbaze_fulfilled === true
  if (metaFulfilled) return true
  const status = (order.status ?? "").toLowerCase()
  // Medusa v2: "completed" after fulfillment workflows; also honor explicit flag
  return status === "completed" || status === "fulfilled"
}

function resolveCloseBehavior(params: {
  mode: "event" | "historical"
  event?: string
  order: MedusaOrderLike
}): CloseBehavior {
  if (params.mode === "historical") {
    return isFullyFulfilled(params.order) ? "close_no_send" : "none"
  }

  const event = (params.event ?? "").toLowerCase()
  const fulfillmentEvent =
    event.includes("fulfillment") ||
    event === "order.completed" ||
    event === "delivery.created"

  if (fulfillmentEvent && isFullyFulfilled(params.order)) {
    return "close_send"
  }
  return "none"
}

type OrderLinkRecord = {
  id: string
  store_key: string
  medusa_order_id: string
  sales_invoice_id?: string | null
  invoice_url?: string | null
  invoice_create_started_at?: Date | string | null
  invoice_sent_at?: Date | string | null
}

async function getOrClaimOrderLink(
  storeKey: string,
  medusaOrderId: string,
): Promise<OrderLinkRecord> {
  const service = getFinbazeModuleService()
  const existing = await service.listOrderLinks({
    store_key: storeKey,
    medusa_order_id: medusaOrderId,
  })
  if (existing[0]) return existing[0] as OrderLinkRecord

  try {
    const created = await service.createOrderLinks({
      store_key: storeKey,
      medusa_order_id: medusaOrderId,
    })
    return created as OrderLinkRecord
  } catch {
    const again = await service.listOrderLinks({
      store_key: storeKey,
      medusa_order_id: medusaOrderId,
    })
    if (!again[0]) throw new Error("Failed to claim order link")
    return again[0] as OrderLinkRecord
  }
}

async function acquireInvoiceSyncLock(orderLinkId: string): Promise<void> {
  const service = getFinbazeModuleService()
  const deadline = Date.now() + CREATE_WAIT_TIMEOUT_MS
  const staleBefore = new Date(Date.now() - CREATE_LOCK_STALE_MS)

  while (Date.now() < deadline) {
    const current = (await service.retrieveOrderLink(orderLinkId)) as OrderLinkRecord
    const started = current.invoice_create_started_at
      ? new Date(current.invoice_create_started_at)
      : null
    const canClaim = !started || started < staleBefore
    if (canClaim) {
      await service.updateOrderLinks({
        id: orderLinkId,
        invoice_create_started_at: new Date(),
      })
      return
    }
    await sleep(250)
  }

  throw new Error("Timed out waiting for sales invoice sync lock.")
}

async function releaseInvoiceSyncLock(orderLinkId: string): Promise<void> {
  const service = getFinbazeModuleService()
  await service.updateOrderLinks({
    id: orderLinkId,
    invoice_create_started_at: null,
  })
}

async function ensureSalesInvoiceForOrder(params: {
  orderLinkId: string
  auth: FinbazeLinkAuth
  invoiceInput: MarketplaceInvoiceInput
  syncLines?: boolean
}): Promise<{
  salesInvoiceId: string
  invoiceUrl: string
  created: boolean
}> {
  const service = getFinbazeModuleService()
  await acquireInvoiceSyncLock(params.orderLinkId)

  try {
    const current = (await service.retrieveOrderLink(
      params.orderLinkId,
    )) as OrderLinkRecord

    if (current.invoice_sent_at && current.sales_invoice_id) {
      return {
        salesInvoiceId: current.sales_invoice_id,
        invoiceUrl: current.invoice_url ?? "",
        created: false,
      }
    }

    let created = false
    let salesInvoiceId = current.sales_invoice_id ?? undefined
    let invoiceUrl = current.invoice_url ?? ""

    if (!salesInvoiceId) {
      const result = await createSalesInvoice(params.auth, params.invoiceInput)
      salesInvoiceId = result.salesInvoiceId
      invoiceUrl = result.invoiceUrl
      created = true
      await service.updateOrderLinks({
        id: params.orderLinkId,
        sales_invoice_id: salesInvoiceId,
        invoice_url: invoiceUrl,
      })
    }

    if (!salesInvoiceId) {
      throw new Error("Sales invoice id missing after create.")
    }

    if (params.syncLines !== false) {
      await syncDraftSalesInvoice(
        params.auth,
        salesInvoiceId,
        params.invoiceInput,
      )
    }

    return { salesInvoiceId, invoiceUrl, created }
  } finally {
    await releaseInvoiceSyncLock(params.orderLinkId)
  }
}

async function markInvoiceSent(orderLinkId: string): Promise<boolean> {
  const service = getFinbazeModuleService()
  const current = (await service.retrieveOrderLink(orderLinkId)) as OrderLinkRecord
  if (current.invoice_sent_at) return false
  await service.updateOrderLinks({
    id: orderLinkId,
    invoice_sent_at: new Date(),
  })
  return true
}

function creditLinesCoverLines(
  covering: FinbazeCreditLineInput[],
  target: FinbazeCreditLineInput[],
): boolean {
  if (target.length === 0) return false
  const coverQtyByName = new Map<string, number>()
  for (const line of covering) {
    coverQtyByName.set(
      line.name,
      (coverQtyByName.get(line.name) ?? 0) + line.quantity,
    )
  }
  return target.every(
    (line) => (coverQtyByName.get(line.name) ?? 0) >= line.quantity,
  )
}

async function creditRefundLines(params: {
  auth: FinbazeLinkAuth
  invoice: FinbazeSalesInvoiceDetails
  reference: string
  date: string
  lines: FinbazeCreditLineInput[]
}): Promise<{ salesInvoiceId: string } | null> {
  if (!params.invoice.closed || params.lines.length === 0) {
    return null
  }

  const isFullCredit = creditLinesCoverLines(params.lines, params.invoice.lines)
  if (!params.invoice.credited && isFullCredit) {
    return creditSalesInvoice(params.auth, params.invoice.id)
  }

  return createPartialCreditSalesInvoice(params.auth, {
    sourceInvoiceId: params.invoice.id,
    reference: params.reference,
    date: params.date,
    lines: params.lines,
  })
}

function mapRefundToCreditLines(
  refund: MedusaRefundLike,
  order: MedusaOrderLike,
  productMap: Map<string, string>,
): FinbazeCreditLineInput[] {
  const lines: FinbazeCreditLineInput[] = []
  const itemsById = new Map(
    (order.items ?? []).map((item) => [item.id ?? "", item]),
  )

  for (const refundItem of refund.items ?? []) {
    const orderItem =
      refundItem.item ??
      (refundItem.line_item_id
        ? itemsById.get(refundItem.line_item_id)
        : undefined)
    const quantity = Number(refundItem.quantity ?? 0)
    if (!orderItem || quantity <= 0) continue

    const name =
      orderItem.title?.trim() ||
      orderItem.product_title?.trim() ||
      "Refunded item"
    const unitPrice = Number(orderItem.unit_price ?? 0)
    const productId = orderItem.product_id
      ? productMap.get(orderItem.product_id)
      : undefined
    const taxCode = orderItem.tax_lines?.[0]?.code ?? undefined

    const credit = buildCreditLineFromAmounts({
      name,
      quantity,
      unitPrice,
      taxCode: taxCode ?? undefined,
      productId,
    })
    if (credit) lines.push(credit)
  }

  if (lines.length === 0 && Number(refund.amount ?? 0) > 0) {
    lines.push({
      name: `${orderReference(order)} refund`,
      quantity: 1,
      price: -Math.abs(Number(refund.amount)),
    })
  }

  return lines
}

export async function syncOrderCredits(params: {
  storeKey: string
  orderLinkId: string
  salesInvoiceId: string
  order: MedusaOrderLike
  auth: FinbazeLinkAuth
  refunds: MedusaRefundLike[]
}): Promise<{ credited: number }> {
  const service = getFinbazeModuleService()
  const productMap = await loadProductIdMap(params.storeKey)
  let credited = 0
  let invoice = await fetchSalesInvoiceDetails(
    params.auth,
    params.salesInvoiceId,
  )
  if (!invoice) return { credited: 0 }

  const referenceBase = orderReference(params.order)

  for (const refund of params.refunds) {
    const creditKey = `refund:${refund.id}`
    const existing = await service.listOrderCreditLinks({
      store_key: params.storeKey,
      medusa_credit_key: creditKey,
    })
    if (existing[0]) continue

    const lines = mapRefundToCreditLines(refund, params.order, productMap)
    if (lines.length === 0) continue

    try {
      const result = await creditRefundLines({
        auth: params.auth,
        invoice,
        reference: `${referenceBase} refund`,
        date:
          refund.created_at instanceof Date
            ? refund.created_at.toISOString()
            : (refund.created_at ?? new Date().toISOString()),
        lines,
      })
      if (!result) continue

      await service.createOrderCreditLinks({
        store_key: params.storeKey,
        medusa_credit_key: creditKey,
        order_link_id: params.orderLinkId,
        credit_sales_invoice_id: result.salesInvoiceId,
      })
      credited += 1
      invoice =
        (await fetchSalesInvoiceDetails(params.auth, params.salesInvoiceId)) ??
        invoice
    } catch (error) {
      console.warn(
        "Finbaze refund credit failed:",
        error instanceof Error ? error.message : error,
      )
    }
  }

  return { credited }
}

export async function syncMedusaOrder(params: {
  order: MedusaOrderLike
  mode: "event" | "historical"
  event?: string
  storeKey?: string
  refunds?: MedusaRefundLike[]
}): Promise<{
  action: string
  salesInvoiceId?: string
  invoiceUrl?: string
} | null> {
  const storeKey = getStoreKey(params.storeKey)
  const link = await loadConnectedLink(storeKey)
  if (!link) return null

  const auth = authFromLink(link)
  const service = getFinbazeModuleService()
  const orderLink = await getOrClaimOrderLink(storeKey, params.order.id)

  if (isCanceledStatus(params.order.status) || params.event === "order.canceled") {
    if (!orderLink.sales_invoice_id) {
      return { action: "ignored" }
    }
    await creditSalesInvoice(auth, orderLink.sales_invoice_id)
    await service.deleteOrderLinks(orderLink.id)
    return { action: "cancelled" }
  }

  const productMap = await loadProductIdMap(storeKey)
  const invoiceInput = mapOrderToInvoiceInput(params.order, productMap)
  const closeBehavior = resolveCloseBehavior({
    mode: params.mode,
    event: params.event,
    order: params.order,
  })

  const existingLink = (await service.retrieveOrderLink(
    orderLink.id,
  )) as OrderLinkRecord

  if (existingLink.invoice_sent_at && existingLink.sales_invoice_id) {
    if ((params.refunds?.length ?? 0) > 0) {
      await syncOrderCredits({
        storeKey,
        orderLinkId: orderLink.id,
        salesInvoiceId: existingLink.sales_invoice_id,
        order: params.order,
        auth,
        refunds: params.refunds ?? [],
      })
    }
    return {
      action: "already_finalized",
      salesInvoiceId: existingLink.sales_invoice_id,
      invoiceUrl: existingLink.invoice_url ?? "",
    }
  }

  const shouldSyncLines =
    closeBehavior === "none" || !existingLink.sales_invoice_id

  const invoice = await ensureSalesInvoiceForOrder({
    orderLinkId: orderLink.id,
    auth,
    invoiceInput,
    syncLines: shouldSyncLines,
  })

  let result = {
    salesInvoiceId: invoice.salesInvoiceId,
    invoiceUrl: invoice.invoiceUrl,
  }
  let action = invoice.created ? "created" : "updated"

  if (closeBehavior === "close_send" || closeBehavior === "close_no_send") {
    const claimedFinalize = await markInvoiceSent(orderLink.id)
    if (!claimedFinalize) {
      const latest = (await service.retrieveOrderLink(
        orderLink.id,
      )) as OrderLinkRecord
      return {
        action: "already_finalized",
        salesInvoiceId: latest.sales_invoice_id ?? invoice.salesInvoiceId,
        invoiceUrl: latest.invoice_url ?? invoice.invoiceUrl,
      }
    }

    try {
      result = await closeSalesInvoice(
        auth,
        invoice.salesInvoiceId,
        undefined,
        { send: closeBehavior === "close_send" },
      )
      await service.updateOrderLinks({
        id: orderLink.id,
        invoice_url: result.invoiceUrl,
      })
      action =
        closeBehavior === "close_send"
          ? invoice.created
            ? "created_sent"
            : "sent"
          : invoice.created
            ? "created_closed"
            : "closed"
    } catch (error) {
      await service.updateOrderLinks({
        id: orderLink.id,
        invoice_sent_at: null,
      })
      throw error
    }
  }

  await service.updateFinbazeLinks({
    id: link.id,
    last_order_sync_at: new Date(),
  })

  if (result.salesInvoiceId && (params.refunds?.length ?? 0) > 0) {
    await syncOrderCredits({
      storeKey,
      orderLinkId: orderLink.id,
      salesInvoiceId: result.salesInvoiceId,
      order: params.order,
      auth,
      refunds: params.refunds ?? [],
    })
  }

  return { action, ...result }
}

export async function syncHistoricalOrders(params: {
  orders: MedusaOrderLike[]
  storeKey?: string
}): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0
  for (const order of params.orders) {
    try {
      const result = await syncMedusaOrder({
        order,
        mode: "historical",
        storeKey: params.storeKey,
      })
      if (result) synced += 1
      else failed += 1
    } catch {
      failed += 1
    }
  }
  return { synced, failed }
}
