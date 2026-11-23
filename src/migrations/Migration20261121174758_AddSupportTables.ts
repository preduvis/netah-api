import { Migration } from '@mikro-orm/migrations';

export class Migration20261121174758_AddSupportTables extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "support_ticket" ("id" serial primary key, "subject" varchar(255) not null, "description" text not null, "status" text check ("status" in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')) not null default 'OPEN', "priority" text check ("priority" in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')) not null default 'MEDIUM', "created_by_id" int not null, "assigned_to_id" int null, "last_updated_by_id" int null, "created_at" timestamptz not null, "updated_at" timestamptz null, "closed_at" timestamptz null, "deleted_at" timestamptz null);`,
    );

    this.addSql(
      `create table "support_message" ("id" serial primary key, "ticket_id" int not null, "sender_type" text check ("sender_type" in ('USER', 'ADMIN')) not null, "user_id" int null, "admin_id" int null, "message" text not null, "is_read" boolean not null default false, "created_at" timestamptz not null);`,
    );

    this.addSql(
      `alter table "support_ticket" add constraint "support_ticket_created_by_id_foreign" foreign key ("created_by_id") references "user" ("id") on update cascade;`,
    );
    this.addSql(
      `alter table "support_ticket" add constraint "support_ticket_assigned_to_id_foreign" foreign key ("assigned_to_id") references "admin" ("id") on update cascade on delete set null;`,
    );
    this.addSql(
      `alter table "support_ticket" add constraint "support_ticket_last_updated_by_id_foreign" foreign key ("last_updated_by_id") references "user" ("id") on update cascade on delete set null;`,
    );

    this.addSql(
      `alter table "support_message" add constraint "support_message_ticket_id_foreign" foreign key ("ticket_id") references "support_ticket" ("id") on update cascade;`,
    );
    this.addSql(
      `alter table "support_message" add constraint "support_message_user_id_foreign" foreign key ("user_id") references "user" ("id") on update cascade on delete set null;`,
    );
    this.addSql(
      `alter table "support_message" add constraint "support_message_admin_id_foreign" foreign key ("admin_id") references "admin" ("id") on update cascade on delete set null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "support_message" drop constraint "support_message_ticket_id_foreign";`,
    );

    this.addSql(`drop table if exists "support_ticket" cascade;`);

    this.addSql(`drop table if exists "support_message" cascade;`);
  }
}
