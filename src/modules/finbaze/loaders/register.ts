import type { LoaderOptions } from "@medusajs/framework/types"
import {
  setFinbazePluginOptions,
  type FinbazePluginOptions,
} from "../../../lib/config"
import { setFinbazeModuleService } from "../../../lib/module-access"
import { FINBAZE_MODULE } from "../index"
import type FinbazeModuleService from "../service"

export default async function registerFinbazeLoader({
  container,
  options,
}: LoaderOptions<FinbazePluginOptions>) {
  setFinbazePluginOptions(options)
  try {
    const service = container.resolve(FINBAZE_MODULE) as FinbazeModuleService
    setFinbazeModuleService(service)
  } catch {
    // Service may not be resolvable during early boot; routes/subscribers re-bind.
  }
}
