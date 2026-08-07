import { model } from "@medusajs/framework/utils"
import { OrderCreditLink } from "./order-credit-link"

export const OrderLink = model
  .define("finbaze_order_link", {
    id: model.id().primaryKey(),
    store_key: model.text(),
    medusa_order_id: model.text(),
    sales_invoice_id: model.text().nullable(),
    invoice_url: model.text().nullable(),
    invoice_create_started_at: model.dateTime().nullable(),
    invoice_sent_at: model.dateTime().nullable(),
    credit_links: model.hasMany(() => OrderCreditLink, {
      mappedBy: "order_link",
    }),
  })
  .indexes([
    {
      on: ["store_key", "medusa_order_id"],
      unique: true,
    },
  ])
