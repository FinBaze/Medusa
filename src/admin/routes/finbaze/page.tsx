import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
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
  profileName: string | null
  profileUrl: string | null
  profileBaseUrl: string | null
  lastOrderSyncAt: string | null
  lastProductSyncAt: string | null
  productLinkCount: number
  orderLinkCount: number
  clientId: string
  apiUrl: string
}

const FinbazePage = () => {
  const [status, setStatus] = useState<FinbazeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

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
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      if (params.get("connected") === "1") {
        toast.success("Connected to Finbaze")
      }
    }
  }, [])

  const connect = async () => {
    setBusy("connect")
    try {
      const response = await fetch("/admin/finbaze/connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error("Connect failed")
      const json = (await response.json()) as { authorizeUrl: string }
      window.location.href = json.authorizeUrl
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connect failed")
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setBusy("disconnect")
    try {
      const response = await fetch("/admin/finbaze/disconnect", {
        method: "POST",
        credentials: "include",
      })
      if (!response.ok) throw new Error("Disconnect failed")
      toast.success("Disconnected from Finbaze")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Disconnect failed")
    } finally {
      setBusy(null)
    }
  }

  const syncProducts = async () => {
    setBusy("products")
    try {
      const response = await fetch("/admin/finbaze/sync-products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }),
      })
      if (!response.ok) throw new Error("Product sync failed")
      const json = await response.json()
      toast.success(
        `Products synced: ${json.synced} (${json.created} created, ${json.updated} updated)`,
      )
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Product sync failed")
    } finally {
      setBusy(null)
    }
  }

  const syncOrders = async () => {
    setBusy("orders")
    try {
      const response = await fetch("/admin/finbaze/sync-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      })
      if (!response.ok) throw new Error("Order import failed")
      const json = await response.json()
      toast.success(`Orders imported: ${json.synced} (failed: ${json.failed})`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Order import failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <Heading level="h1">Finbaze</Heading>
        {status?.connected ? (
          <Badge color="green">Connected</Badge>
        ) : (
          <Badge color="grey">Not connected</Badge>
        )}
      </div>

      <Text size="small" className="text-ui-fg-subtle">
        Connect a Finbaze profile for checkout tax quoting, product import, and
        sales invoice sync (Shopify-parity lifecycle).
      </Text>

      {loading ? (
        <Text>Loading…</Text>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-ui-border-base p-4">
          <Text size="small">Store key: {status?.storeKey}</Text>
          <Text size="small">Client: {status?.clientId}</Text>
          <Text size="small">API: {status?.apiUrl}</Text>
          {status?.connected ? (
            <>
              <Text size="small">
                Profile: {status.profileName ?? status.profileId}
              </Text>
              <Text size="small">
                Product links: {status.productLinkCount} · Order links:{" "}
                {status.orderLinkCount}
              </Text>
              <Text size="small">
                Last product sync:{" "}
                {status.lastProductSyncAt
                  ? new Date(status.lastProductSyncAt).toLocaleString()
                  : "—"}
              </Text>
              <Text size="small">
                Last order sync:{" "}
                {status.lastOrderSyncAt
                  ? new Date(status.lastOrderSyncAt).toLocaleString()
                  : "—"}
              </Text>
            </>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!status?.connected ? (
          <Button onClick={() => void connect()} isLoading={busy === "connect"}>
            Connect Finbaze
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => void disconnect()}
              isLoading={busy === "disconnect"}
            >
              Disconnect
            </Button>
            <Button
              onClick={() => void syncProducts()}
              isLoading={busy === "products"}
            >
              Sync products
            </Button>
            <Button
              variant="secondary"
              onClick={() => void syncOrders()}
              isLoading={busy === "orders"}
            >
              Import historical orders
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/finbaze/invoices">
                Imported invoices
                {status.orderLinkCount > 0
                  ? ` (${status.orderLinkCount})`
                  : ""}
              </Link>
            </Button>
            {status.profileBaseUrl ? (
              <Button
                variant="transparent"
                onClick={() =>
                  window.open(status.profileBaseUrl!, "_blank", "noopener")
                }
              >
                Open Finbaze
              </Button>
            ) : null}
          </>
        )}
        <Button variant="transparent" asChild>
          <Link to="/finbaze/settings">Settings</Link>
        </Button>
      </div>

      {!loading && status && !status.connected ? (
        <Text size="small" className="text-ui-fg-subtle">
          Local links still on this store: {status.productLinkCount} products ·{" "}
          {status.orderLinkCount} orders. Clear them from{" "}
          <Link to="/finbaze/settings" className="underline">
            Settings
          </Link>{" "}
          when debugging.
        </Text>
      ) : null}

      <div className="rounded-lg border border-ui-border-base p-4">
        <Heading level="h2">HS codes</Heading>
        <Text size="small" className="text-ui-fg-subtle mt-2">
          Each Medusa variant syncs as its own Finbaze product. Set product (or
          variant) metadata <code>hs_code</code> or{" "}
          <code>finbaze_hs_code</code> so Finbaze can suggest{" "}
          <code>taxCodesByCountry</code> on first import. Assign tax regions to
          the Finbaze tax provider (<code>tp_finbaze_finbaze</code>) for
          checkout quotes.
        </Text>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Finbaze",
  icon: CurrencyDollar,
})

export default FinbazePage
