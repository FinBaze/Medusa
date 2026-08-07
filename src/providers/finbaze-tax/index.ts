import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import FinbazeTaxProvider from "./service"

export default ModuleProvider(Modules.TAX, {
  services: [FinbazeTaxProvider],
})
