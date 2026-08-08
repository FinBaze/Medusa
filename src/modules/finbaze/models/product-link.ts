import { model } from "@medusajs/framework/utils"

export const ProductLink = model
  .define("finbaze_product_link", {
    id: model.id().primaryKey(),
    store_key: model.text(),
    /** Parent Medusa product — used when tax calc only exposes product_id. */
    medusa_product_id: model.text(),
    /** Sellable unit; one Finbaze product per Medusa variant. */
    medusa_variant_id: model.text(),
    finbaze_product_id: model.text(),
  })
  .indexes([
    {
      on: ["store_key", "medusa_variant_id"],
      unique: true,
    },
    {
      on: ["store_key", "medusa_product_id"],
    },
  ])
