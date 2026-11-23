import { Migration } from '@mikro-orm/migrations';

export class Migration20261108154459_add_user_activity extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "user_activity" ("id" serial primary key, "user_id" int not null, "type" varchar(255) not null, "action" varchar(255) not null, "details" text null, "metadata" jsonb null, "ip_address" varchar(255) null, "user_agent" varchar(255) null, "timestamp" timestamptz not null);`,
    );

    this.addSql(
      `alter table "user_activity" add constraint "user_activity_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "user_activity" cascade;`);
  }
}
