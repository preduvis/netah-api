import { Migration } from '@mikro-orm/migrations';

export class Migration20261120162106_add_category_image_fields extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "task_category" add column "image" varchar(255) null, add column "image_public_id" varchar(255) null, add column "is_active" boolean not null default true, add column "updated_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "task_category" drop column "image", drop column "image_public_id", drop column "is_active", drop column "updated_at";`);
  }

}
