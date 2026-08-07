import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getStoreKey } from "../../../../../lib/config"
import { ensureFinbazeService } from "../../../../../lib/ensure-service"
import {
  authFromLink,
  decodeAppAccessToken,
  exchangeFinbazeCode,
  fetchMarketplaceProfile,
  getFinbazeOAuthRedirectUri,
} from "../../../../../lib/finbaze-client"

type ExchangeBody = {
  code?: string
  state?: string
}

/**
 * Completes PKCE OAuth after the browser lands on
 * `{MEDUSA_BACKEND_URL}/app/finbaze/callback` (marketplace redirect URI).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = ensureFinbazeService(req.scope)
  const storeKey = getStoreKey()
  const body = (req.body ?? {}) as ExchangeBody
  const code = String(body.code ?? "")
  const state = String(body.state ?? "")

  if (!code || !state) {
    res.status(400).json({ message: "Missing code or state" })
    return
  }

  const links = await service.listFinbazeLinks({
    store_key: storeKey,
    oauth_state: state,
  })
  const link = links[0]
  if (!link) {
    res.status(400).json({
      message: "Unknown OAuth state. Start connect again from Finbaze settings.",
    })
    return
  }

  const token = await exchangeFinbazeCode({
    code,
    redirectUri: getFinbazeOAuthRedirectUri(),
    codeVerifier: state,
  })

  const decoded = decodeAppAccessToken(token.access_token)
  const profileId = decoded.profile_id
  if (!profileId) {
    res.status(400).json({ message: "Token did not include profile_id" })
    return
  }

  const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000)

  await service.updateFinbazeLinks({
    id: link.id,
    profile_id: profileId,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    token_expires_at: tokenExpiresAt,
    oauth_state: null,
    connected: true,
  })

  try {
    const profile = await fetchMarketplaceProfile(
      authFromLink({
        ...link,
        profile_id: profileId,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        token_expires_at: tokenExpiresAt,
        connected: true,
      }),
    )
    await service.updateFinbazeLinks({
      id: link.id,
      profile_name: profile.profileName ?? null,
      profile_url: profile.profileUrl ?? null,
    })
  } catch {
    // Profile summary is best-effort
  }

  res.json({ connected: true, profileId })
}
