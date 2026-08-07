import { model } from "@medusajs/framework/utils"

export const SyncCursor = model
  .define("finbaze_sync_cursor", {
    id: model.id().primaryKey(),
    store_key: model.text(),
    kind: model.text(),
    cursor: model.text().nullable(),
  })
  .indexes([
    {
      on: ["store_key", "kind"],
      unique: true,
    },
  ])
