import { model } from "@medusajs/framework/utils"
import { OrderLink } from "./order-link"

export const OrderCreditLink = model
  .define("finbaze_order_credit_link", {
    id: model.id().primaryKey(),
    store_key: model.text(),
    medusa_credit_key: model.text(),
    credit_sales_invoice_id: model.text().nullable(),
    order_link: model.belongsTo(() => OrderLink, {
      mappedBy: "credit_links",
    }),
  })
  .indexes([
    {
      on: ["store_key", "medusa_credit_key"],
      unique: true,
    },
  ])
