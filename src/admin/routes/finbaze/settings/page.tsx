import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Heading,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

type SalesChannelOption = {
  id: string
  name: string
  isDisabled: boolean
}

type FinbazeStatus = {
  storeKey: string
  connected: boolean
  productLinkCount: number
  orderLinkCount: number
  orderCreditLinkCount: number
  syncCursorCount: number
  hasFinbazeLink: boolean
  salesChannelIds: string[]
  salesChannels: SalesChannelOption[]
}

const FinbazeSettingsPage = () => {
  const [status, setStatus] = useState<FinbazeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [savingChannels, setSavingChannels] = useState(false)
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch("/admin/finbaze", { credentials: "include" })
      if (!response.ok) throw new Error("Failed to load Finbaze status")
      const json = (await response.json()) as FinbazeStatus
      setStatus(json)
      setSelectedChannelIds(json.salesChannelIds ?? [])
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

  const channelsDirty = useMemo(() => {
    const saved = [...(status?.salesChannelIds ?? [])].sort()
    const current = [...selectedChannelIds].sort()
    if (saved.length !== current.length) return true
    return saved.some((id, index) => id !== current[index])
  }, [selectedChannelIds, status?.salesChannelIds])

  const toggleChannel = (channelId: string) => {
    setSelectedChannelIds((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId],
    )
  }

  const saveSalesChannels = async () => {
    setSavingChannels(true)
    try {
      const response = await fetch("/admin/finbaze", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesChannelIds: selectedChannelIds }),
      })
      const json = (await response.json().catch(() => ({}))) as {
        message?: string
        salesChannelIds?: string[]
      }
      if (!response.ok) {
        throw new Error(json.message || "Failed to save sales channels")
      }
      const saved = json.salesChannelIds ?? selectedChannelIds
      setSelectedChannelIds(saved)
      setStatus((prev) =>
        prev ? { ...prev, salesChannelIds: saved } : prev,
      )
      toast.success(
        saved.length === 0
          ? "Order import: all sales channels"
          : `Order import limited to ${saved.length} sales channel${
              saved.length === 1 ? "" : "s"
            }`,
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save sales channels",
      )
    } finally {
      setSavingChannels(false)
    }
  }

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

          <div className="flex flex-col gap-3 rounded-lg border border-ui-border-base p-4">
            <Heading level="h2">Order import sales channels</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Choose which Medusa sales channels Finbaze should import orders
              from. Leave none selected to import from all channels. Use this
              when some channels sync via another Finbaze integration and must
              not be duplicated.
            </Text>
            {!status.hasFinbazeLink ? (
              <Text size="small" className="text-ui-fg-subtle">
                Connect Finbaze first to save this setting.
              </Text>
            ) : null}
            {(status.salesChannels ?? []).length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No sales channels found in this Medusa store.
              </Text>
            ) : (
              <div className="flex flex-col gap-2">
                {status.salesChannels.map((channel) => {
                  const checked = selectedChannelIds.includes(channel.id)
                  const checkboxId = `finbaze-sc-${channel.id}`
                  return (
                    <div
                      key={channel.id}
                      className="flex items-start gap-2"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        disabled={!status.hasFinbazeLink || savingChannels}
                        onCheckedChange={() => toggleChannel(channel.id)}
                      />
                      <div className="flex flex-col gap-0.5">
                        <Label htmlFor={checkboxId} weight="plus" size="small">
                          {channel.name}
                          {channel.isDisabled ? " (disabled)" : ""}
                        </Label>
                        <Text size="xsmall" className="text-ui-fg-muted">
                          {channel.id}
                        </Text>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <Text size="small" className="text-ui-fg-subtle">
              {selectedChannelIds.length === 0
                ? "Currently importing orders from all sales channels."
                : `Importing only from ${selectedChannelIds.length} selected channel${
                    selectedChannelIds.length === 1 ? "" : "s"
                  }.`}
            </Text>
            <div>
              <Button
                onClick={() => void saveSalesChannels()}
                isLoading={savingChannels}
                disabled={
                  !status.hasFinbazeLink ||
                  !channelsDirty ||
                  savingChannels
                }
              >
                Save sales channels
              </Button>
            </div>
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
