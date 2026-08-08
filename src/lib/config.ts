export type FinbazePluginOptions = {
  /** Logical store key for multi-store Medusa apps. Default: env FINBAZE_STORE_KEY or "default". */
  storeKey?: string
  apiUrl?: string
  webBaseUrl?: string
  clientId?: string
  /**
   * Optional. Public/OSS installs use PKCE only (no secret).
   * Set only for hosted installs that use client_credentials token refresh.
   */
  clientSecret?: string
  /** Public Medusa backend URL used for OAuth redirect. */
  backendUrl?: string
}

export type ResolvedFinbazeConfig = {
  storeKey: string
  apiUrl: string
  webBaseUrl: string
  clientId: string
  /** Empty when unset — PKCE connect does not need a secret. */
  clientSecret?: string
  backendUrl: string
}

let pluginOptions: FinbazePluginOptions = {}

export function setFinbazePluginOptions(options: FinbazePluginOptions | undefined) {
  pluginOptions = options ?? {}
}

export function getFinbazePluginOptions(): FinbazePluginOptions {
  return pluginOptions
}

export function getStoreKey(override?: string): string {
  return (
    override?.trim() ||
    pluginOptions.storeKey?.trim() ||
    process.env.FINBAZE_STORE_KEY?.trim() ||
    "default"
  )
}

export function getFinbazeConfig(): ResolvedFinbazeConfig {
  const apiUrl = (
    pluginOptions.apiUrl ??
    process.env.FINBAZE_API_URL ??
    "https://api.platform.finbaze.com"
  ).replace(/\/$/, "")
  const webBaseUrl = (
    pluginOptions.webBaseUrl ??
    process.env.FINBAZE_WEB_BASE_URL ??
    "https://platform.finbaze.com"
  ).replace(/\/$/, "")
  const backendUrl = (
    pluginOptions.backendUrl ??
    process.env.MEDUSA_BACKEND_URL ??
    "http://localhost:9000"
  ).replace(/\/$/, "")

  const clientSecret = (
    pluginOptions.clientSecret ??
    process.env.FINBAZE_APP_CLIENT_SECRET ??
    ""
  ).trim()

  return {
    storeKey: getStoreKey(),
    apiUrl,
    webBaseUrl,
    clientId:
      pluginOptions.clientId ??
      process.env.FINBAZE_APP_CLIENT_ID ??
      "finbaze-medusa",
    clientSecret: clientSecret || undefined,
    backendUrl,
  }
}

export const FINBAZE_OAUTH_SCOPES = [
  "dashboard:read",
  "sales_invoices:write",
  "relations:write",
  "products:write",
] as const
