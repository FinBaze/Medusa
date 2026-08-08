import { Migration } from "@mikro-orm/migrations"

/**
 * Hand-written initial migration for Finbaze link tables.
 * Prefer regenerating with `pnpm exec medusa plugin:db:generate` once the plugin is
 * wired into a Medusa app, then replace this file if the CLI output differs.
 */
export class Migration20260807200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "finbaze_link" (
        "id" text not null,
        "store_key" text not null,
        "profile_id" text not null,
        "profile_url" text null,
        "profile_name" text null,
        "connection_id" text null,
        "access_token" text null,
        "refresh_token" text null,
        "token_expires_at" timestamptz null,
        "oauth_state" text null,
        "connected" boolean not null default false,
        "last_order_sync_at" timestamptz null,
        "last_product_sync_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "finbaze_link_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finbaze_link_store_key_unique" ON "finbaze_link" (store_key) WHERE deleted_at IS NULL;`,
    )

    this.addSql(`
      create table if not exists "finbaze_product_link" (
        "id" text not null,
        "store_key" text not null,
        "medusa_product_id" text not null,
        "finbaze_product_id" text not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "finbaze_product_link_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finbaze_product_link_store_product_unique" ON "finbaze_product_link" (store_key, medusa_product_id) WHERE deleted_at IS NULL;`,
    )

    this.addSql(`
      create table if not exists "finbaze_order_link" (
        "id" text not null,
        "store_key" text not null,
        "medusa_order_id" text not null,
        "sales_invoice_id" text null,
        "invoice_url" text null,
        "invoice_create_started_at" timestamptz null,
        "invoice_sent_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "finbaze_order_link_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finbaze_order_link_store_order_unique" ON "finbaze_order_link" (store_key, medusa_order_id) WHERE deleted_at IS NULL;`,
    )

    this.addSql(`
      create table if not exists "finbaze_order_credit_link" (
        "id" text not null,
        "store_key" text not null,
        "medusa_credit_key" text not null,
        "credit_sales_invoice_id" text null,
        "order_link_id" text not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "finbaze_order_credit_link_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finbaze_order_credit_link_store_key_unique" ON "finbaze_order_credit_link" (store_key, medusa_credit_key) WHERE deleted_at IS NULL;`,
    )
    this.addSql(`
      alter table if exists "finbaze_order_credit_link"
        add constraint "finbaze_order_credit_link_order_link_id_foreign"
        foreign key ("order_link_id") references "finbaze_order_link" ("id")
        on update cascade on delete cascade;
    `)

    this.addSql(`
      create table if not exists "finbaze_sync_cursor" (
        "id" text not null,
        "store_key" text not null,
        "kind" text not null,
        "cursor" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "finbaze_sync_cursor_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finbaze_sync_cursor_store_kind_unique" ON "finbaze_sync_cursor" (store_key, kind) WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "finbaze_order_credit_link" cascade;`)
    this.addSql(`drop table if exists "finbaze_order_link" cascade;`)
    this.addSql(`drop table if exists "finbaze_product_link" cascade;`)
    this.addSql(`drop table if exists "finbaze_sync_cursor" cascade;`)
    this.addSql(`drop table if exists "finbaze_link" cascade;`)
  }
}
