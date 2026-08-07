import { MedusaService } from "@medusajs/framework/utils"
import { FinbazeLink } from "./models/finbaze-link"
import { OrderCreditLink } from "./models/order-credit-link"
import { OrderLink } from "./models/order-link"
import { ProductLink } from "./models/product-link"
import { SyncCursor } from "./models/sync-cursor"

class FinbazeModuleService extends MedusaService({
  FinbazeLink,
  ProductLink,
  OrderLink,
  OrderCreditLink,
  SyncCursor,
}) {}

export default FinbazeModuleService
