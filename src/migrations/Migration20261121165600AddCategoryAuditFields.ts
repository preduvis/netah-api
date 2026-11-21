import { Migration } from '@mikro-orm/migrations';

export class Migration20261121165600AddCategoryAuditFields extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "task_category" add column "created_by_id" int null, add column "last_updated_by_id" int null;`);
    this.addSql(`alter table "task_category" add constraint "task_category_created_by_id_foreign" foreign key ("created_by_id") references "admin" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "task_category" add constraint "task_category_last_updated_by_id_foreign" foreign key ("last_updated_by_id") references "admin" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "task_category" drop constraint "task_category_created_by_id_foreign";`);
    this.addSql(`alter table "task_category" drop constraint "task_category_last_updated_by_id_foreign";`);
    this.addSql(`alter table "task_category" drop column "created_by_id", drop column "last_updated_by_id";`);
  }

}
