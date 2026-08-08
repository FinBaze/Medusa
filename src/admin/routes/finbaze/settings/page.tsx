import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

type FinbazeStatus = {
  storeKey: string
  connected: boolean
  profileId: string | null
  productLinkCount: number
  orderLinkCount: number
  orderCreditLinkCount: number
  syncCursorCount: number
  hasFinbazeLink: boolean
}

const FinbazeSettingsPage = () => {
  const [status, setStatus] = useState<FinbazeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch("/admin/finbaze", { credentials: "include" })
      if (!response.ok) throw new Error("Failed to load Finbaze status")
      setStatus(await response.json())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const totalLinks =
    (status?.productLinkCount ?? 0) +
    (status?.orderLinkCount ?? 0) +
    (status?.orderCreditLinkCount ?? 0) +
    (status?.syncCursorCount ?? 0) +
    (status?.hasFinbazeLink ? 1 : 0)

  const clearLinks = async () => {
    if (status?.connected) {
      toast.error("Disconnect from Finbaze before clearing local links.")
      return
    }
    if (totalLinks === 0) {
      toast.error("No local Finbaze links to clear.")
      return
    }
    const confirmed = window.confirm(
      "Delete all local Finbaze DB links for this store?\n\n" +
        "This removes product/order/credit/sync/connection rows in Medusa only. " +
        "Finbaze products and invoices are not deleted.\n\n" +
        "This is intended for debugging.",
    )
    if (!confirmed) return

    setBusy(true)
    try {
      const response = await fetch("/admin/finbaze/clear-links", {
        method: "POST",
        credentials: "include",
      })
      const json = (await response.json().catch(() => ({}))) as {
        message?: string
        deleted?: Record<string, number>
      }
      if (!response.ok) {
        throw new Error(json.message || "Clear links failed")
      }
      const deleted = json.deleted
      toast.success(
        deleted
          ? `Cleared local links (products ${deleted.productLinks}, orders ${deleted.orderLinks}, credits ${deleted.orderCreditLinks}, cursors ${deleted.syncCursors}, connection ${deleted.finbazeLinks})`
          : "Cleared local Finbaze links",
      )
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Clear links failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Heading level="h1">Finbaze settings</Heading>
          <Text size="small" className="text-ui-fg-subtle mt-1">
            Connection and debug tools for this Medusa store.
          </Text>
        </div>
        <Button variant="secondary" asChild>
          <Link to="/finbaze">Back to Finbaze</Link>
        </Button>
      </div>

      {loading || !status ? (
        <Text>Loading…</Text>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-lg border border-ui-border-base p-4">
            <div className="flex items-center gap-2">
              <Text size="small" weight="plus">
                Connection
              </Text>
              {status.connected ? (
                <Badge color="green">Connected</Badge>
              ) : (
                <Badge color="grey">Not connected</Badge>
              )}
            </div>
            <Text size="small">Store key: {status.storeKey}</Text>
            <Text size="small">
              Local rows — products: {status.productLinkCount} · orders:{" "}
              {status.orderLinkCount} · credits: {status.orderCreditLinkCount} ·
              cursors: {status.syncCursorCount} · connection record:{" "}
              {status.hasFinbazeLink ? "yes" : "no"}
            </Text>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-ui-border-danger p-4">
            <Heading level="h2">Debug</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Clear local Finbaze link tables after disconnect. Use this when
              re-testing sync from a clean slate. Does not call Finbaze to
              delete remote products or invoices.
            </Text>
            {status.connected ? (
              <Text size="small" className="text-ui-fg-subtle">
                Disconnect on the Finbaze setup page first, then return here to
                clear links.
              </Text>
            ) : null}
            <div>
              <Button
                variant="danger"
                onClick={() => void clearLinks()}
                isLoading={busy}
                disabled={status.connected || totalLinks === 0 || busy}
              >
                Clear local DB links
              </Button>
            </div>
          </div>
        </>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Settings",
  rank: 2,
})

export default FinbazeSettingsPage
