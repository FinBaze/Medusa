# @finbaze/medusa

Medusa v2 plugin that connects a merchant store to Finbaze:

- **Tax Module Provider** — checkout tax lines via Finbaze `quoteSalesTax` (profile obligations + imported products)
- **Product sync** — Medusa products → Finbaze products (`ProductLink`, HS → `taxCodesByCountry`)
- **Order sync** — Shopify-parity invoices: draft on place/update, close+send when fulfilled, historical close without send, cancel/refund credits

## Install

In your Medusa application:

```bash
npm install @finbaze/medusa
pnpm add @finbaze/medusa
# or, from this monorepo during development:
# npx medusa plugin:add @finbaze/medusa
# pnpm exec medusa plugin:add @finbaze/medusa
```

### `medusa-config.ts`

```ts
import { defineConfig } from "@medusajs/framework/utils"

module.exports = defineConfig({
  // ...
  plugins: [
    {
      resolve: "@finbaze/medusa",
      options: {
        storeKey: process.env.FINBAZE_STORE_KEY || "default",
        // Optional — public/OSS installs use PKCE only (omit secret)
        clientSecret: process.env.FINBAZE_APP_CLIENT_SECRET,
        backendUrl: process.env.MEDUSA_BACKEND_URL,
      },
    },
  ],
  modules: [
    {
      resolve: "@medusajs/medusa/tax",
      options: {
        providers: [
          {
            resolve: "@finbaze/medusa/providers/finbaze-tax",
            id: "finbaze",
            options: {
              storeKey: process.env.FINBAZE_STORE_KEY || "default",
            },
          },
        ],
      },
    },
  ],
})
```

Then migrate:

```bash
npx medusa db:migrate
pnpm exec medusa db:migrate
```

Assign each tax region that should use Finbaze to provider id `tp_finbaze_finbaze` (Medusa stores providers as `tp_{identifier}_{id}`).

## Environment

See [`.env.example`](./.env.example).

`FINBAZE_API_URL`, `FINBAZE_WEB_BASE_URL`, and `FINBAZE_APP_CLIENT_ID` default to production (`https://api.platform.finbaze.com`, `https://platform.finbaze.com`, `finbaze-medusa`). Override only for local Finbaze or a custom client.

| Variable | Purpose |
|---|---|
| `MEDUSA_BACKEND_URL` | Public Medusa URL for OAuth callback |
| `FINBAZE_STORE_KEY` | Logical store key for link tables |
| `FINBAZE_APP_CLIENT_SECRET` | **Optional.** Only for client-credentials refresh on hosted installs |

### Public / open-source installs (no client secret)

OAuth uses **PKCE** (`client_id` + `code_verifier`). You do **not** need a published `FINBAZE_APP_CLIENT_SECRET`.

Minimum env:

```bash
MEDUSA_BACKEND_URL=https://your-medusa.example.com
```

When the access token expires without a secret configured, reconnect via Admin (no silent client_credentials refresh).

OAuth redirect URI (seeded on `finbaze-medusa`):

`http://localhost:9000/app/finbaze/callback`

(or `{MEDUSA_BACKEND_URL}/app/finbaze/callback`)

## Admin

Open **Finbaze** in Medusa Admin (`/app/finbaze`):

1. **Connect Finbaze** — PKCE OAuth against `{WEB}/oauth/authorize` (public client: no secret)
2. **Sync products** — bulk upsert into Finbaze + `ProductLink`
3. **Import historical orders** — draft/close with `send: false` when fulfilled

### Product HS metadata

On Medusa products, set metadata:

- `hs_code` or `finbaze_hs_code`

On first create, the plugin calls `suggestTaxCodesForHsCode` for the profile’s sell-to countries.

## Tax quote contract

```graphql
query quoteSalesTax($profileId: ID!, $input: QuoteSalesTaxInput!): QuoteSalesTaxResult!

input QuoteSalesTaxInput {
  destinationCountry: String!
  customerVatNumber: String
  lines: [QuoteSalesTaxLineInput!]!
}

input QuoteSalesTaxLineInput {
  externalLineId: String!
  productId: ID
  hsCode: String
  quantity: Float
  unitPriceMinor: Float
  currency: String
  isShipping: Boolean
}
```

- Auth: `sales_invoices:write` for quote; `products:write` for product CRUD
- Shipping lines are sent with `isShipping: true`
- Item lines map Medusa `product_id` → Finbaze `productId` via `ProductLink`

## Lifecycle (orders)

| Event | Behavior |
|---|---|
| `order.placed` / `order.updated` | Create/update **draft** sales invoice (+ `productId` on lines when linked) |
| Fulfillment / completed | `closeSalesInvoice(send: true)` |
| Historical import + fulfilled | Close with `send: false` |
| `order.canceled` | Credit closed invoice / delete draft |
| Refund | Credit invoice + `OrderCreditLink` |

## Package layout

```
integrations/medusa/
  src/
    modules/finbaze/     # FinbazeLink, ProductLink, OrderLink, OrderCreditLink, SyncCursor
    providers/finbaze-tax/
    lib/                 # finbaze-client, product-sync, order-sync, invoice-lines
    subscribers/
    api/admin/finbaze/
    admin/routes/finbaze/
```

## Development (this repo)

```bash
# From the monorepo root (preferred):
pnpm install
pnpm --filter @finbaze/medusa run dev

# Or from this package:
cd integrations/medusa
pnpm install
pnpm exec medusa plugin:develop
```

In the Medusa app: `pnpm exec medusa plugin:add @finbaze/medusa`.
