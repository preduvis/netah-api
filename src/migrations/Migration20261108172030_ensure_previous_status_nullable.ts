import { Migration } from '@mikro-orm/migrations';

export class Migration20261108172030_ensure_previous_status_nullable extends Migration {
  override async up(): Promise<void> {
    // Drop old check constraint if exists
    this.addSql(
      `alter table "task" drop constraint if exists "task_previous_status_check";`,
    );

    // Ensure column is nullable
    this.addSql(
      `alter table "task" alter column "previous_status" drop not null;`,
    );
  }

  override async down(): Promise<void> {
    // Recreate check constraint
    this.addSql(
      `alter table "task" add constraint "task_previous_status_check" check ("previous_status" in ('OPEN', 'AWAITING_PAYMENT', 'IN_PROGRESS', 'PENDING_APPROVAL', 'DISPUTED', 'COMPLETED', 'SUSPENDED', 'CANCELLED'));`,
    );
  }
}
