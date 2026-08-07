import type { MedusaContainer } from "@medusajs/framework/types"
import { FINBAZE_MODULE } from "../modules/finbaze"
import type FinbazeModuleService from "../modules/finbaze/service"
import { setFinbazeModuleService } from "./module-access"

export function ensureFinbazeService(container: MedusaContainer): FinbazeModuleService {
  const service = container.resolve(FINBAZE_MODULE) as FinbazeModuleService
  setFinbazeModuleService(service)
  return service
}
