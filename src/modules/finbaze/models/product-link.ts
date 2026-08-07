import { model } from "@medusajs/framework/utils"

export const ProductLink = model
  .define("finbaze_product_link", {
    id: model.id().primaryKey(),
    store_key: model.text(),
    medusa_product_id: model.text(),
    finbaze_product_id: model.text(),
  })
  .indexes([
    {
      on: ["store_key", "medusa_product_id"],
      unique: true,
    },
  ])
