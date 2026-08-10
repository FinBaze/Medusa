import { createHash, randomUUID } from "node:crypto"
import {
  FINBAZE_OAUTH_SCOPES,
  getFinbazeConfig,
  getStoreKey,
} from "./config"
import {
  getFinbazeModuleService,
  tryGetFinbazeModuleService,
} from "./module-access"

const GRAPHQL_PATH = "/graphql"

type TokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

type GraphqlResponse<T> = {
  data?: T
  errors?: Array<{ message: string }>
}

export type FinbazeLinkAuth = {
  profileId: string
  storeKey?: string
  accessToken?: string | null
  refreshToken?: string | null
  tokenExpiresAt?: Date | string | null
}

export type FinbazeLinkRecord = {
  id: string
  store_key: string
  profile_id: string
  profile_url?: string | null
  profile_name?: string | null
  connection_id?: string | null
  access_token?: string | null
  refresh_token?: string | null
  token_expires_at?: Date | string | null
  oauth_state?: string | null
  connected?: boolean
  last_order_sync_at?: Date | string | null
  last_product_sync_at?: Date | string | null
  /** Non-empty = only import orders from these Medusa sales channels. */
  sales_channel_ids?: string[] | null
}

export function authFromLink(link: FinbazeLinkRecord): FinbazeLinkAuth {
  return {
    storeKey: link.store_key,
    profileId: link.profile_id,
    accessToken: link.access_token,
    refreshToken: link.refresh_token,
    tokenExpiresAt: link.token_expires_at,
  }
}

/** Must match marketplace app redirect URI (finbaze-medusa seed). */
export function getFinbazeOAuthRedirectUri(): string {
  return `${getFinbazeConfig().backendUrl}/app/finbaze/callback`
}

export function buildFinbazeAuthorizeUrl(params: {
  state: string
  profileId?: string
  storeKey?: string
}): string {
  const config = getFinbazeConfig()
  const redirectUri = getFinbazeOAuthRedirectUri()
  const codeChallenge = createHash("sha256")
    .update(params.state)
    .digest("base64url")
  const search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: FINBAZE_OAUTH_SCOPES.join(" "),
    state: params.state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  })
  if (params.profileId) {
    search.set("profile_id", params.profileId)
  }
  return `${config.webBaseUrl}/oauth/authorize?${search}`
}

export function decodeAppAccessToken(accessToken: string): {
  profile_id?: string
  scope?: string
  exp?: number
} {
  const payload = accessToken.split(".")[1]
  if (!payload) return {}
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    profile_id?: string
    scope?: string
    exp?: number
  }
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function isAccessTokenValid(auth: FinbazeLinkAuth): boolean {
  if (!auth.accessToken) return false
  const expires = toDate(auth.tokenExpiresAt ?? null)
  if (expires) {
    return expires.getTime() > Date.now() + 30_000
  }
  const { exp } = decodeAppAccessToken(auth.accessToken)
  if (exp) return exp * 1000 > Date.now() + 30_000
  return false
}

async function persistAccessToken(
  storeKey: string,
  token: TokenResponse,
): Promise<void> {
  const service = tryGetFinbazeModuleService()
  if (!service) return
  const existing = await service.listFinbazeLinks({ store_key: storeKey })
  const link = existing[0]
  if (!link) return
  await service.updateFinbazeLinks({
    id: link.id,
    access_token: token.access_token,
    token_expires_at: new Date(Date.now() + token.expires_in * 1000),
  })
}

async function refreshAccessToken(auth: FinbazeLinkAuth): Promise<string> {
  const token = await exchangeClientCredentialsToken(auth.profileId)
  if (auth.storeKey) {
    await persistAccessToken(auth.storeKey, token)
    auth.accessToken = token.access_token
    auth.tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000)
  }
  return token.access_token
}

async function resolveAccessToken(auth: FinbazeLinkAuth): Promise<string> {
  if (isAccessTokenValid(auth)) {
    return auth.accessToken!
  }

  const config = getFinbazeConfig()
  if (config.clientSecret) {
    return refreshAccessToken(auth)
  }

  throw new Error(
    "Finbaze access token expired. Reconnect via Admin (PKCE), or set FINBAZE_APP_CLIENT_SECRET for client_credentials refresh.",
  )
}

export async function exchangeFinbazeCode(params: {
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<TokenResponse> {
  const config = getFinbazeConfig()
  // Public clients: client_id + PKCE code_verifier only (no client_secret).
  // If a secret is configured (hosted installs), send it as well.
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: config.clientId,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  }
  if (config.clientSecret) {
    body.client_secret = config.clientSecret
  }
  const response = await fetch(`${config.apiUrl}/v2/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Finbaze token exchange failed: ${text}`)
  }
  return response.json() as Promise<TokenResponse>
}

export async function exchangeClientCredentialsToken(
  profileId: string,
): Promise<TokenResponse> {
  const config = getFinbazeConfig()
  if (!config.clientSecret) {
    throw new Error("FINBAZE_APP_CLIENT_SECRET is not configured")
  }
  const response = await fetch(`${config.apiUrl}/v2/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      profile_id: profileId,
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Finbaze client credentials failed: ${text}`)
  }
  return response.json() as Promise<TokenResponse>
}

async function finbazeGraphql<TData>(
  auth: FinbazeLinkAuth,
  query: string,
  variables?: Record<string, unknown>,
): Promise<TData> {
  const config = getFinbazeConfig()
  let token = await resolveAccessToken(auth)

  const doFetch = (accessToken: string) =>
    fetch(`${config.apiUrl}${GRAPHQL_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    })

  let response = await doFetch(token)
  if (response.status === 401 && config.clientSecret) {
    token = await refreshAccessToken(auth)
    response = await doFetch(token)
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Finbaze GraphQL request failed: ${text}`)
  }

  const json = (await response.json()) as GraphqlResponse<TData>
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "))
  }
  if (!json.data) {
    throw new Error("Finbaze GraphQL response did not include data")
  }
  return json.data
}

function invoiceUrl(
  profileUrl: string | null | undefined,
  invoiceId: string,
): string {
  const base = getFinbazeConfig().webBaseUrl
  if (profileUrl) {
    return `${base}/p/${profileUrl}/sales-invoices/${invoiceId}`
  }
  return `${base}/sales-invoices/${invoiceId}`
}

export function buildFinbazeProfileBaseUrl(
  profileUrl: string | null | undefined,
): string {
  const base = getFinbazeConfig().webBaseUrl
  if (profileUrl) {
    return `${base}/p/${profileUrl}`
  }
  return base
}

export type MarketplaceInvoiceLineInput = {
  name: string
  description?: string
  quantity: number
  price: number
  discount?: number
  taxCode?: string
  productId?: string
}

/**
 * Draft sales invoice payload for Finbaze.
 * Do not include `number` — Finbaze assigns it atomically on close.
 * `customer.email` drives relation upsert (lookup by email) and is snapshotted
 * onto Create/UpdateSalesInvoice — same as Shopify MarketplaceInvoiceInput.
 */
export type MarketplaceInvoiceInput = {
  reference?: string
  currency: string
  date?: string
  customer?: {
    email?: string
    firstName?: string
    lastName?: string
    legalName?: string
    vatNumber?: string
  }
  lines: MarketplaceInvoiceLineInput[]
}

type ProfileSummary = {
  id: string
  name: string | null
  legalName: string | null
  url: string | null
}

async function fetchProfileSummary(
  auth: FinbazeLinkAuth,
): Promise<ProfileSummary> {
  const data = await finbazeGraphql<{ profile: ProfileSummary }>(
    auth,
    `query ProfileSummary($id: ID!) {
      profile(id: $id) {
        id
        name
        legalName
        url
      }
    }`,
    { id: auth.profileId },
  )
  return data.profile
}

export async function fetchMarketplaceProfile(auth: FinbazeLinkAuth) {
  const profile = await fetchProfileSummary(auth)
  return {
    profileId: profile.id,
    profileName: profile.name ?? profile.legalName,
    profileUrl: profile.url,
  }
}

async function upsertRelationId(
  auth: FinbazeLinkAuth,
  customer?: MarketplaceInvoiceInput["customer"],
): Promise<string | undefined> {
  if (!customer?.email && !customer?.legalName && !customer?.firstName) {
    return undefined
  }

  if (customer.email) {
    const existing = await finbazeGraphql<{
      relations: { edges: Array<{ node: { id: string } }> }
    }>(
      auth,
      `query RelationByEmail($profileId: String!, $email: String!) {
        relations(
          paging: { first: 1 }
          filter: {
            profileId: { eq: $profileId }
            email: { eq: $email }
          }
        ) {
          edges {
            node { id }
          }
        }
      }`,
      { profileId: auth.profileId, email: customer.email },
    )
    const relationId = existing.relations.edges[0]?.node.id
    if (relationId) return relationId
  }

  const created = await finbazeGraphql<{
    createOneRelation: { id: string }
  }>(
    auth,
    `mutation CreateRelation($profileId: ID!, $input: CreateRelationInput!) {
      createOneRelation(profileId: $profileId, input: $input) {
        id
      }
    }`,
    {
      profileId: auth.profileId,
      input: {
        uuid: randomUUID(),
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        legalName: customer.legalName,
        vatNumber: customer.vatNumber,
        tags: [],
        paymentKeywords: [],
      },
    },
  )
  return created.createOneRelation.id
}

export async function createSalesInvoice(
  auth: FinbazeLinkAuth,
  input: MarketplaceInvoiceInput,
) {
  const [profile, relationId] = await Promise.all([
    fetchProfileSummary(auth),
    upsertRelationId(auth, input.customer),
  ])

  const created = await finbazeGraphql<{
    createOneSalesInvoice: { id: string }
  }>(
    auth,
    `mutation CreateSalesInvoice($profileId: ID!, $input: CreateSalesInvoiceInput!) {
      createOneSalesInvoice(profileId: $profileId, input: $input) {
        id
      }
    }`,
    {
      profileId: auth.profileId,
      input: {
        uuid: randomUUID(),
        reference: input.reference,
        currency: input.currency,
        date: input.date,
        relationId,
        legalName: input.customer?.legalName,
        firstName: input.customer?.firstName,
        lastName: input.customer?.lastName,
        email: input.customer?.email,
        vatNumber: input.customer?.vatNumber,
      },
    },
  )

  const salesInvoiceId = created.createOneSalesInvoice.id
  return {
    salesInvoiceId,
    invoiceUrl: invoiceUrl(profile.url, salesInvoiceId),
  }
}

export async function replaceSalesInvoiceLines(
  auth: FinbazeLinkAuth,
  invoiceId: string,
  lines: MarketplaceInvoiceLineInput[],
) {
  const existing = await finbazeGraphql<{
    salesInvoice: { closed: string | null }
  }>(
    auth,
    `query SalesInvoiceClosed($id: ID!) {
      salesInvoice(id: $id) {
        closed
      }
    }`,
    { id: invoiceId },
  )

  if (existing.salesInvoice.closed) {
    return
  }

  await finbazeGraphql(
    auth,
    `mutation DeleteSalesInvoiceLines($filter: SalesInvoiceLineDeleteFilter!) {
      deleteManySalesInvoiceLines(input: { filter: $filter }) {
        deletedCount
      }
    }`,
    {
      filter: {
        salesInvoiceId: { eq: invoiceId },
      },
    },
  )

  for (const line of lines) {
    await finbazeGraphql(
      auth,
      `mutation CreateSalesInvoiceLine($salesInvoiceId: ID!, $input: CreateSalesInvoiceLineInput!) {
        createOneSalesInvoiceLine(salesInvoiceId: $salesInvoiceId, input: $input) {
          id
        }
      }`,
      {
        salesInvoiceId: invoiceId,
        input: {
          name: line.name,
          description: line.description,
          quantity: line.quantity,
          price: line.price,
          discount: line.discount,
          taxCode: line.taxCode,
          productId: line.productId,
        },
      },
    )
  }
}

async function updateSalesInvoiceHeader(
  auth: FinbazeLinkAuth,
  invoiceId: string,
  input: MarketplaceInvoiceInput,
  relationId?: string,
) {
  await finbazeGraphql(
    auth,
    `mutation UpdateSalesInvoice($input: UpdateOneSalesInvoiceInput!) {
      updateOneSalesInvoice(input: $input) {
        id
      }
    }`,
    {
      input: {
        id: invoiceId,
        update: {
          reference: input.reference,
          relationId,
          legalName: input.customer?.legalName,
          firstName: input.customer?.firstName,
          lastName: input.customer?.lastName,
          email: input.customer?.email,
          vatNumber: input.customer?.vatNumber,
        },
      },
    },
  )
}

export async function syncDraftSalesInvoice(
  auth: FinbazeLinkAuth,
  invoiceId: string,
  input: MarketplaceInvoiceInput,
) {
  const relationId = await upsertRelationId(auth, input.customer)
  await updateSalesInvoiceHeader(auth, invoiceId, input, relationId)
  await replaceSalesInvoiceLines(auth, invoiceId, input.lines)
}

export async function closeSalesInvoice(
  auth: FinbazeLinkAuth,
  invoiceId: string,
  paid?: string,
  options?: { send?: boolean },
) {
  const profile = await fetchProfileSummary(auth)

  const current = await finbazeGraphql<{
    salesInvoice: { closed: string | null }
  }>(
    auth,
    `query SalesInvoiceClosed($id: ID!) {
      salesInvoice(id: $id) {
        closed
      }
    }`,
    { id: invoiceId },
  )

  if (!current.salesInvoice.closed) {
    try {
      await finbazeGraphql(
        auth,
        `mutation CloseSalesInvoice($id: ID!, $send: Boolean) {
          closeSalesInvoice(id: $id, send: $send) {
            id
          }
        }`,
        { id: invoiceId, send: options?.send ?? true },
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (!message.toLowerCase().includes("already closed")) {
        throw error
      }
    }
  }

  if (paid) {
    await finbazeGraphql(
      auth,
      `mutation UpdateSalesInvoicePaid($input: UpdateOneSalesInvoiceInput!) {
        updateOneSalesInvoice(input: $input) {
          id
        }
      }`,
      {
        input: {
          id: invoiceId,
          update: { paid },
        },
      },
    )
  }

  return {
    salesInvoiceId: invoiceId,
    invoiceUrl: invoiceUrl(profile.url, invoiceId),
  }
}

export async function creditSalesInvoice(
  auth: FinbazeLinkAuth,
  invoiceId: string,
) {
  const profile = await fetchProfileSummary(auth)
  const current = await finbazeGraphql<{
    salesInvoice: { closed: string | null }
  }>(
    auth,
    `query SalesInvoiceClosed($id: ID!) {
      salesInvoice(id: $id) {
        closed
      }
    }`,
    { id: invoiceId },
  )

  if (!current.salesInvoice.closed) {
    await finbazeGraphql(
      auth,
      `mutation DeleteSalesInvoice($input: DeleteOneSalesInvoiceInput!) {
        deleteOneSalesInvoice(input: $input) {
          id
        }
      }`,
      { input: { id: invoiceId } },
    )
    return { salesInvoiceId: invoiceId, invoiceUrl: "" }
  }

  const credited = await finbazeGraphql<{
    creditSalesInvoice: { id: string }
  }>(
    auth,
    `mutation CreditSalesInvoice($id: ID!, $close: Boolean) {
      creditSalesInvoice(id: $id, close: $close) {
        id
      }
    }`,
    { id: invoiceId, close: true },
  )

  return {
    salesInvoiceId: credited.creditSalesInvoice.id,
    invoiceUrl: invoiceUrl(profile.url, credited.creditSalesInvoice.id),
  }
}

export type FinbazeCreditLineInput = {
  name: string
  quantity: number
  price: number
  taxCode?: string
  productId?: string
}

export type FinbazeSalesInvoiceDetails = {
  id: string
  reference: string | null
  currency: string
  date: string | null
  closed: string | null
  credited: boolean
  relationId: string | null
  legalName: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  lines: FinbazeCreditLineInput[]
}

export async function fetchSalesInvoiceDetails(
  auth: FinbazeLinkAuth,
  invoiceId: string,
): Promise<FinbazeSalesInvoiceDetails | null> {
  const data = await finbazeGraphql<{
    salesInvoice: FinbazeSalesInvoiceDetails | null
  }>(
    auth,
    `query SalesInvoiceForCredit($id: ID!) {
      salesInvoice(id: $id) {
        id
        reference
        currency
        date
        closed
        credited
        relationId
        legalName
        firstName
        lastName
        email
        lines {
          name
          quantity
          price
          taxCode
          productId
        }
      }
    }`,
    { id: invoiceId },
  )
  return data.salesInvoice
}

export async function createPartialCreditSalesInvoice(
  auth: FinbazeLinkAuth,
  params: {
    sourceInvoiceId: string
    reference: string
    date: string
    lines: FinbazeCreditLineInput[]
  },
) {
  const [profile, source] = await Promise.all([
    fetchProfileSummary(auth),
    fetchSalesInvoiceDetails(auth, params.sourceInvoiceId),
  ])
  if (!source?.closed) {
    throw new Error("Only closed invoices can be partially credited.")
  }
  if (params.lines.length === 0) {
    throw new Error("Credit invoice requires at least one line.")
  }

  const created = await finbazeGraphql<{
    createOneSalesInvoice: { id: string }
  }>(
    auth,
    `mutation CreateCreditSalesInvoice($profileId: ID!, $input: CreateSalesInvoiceInput!) {
      createOneSalesInvoice(profileId: $profileId, input: $input) {
        id
      }
    }`,
    {
      profileId: auth.profileId,
      input: {
        uuid: randomUUID(),
        reference: params.reference,
        currency: source.currency,
        date: params.date,
        relationId: source.relationId ?? undefined,
        legalName: source.legalName ?? undefined,
        firstName: source.firstName ?? undefined,
        lastName: source.lastName ?? undefined,
        email: source.email ?? undefined,
        initialInvoiceId: source.id,
      },
    },
  )

  const creditInvoiceId = created.createOneSalesInvoice.id
  for (const line of params.lines) {
    await finbazeGraphql(
      auth,
      `mutation CreateSalesInvoiceLine($salesInvoiceId: ID!, $input: CreateSalesInvoiceLineInput!) {
        createOneSalesInvoiceLine(salesInvoiceId: $salesInvoiceId, input: $input) {
          id
        }
      }`,
      {
        salesInvoiceId: creditInvoiceId,
        input: {
          name: line.name,
          quantity: line.quantity,
          price: line.price,
          taxCode: line.taxCode,
          productId: line.productId,
        },
      },
    )
  }

  await closeSalesInvoice(auth, creditInvoiceId, undefined, { send: false })

  return {
    salesInvoiceId: creditInvoiceId,
    invoiceUrl: invoiceUrl(profile.url, creditInvoiceId),
  }
}

// --- Products ---

export type FinbazeProductInput = {
  name: string
  description?: string
  sku?: string
  ean?: string
  hsCode?: string
  prices?: Record<string, number>
  taxCodesByCountry?: Record<string, string>
  active?: boolean
  type?: string
  code?: string
}

export type FinbazeProduct = {
  id: string
  name: string
  hsCode?: string | null
  taxCodesByCountry?: Record<string, string> | null
  active?: boolean
}

export async function createOneProduct(
  auth: FinbazeLinkAuth,
  input: FinbazeProductInput,
): Promise<FinbazeProduct> {
  const data = await finbazeGraphql<{ createOneProduct: FinbazeProduct }>(
    auth,
    `mutation CreateProduct($profileId: ID!, $input: CreateProductInput!) {
      createOneProduct(profileId: $profileId, input: $input) {
        id
        name
        hsCode
        taxCodesByCountry
        active
      }
    }`,
    {
      profileId: auth.profileId,
      input: {
        name: input.name,
        description: input.description,
        sku: input.sku,
        ean: input.ean,
        hsCode: input.hsCode,
        prices: input.prices ?? {},
        taxCodesByCountry: input.taxCodesByCountry ?? {},
        active: input.active ?? true,
        type: input.type ?? "goods",
        code: input.code,
      },
    },
  )
  return data.createOneProduct
}

export async function updateOneProduct(
  auth: FinbazeLinkAuth,
  productId: string,
  update: Partial<FinbazeProductInput>,
): Promise<FinbazeProduct> {
  const data = await finbazeGraphql<{ updateOneProduct: FinbazeProduct }>(
    auth,
    `mutation UpdateProduct($input: UpdateOneProductInput!) {
      updateOneProduct(input: $input) {
        id
        name
        hsCode
        taxCodesByCountry
        active
      }
    }`,
    {
      input: {
        id: productId,
        update,
      },
    },
  )
  return data.updateOneProduct
}

export type TaxCodeSuggestion = {
  country: string
  taxCode: string
  ratePercent: number
  rateType?: string
}

export async function suggestTaxCodesForHsCode(
  auth: FinbazeLinkAuth,
  hsCode: string,
  countries: string[],
): Promise<TaxCodeSuggestion[]> {
  if (!hsCode || countries.length === 0) return []
  const data = await finbazeGraphql<{
    suggestTaxCodesForHsCode: TaxCodeSuggestion[]
  }>(
    auth,
    `query SuggestTaxCodesForHsCode(
      $profileId: ID!
      $hsCode: String!
      $countries: [Country!]!
    ) {
      suggestTaxCodesForHsCode(
        profileId: $profileId
        hsCode: $hsCode
        countries: $countries
      ) {
        country
        taxCode
        ratePercent
        rateType
      }
    }`,
    {
      profileId: auth.profileId,
      hsCode,
      countries,
    },
  )
  return data.suggestTaxCodesForHsCode ?? []
}

export async function fetchProfileSellToCountries(
  auth: FinbazeLinkAuth,
): Promise<string[]> {
  const data = await finbazeGraphql<{
    profile?: {
      sellToCountries?: string[] | null
      registrationCountry?: string | null
    } | null
  }>(
    auth,
    `query ProfileSellToCountries($id: ID!) {
      profile(id: $id) {
        sellToCountries
        registrationCountry
      }
    }`,
    { id: auth.profileId },
  )

  const countries = new Set<string>()
  for (const country of data.profile?.sellToCountries ?? []) {
    if (country) countries.add(country)
  }
  if (data.profile?.registrationCountry) {
    countries.add(data.profile.registrationCountry)
  }
  return [...countries]
}

// --- Tax quote (exact Finbaze GraphQL contract) ---

export type QuoteSalesTaxLineInput = {
  externalLineId: string
  productId?: string
  hsCode?: string
  quantity?: number
  unitPriceMinor?: number
  currency?: string
  isShipping?: boolean
}

export type QuoteSalesTaxInput = {
  destinationCountry: string
  customerVatNumber?: string
  lines: QuoteSalesTaxLineInput[]
}

export type QuoteSalesTaxLineResult = {
  externalLineId: string
  taxCode: string
  ratePercent: number
  source: string
  name?: string | null
  warnings: string[]
}

export type QuoteSalesTaxResult = {
  lines: QuoteSalesTaxLineResult[]
  warnings: string[]
}

/**
 * `query quoteSalesTax($profileId: ID!, $input: QuoteSalesTaxInput!): QuoteSalesTaxResult!`
 * Auth: marketplace token with `sales_invoices:write`.
 */
export async function quoteSalesTax(
  auth: FinbazeLinkAuth,
  input: QuoteSalesTaxInput,
): Promise<QuoteSalesTaxResult> {
  const data = await finbazeGraphql<{
    quoteSalesTax: QuoteSalesTaxResult
  }>(
    auth,
    `query quoteSalesTax($profileId: ID!, $input: QuoteSalesTaxInput!) {
      quoteSalesTax(profileId: $profileId, input: $input) {
        warnings
        lines {
          externalLineId
          taxCode
          ratePercent
          source
          name
          warnings
        }
      }
    }`,
    {
      profileId: auth.profileId,
      input,
    },
  )
  return data.quoteSalesTax
}

export async function loadConnectedLink(
  storeKey?: string,
): Promise<FinbazeLinkRecord | null> {
  const service = getFinbazeModuleService()
  const key = getStoreKey(storeKey)
  const links = await service.listFinbazeLinks({
    store_key: key,
    connected: true,
  })
  return (links[0] as FinbazeLinkRecord | undefined) ?? null
}
