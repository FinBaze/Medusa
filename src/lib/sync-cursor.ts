import { getStoreKey } from "./config"
import { getFinbazeModuleService } from "./module-access"

export const HISTORICAL_PRODUCTS_KIND = "products"
export const HISTORICAL_ORDERS_KIND = "orders"
export const HISTORICAL_DONE = "__done__"
export const HISTORICAL_PRODUCTS_BATCH = 25
export const HISTORICAL_ORDERS_BATCH = 25

type SyncCursorRow = {
  id: string
  store_key: string
  kind: string
  cursor?: string | null
}

async function listCursor(
  storeKey: string,
  kind: string,
): Promise<SyncCursorRow | null> {
  const service = getFinbazeModuleService()
  const rows = (await service.listSyncCursors({
    store_key: storeKey,
    kind,
  })) as SyncCursorRow[]
  return rows[0] ?? null
}

export async function getSyncCursor(
  kind: string,
  storeKey?: string,
): Promise<string | null> {
  const key = getStoreKey(storeKey)
  const row = await listCursor(key, kind)
  return row?.cursor ?? null
}

export async function setSyncCursor(
  kind: string,
  cursor: string | null,
  storeKey?: string,
): Promise<void> {
  const key = getStoreKey(storeKey)
  const service = getFinbazeModuleService()
  const existing = await listCursor(key, kind)
  if (existing) {
    await service.updateSyncCursors({
      id: existing.id,
      cursor,
    })
    return
  }
  await service.createSyncCursors({
    store_key: key,
    kind,
    cursor,
  })
}

export async function clearSyncCursor(
  kind: string,
  storeKey?: string,
): Promise<void> {
  const key = getStoreKey(storeKey)
  const existing = await listCursor(key, kind)
  if (!existing) return
  await getFinbazeModuleService().deleteSyncCursors(existing.id)
}

export function parseSkipCursor(cursor: string | null | undefined): number {
  if (!cursor || cursor === HISTORICAL_DONE) return 0
  const skip = Number.parseInt(cursor, 10)
  return Number.isFinite(skip) && skip > 0 ? skip : 0
}
