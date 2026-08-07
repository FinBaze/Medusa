import { Migration } from "@mikro-orm/migrations"

/** Adds refresh_token for PKCE public-client token refresh (no client_secret). */
export class Migration20260807210000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table if exists "finbaze_link"
        add column if not exists "refresh_token" text null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table if exists "finbaze_link"
        drop column if exists "refresh_token";
    `)
  }
}
