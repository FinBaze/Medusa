import { Migration } from "@mikro-orm/migrations"

/**
 * ProductLink keys on Medusa variant (one Finbaze product per variant).
 * Existing product-level links are cleared — re-run Admin → Sync products.
 *
 * Idempotent when the table was already created with medusa_variant_id
 * (updated Migration20260807200000).
 */
export class Migration20260808153000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table if exists "finbaze_product_link"
        add column if not exists "medusa_variant_id" text null;
    `)

    // Old rows keyed only by product cannot be mapped to variants safely.
    this.addSql(`
      delete from "finbaze_product_link"
      where "medusa_variant_id" is null;
    `)

    this.addSql(
      `DROP INDEX IF EXISTS "IDX_finbaze_product_link_store_product_unique";`,
    )

    this.addSql(`
      do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_name = 'finbaze_product_link'
            and column_name = 'medusa_variant_id'
            and is_nullable = 'YES'
        ) then
          alter table "finbaze_product_link"
            alter column "medusa_variant_id" set not null;
        end if;
      end $$;
    `)

    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finbaze_product_link_store_variant_unique" ON "finbaze_product_link" (store_key, medusa_variant_id) WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finbaze_product_link_store_product" ON "finbaze_product_link" (store_key, medusa_product_id) WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `DROP INDEX IF EXISTS "IDX_finbaze_product_link_store_variant_unique";`,
    )
    this.addSql(
      `DROP INDEX IF EXISTS "IDX_finbaze_product_link_store_product";`,
    )
    this.addSql(`
      alter table if exists "finbaze_product_link"
        drop column if exists "medusa_variant_id";
    `)
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finbaze_product_link_store_product_unique" ON "finbaze_product_link" (store_key, medusa_product_id) WHERE deleted_at IS NULL;`,
    )
  }
}
