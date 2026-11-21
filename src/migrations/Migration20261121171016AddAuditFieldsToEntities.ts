import { Migration } from '@mikro-orm/migrations';

export class Migration20261121171016AddAuditFieldsToEntities extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "system_settings" add column "created_by_id" int null, add column "last_updated_by_id" int null;`);
    this.addSql(`alter table "system_settings" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);`);
    this.addSql(`alter table "system_settings" alter column "updated_at" drop not null;`);
    this.addSql(`alter table "system_settings" add constraint "system_settings_created_by_id_foreign" foreign key ("created_by_id") references "admin" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "system_settings" add constraint "system_settings_last_updated_by_id_foreign" foreign key ("last_updated_by_id") references "admin" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "task" add column "last_updated_by_id" int null, add column "updated_at" timestamptz null;`);
    this.addSql(`alter table "task" add constraint "task_last_updated_by_id_foreign" foreign key ("last_updated_by_id") references "user" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "task_bid" add column "last_updated_by_id" int null, add column "updated_at" timestamptz null;`);
    this.addSql(`alter table "task_bid" add constraint "task_bid_last_updated_by_id_foreign" foreign key ("last_updated_by_id") references "user" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "system_settings" drop constraint "system_settings_created_by_id_foreign";`);
    this.addSql(`alter table "system_settings" drop constraint "system_settings_last_updated_by_id_foreign";`);
    this.addSql(`alter table "system_settings" drop column "created_by_id", drop column "last_updated_by_id";`);
    this.addSql(`alter table "system_settings" alter column "updated_at" type timestamptz(6) using ("updated_at"::timestamptz(6));`);
    this.addSql(`alter table "system_settings" alter column "updated_at" set not null;`);

    this.addSql(`alter table "task" drop constraint "task_last_updated_by_id_foreign";`);
    this.addSql(`alter table "task" drop column "last_updated_by_id", drop column "updated_at";`);

    this.addSql(`alter table "task_bid" drop constraint "task_bid_last_updated_by_id_foreign";`);
    this.addSql(`alter table "task_bid" drop column "last_updated_by_id", drop column "updated_at";`);
  }

}
