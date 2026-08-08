import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

type InvoiceRow = {
  id: string
  medusaOrderId: string
  salesInvoiceId: string
  invoiceSentAt: string | null
  updatedAt: string
  orderName: string | null
  medusaOrderUrl: string
  finbazeInvoiceUrl: string
}

type InvoicesResponse = {
  rows: InvoiceRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  connected: boolean
}

function formatUpdatedAt(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return value
  }
}

const FinbazeInvoicesPage = () => {
  const [data, setData] = useState<InvoicesResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = async (nextPage: number) => {
    setLoading(true)
    try {
      const response = await fetch(
        `/admin/finbaze/invoices?page=${nextPage}`,
        { credentials: "include" },
      )
      if (!response.ok) throw new Error("Failed to load imported invoices")
      const json = (await response.json()) as InvoicesResponse
      setData(json)
      setPage(json.page)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(1)
  }, [])

  if (loading && !data) {
    return (
      <Container className="p-6">
        <Text>Loading…</Text>
      </Container>
    )
  }

  if (data && !data.connected) {
    return (
      <Container className="flex flex-col gap-4 p-6">
        <Heading level="h1">Imported invoices</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Imported sales invoices appear here after you connect your Finbaze
          account.
        </Text>
        <div>
          <Button asChild>
            <Link to="/finbaze">Complete setup</Link>
          </Button>
        </div>
      </Container>
    )
  }

  const rows = data?.rows ?? []
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Heading level="h1">Imported invoices</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Sales invoices synced from Medusa orders.
          </Text>
        </div>
        <Button variant="secondary" asChild>
          <Link to="/finbaze">Finbaze setup</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">
          No invoices have been imported yet. New orders sync automatically
          after you connect Finbaze, or use Import historical orders on the
          setup page.
        </Text>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-ui-border-base">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Order</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Last updated</Table.HeaderCell>
                  <Table.HeaderCell>Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => (
                  <Table.Row key={row.id}>
                    <Table.Cell>
                      {row.orderName ?? `Order ${row.medusaOrderId}`}
                    </Table.Cell>
                    <Table.Cell>
                      {row.invoiceSentAt ? (
                        <Badge color="green">Finalized</Badge>
                      ) : (
                        <Badge color="orange">Draft</Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>{formatUpdatedAt(row.updatedAt)}</Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="small" asChild>
                          <Link to={`/orders/${row.medusaOrderId}`}>
                            View order
                          </Link>
                        </Button>
                        <Button variant="secondary" size="small" asChild>
                          <a
                            href={row.finbazeInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open in Finbaze
                          </a>
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>

          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Text size="small" className="text-ui-fg-subtle">
                Page {page} of {totalPages} ({total} invoice
                {total === 1 ? "" : "s"})
              </Text>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  disabled={page <= 1 || loading}
                  onClick={() => void load(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  disabled={page >= totalPages || loading}
                  onClick={() => void load(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Imported invoices",
  rank: 1,
})

export default FinbazeInvoicesPage
