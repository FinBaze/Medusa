import type FinbazeModuleService from "../modules/finbaze/service"

/**
 * Process-local bridge so the Tax Module Provider (isolated container) can
 * read FinbazeLink / ProductLink via the Finbaze data module service.
 * Set from API routes / subscribers that resolve FINBAZE_MODULE.
 */
let finbazeService: FinbazeModuleService | null = null

export function setFinbazeModuleService(service: FinbazeModuleService) {
  finbazeService = service
}

export function getFinbazeModuleService(): FinbazeModuleService {
  if (!finbazeService) {
    throw new Error(
      "Finbaze module service is not registered yet. Ensure the plugin module is loaded and a route/subscriber has resolved it.",
    )
  }
  return finbazeService
}

export function tryGetFinbazeModuleService(): FinbazeModuleService | null {
  return finbazeService
}
