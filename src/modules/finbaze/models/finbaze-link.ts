import { model } from "@medusajs/framework/utils"

export const FinbazeLink = model
  .define("finbaze_link", {
    id: model.id().primaryKey(),
    store_key: model.text(),
    profile_id: model.text(),
    profile_url: model.text().nullable(),
    profile_name: model.text().nullable(),
    connection_id: model.text().nullable(),
    access_token: model.text().nullable(),
    refresh_token: model.text().nullable(),
    token_expires_at: model.dateTime().nullable(),
    oauth_state: model.text().nullable(),
    connected: model.boolean().default(false),
    last_order_sync_at: model.dateTime().nullable(),
    last_product_sync_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      on: ["store_key"],
      unique: true,
    },
  ])
