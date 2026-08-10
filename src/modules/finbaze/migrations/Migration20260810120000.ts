import { Migration } from "@mikro-orm/migrations"

/**
 * Optional sales-channel allowlist for order import.
 * Empty / null = import from all channels (backward compatible).
 */
export class Migration20260810120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table if exists "finbaze_link"
        add column if not exists "sales_channel_ids" text[] null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table if exists "finbaze_link"
        drop column if exists "sales_channel_ids";
    `)
  }
}
