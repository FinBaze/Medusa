import { getStoreKey } from "./config"
import {
  buildFinbazeProfileBaseUrl,
  loadConnectedLink,
} from "./finbaze-client"
import { getFinbazeModuleService } from "./module-access"

export const IMPORTED_INVOICES_PAGE_SIZE = 25

export type ImportedInvoiceRow = {
  id: string
  medusaOrderId: string
  salesInvoiceId: string
  invoiceSentAt: string | null
  updatedAt: string
  orderName: string | null
  medusaOrderUrl: string
  finbazeInvoiceUrl: string
}

export async function listImportedInvoices(params: {
  storeKey?: string
  page?: number
  /** Optional enrichment: Medusa order id → display label (#123) */
  orderNamesById?: Map<string, string>
}): Promise<{
  rows: ImportedInvoiceRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  connected: boolean
  profileBaseUrl: string | null
}> {
  const storeKey = getStoreKey(params.storeKey)
  const page = Math.max(1, params.page ?? 1)
  const skip = (page - 1) * IMPORTED_INVOICES_PAGE_SIZE
  const link = await loadConnectedLink(storeKey).catch(() => null)

  if (!link) {
    return {
      rows: [],
      total: 0,
      page,
      pageSize: IMPORTED_INVOICES_PAGE_SIZE,
      totalPages: 1,
      connected: false,
      profileBaseUrl: null,
    }
  }

  const service = getFinbazeModuleService()
  const [links, total] = await service.listAndCountOrderLinks(
    {
      store_key: storeKey,
      sales_invoice_id: { $ne: null },
    },
    {
      take: IMPORTED_INVOICES_PAGE_SIZE,
      skip,
      order: { updated_at: "DESC" },
    },
  )

  const profileBase = buildFinbazeProfileBaseUrl(link.profile_url)
  const orderNames = params.orderNamesById ?? new Map<string, string>()

  const rows: ImportedInvoiceRow[] = links.map(
    (orderLink: {
      id: string
      medusa_order_id: string
      sales_invoice_id: string | null
      invoice_url?: string | null
      invoice_sent_at?: Date | string | null
      updated_at?: Date | string | null
    }) => {
      const salesInvoiceId = orderLink.sales_invoice_id!
      const updatedAt =
        orderLink.updated_at instanceof Date
          ? orderLink.updated_at.toISOString()
          : String(orderLink.updated_at ?? new Date().toISOString())
      const invoiceSentAt =
        orderLink.invoice_sent_at instanceof Date
          ? orderLink.invoice_sent_at.toISOString()
          : orderLink.invoice_sent_at
            ? String(orderLink.invoice_sent_at)
            : null

      return {
        id: orderLink.id,
        medusaOrderId: orderLink.medusa_order_id,
        salesInvoiceId,
        invoiceSentAt,
        updatedAt,
        orderName: orderNames.get(orderLink.medusa_order_id) ?? null,
        medusaOrderUrl: `/app/orders/${orderLink.medusa_order_id}`,
        finbazeInvoiceUrl:
          orderLink.invoice_url?.trim() ||
          `${profileBase}/sales-invoices/${salesInvoiceId}`,
      }
    },
  )

  return {
    rows,
    total,
    page,
    pageSize: IMPORTED_INVOICES_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / IMPORTED_INVOICES_PAGE_SIZE)),
    connected: true,
    profileBaseUrl: profileBase,
  }
}
