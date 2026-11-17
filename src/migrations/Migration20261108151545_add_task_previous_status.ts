import { Migration } from '@mikro-orm/migrations';

export class Migration20261108151545_add_task_previous_status extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "task" add column "previous_status" text check ("previous_status" in ('OPEN', 'AWAITING_PAYMENT', 'IN_PROGRESS', 'PENDING_APPROVAL', 'DISPUTED', 'COMPLETED', 'SUSPENDED', 'CANCELLED')) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "task" drop column "previous_status";`);
  }

}
