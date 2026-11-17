import { Migration } from '@mikro-orm/migrations';

export class Migration20261107210130 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "admin_audit_log" ("id" serial primary key, "admin_id" int not null, "action" varchar(255) not null, "task_id" varchar(255) null, "user_id" varchar(255) null, "note" text null, "ip_address" varchar(255) null, "before_state" jsonb null, "after_state" jsonb null, "metadata" jsonb null, "timestamp" timestamptz not null);`);
    this.addSql(`create index "admin_audit_log_timestamp_index" on "admin_audit_log" ("timestamp");`);

    this.addSql(`create table "task_flag" ("id" serial primary key, "task_id" int not null, "reason" varchar(255) not null, "details" text not null, "severity" text check ("severity" in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')) not null default 'MEDIUM', "status" text check ("status" in ('OPEN', 'RESOLVED', 'DISMISSED')) not null default 'OPEN', "reported_by_role" text check ("reported_by_role" in ('ADMIN', 'SYSTEM', 'USER')) not null, "reported_by_user_id" int null, "reported_by_admin_id" int null, "reported_by_name" varchar(255) not null, "resolution" text null, "resolved_by" varchar(255) null, "created_at" timestamptz not null, "resolved_at" timestamptz null);`);

    this.addSql(`create table "task_activity" ("id" serial primary key, "task_id" int not null, "type" text check ("type" in ('CREATION', 'BID', 'ASSIGNMENT', 'STATUS_CHANGE', 'PAYMENT', 'MESSAGE', 'FLAG', 'ADMIN_ACTION')) not null, "actor_role" text check ("actor_role" in ('POSTER', 'RUNNER', 'ADMIN', 'SYSTEM')) not null, "actor_id" varchar(255) not null, "actor_name" varchar(255) not null, "action" varchar(255) not null, "details" text null, "metadata" jsonb null, "timestamp" timestamptz not null);`);
    this.addSql(`create index "task_activity_timestamp_index" on "task_activity" ("timestamp");`);

    this.addSql(`create table "moderation_note" ("id" serial primary key, "task_id" int not null, "author_id" int not null, "content" text not null, "created_at" timestamptz not null);`);

    this.addSql(`alter table "admin_audit_log" add constraint "admin_audit_log_admin_id_foreign" foreign key ("admin_id") references "admin" ("id") on update cascade;`);

    this.addSql(`alter table "task_flag" add constraint "task_flag_task_id_foreign" foreign key ("task_id") references "task" ("id") on update cascade;`);

    this.addSql(`alter table "task_activity" add constraint "task_activity_task_id_foreign" foreign key ("task_id") references "task" ("id") on update cascade;`);

    this.addSql(`alter table "moderation_note" add constraint "moderation_note_task_id_foreign" foreign key ("task_id") references "task" ("id") on update cascade;`);
    this.addSql(`alter table "moderation_note" add constraint "moderation_note_author_id_foreign" foreign key ("author_id") references "admin" ("id") on update cascade;`);

    this.addSql(`alter table "task" drop constraint if exists "task_status_check";`);

    this.addSql(`alter table "payments" drop constraint if exists "payments_status_check";`);

    this.addSql(`alter table "task" add constraint "task_status_check" check("status" in ('OPEN', 'AWAITING_PAYMENT', 'IN_PROGRESS', 'PENDING_APPROVAL', 'DISPUTED', 'COMPLETED', 'SUSPENDED', 'CANCELLED'));`);

    this.addSql(`alter table "payments" add column "public_id" varchar(255) null, add column "escrowed_at" timestamptz null, add column "released_at" timestamptz null, add column "refunded_at" timestamptz null, add column "admin_note" text null, add column "released_by" varchar(255) null, add column "refunded_by" varchar(255) null;`);
    this.addSql(`alter table "payments" add constraint "payments_status_check" check("status" in ('PENDING', 'COMPLETED', 'ESCROWED', 'RELEASED', 'REFUNDED', 'FAILED'));`);
    this.addSql(`alter table "payments" add constraint "payments_public_id_unique" unique ("public_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "admin_audit_log" cascade;`);

    this.addSql(`drop table if exists "task_flag" cascade;`);

    this.addSql(`drop table if exists "task_activity" cascade;`);

    this.addSql(`drop table if exists "moderation_note" cascade;`);

    this.addSql(`alter table "task" drop constraint if exists "task_status_check";`);

    this.addSql(`alter table "payments" drop constraint if exists "payments_status_check";`);

    this.addSql(`alter table "task" add constraint "task_status_check" check("status" in ('OPEN', 'AWAITING_PAYMENT', 'IN_PROGRESS', 'PENDING_APPROVAL', 'DISPUTED', 'COMPLETED'));`);

    this.addSql(`alter table "payments" drop constraint "payments_public_id_unique";`);
    this.addSql(`alter table "payments" drop column "public_id", drop column "escrowed_at", drop column "released_at", drop column "refunded_at", drop column "admin_note", drop column "released_by", drop column "refunded_by";`);

    this.addSql(`alter table "payments" add constraint "payments_status_check" check("status" in ('PENDING', 'COMPLETED', 'FAILED'));`);
  }

}
