import { Migration } from '@mikro-orm/migrations';

export class Migration20261117120828_revert_kobo_to_naira extends Migration {
  override async up(): Promise<void> {
    // Convert kobo back to naira (divide by 100) and change types
    this.addSql(
      `alter table "task" alter column "reward" type int using (("reward" / 100)::int);`,
    );

    this.addSql(
      `alter table "task_bid" alter column "amount" type int using (("amount" / 100)::int);`,
    );
    this.addSql(
      `alter table "task_bid" alter column "counter_offer" type int using (("counter_offer" / 100)::int);`,
    );

    this.addSql(
      `alter table "task_bid_negotiations" alter column "amount" type decimal(10,2) using (("amount" / 100)::decimal(10,2));`,
    );

    this.addSql(
      `alter table "payments" alter column "bid_amount" type decimal(10,2) using (("bid_amount" / 100)::decimal(10,2));`,
    );
    this.addSql(
      `alter table "payments" alter column "service_charge" type decimal(10,2) using (("service_charge" / 100)::decimal(10,2));`,
    );
    this.addSql(
      `alter table "payments" alter column "total_amount" type decimal(10,2) using (("total_amount" / 100)::decimal(10,2));`,
    );
  }

  override async down(): Promise<void> {
    // Convert naira back to kobo (multiply by 100) and change types
    this.addSql(
      `alter table "task" alter column "reward" type bigint using (("reward" * 100)::bigint);`,
    );

    this.addSql(
      `alter table "task_bid" alter column "amount" type bigint using (("amount" * 100)::bigint);`,
    );
    this.addSql(
      `alter table "task_bid" alter column "counter_offer" type bigint using (("counter_offer" * 100)::bigint);`,
    );

    this.addSql(
      `alter table "task_bid_negotiations" alter column "amount" type bigint using (("amount" * 100)::bigint);`,
    );

    this.addSql(
      `alter table "payments" alter column "bid_amount" type bigint using (("bid_amount" * 100)::bigint);`,
    );
    this.addSql(
      `alter table "payments" alter column "service_charge" type bigint using (("service_charge" * 100)::bigint);`,
    );
    this.addSql(
      `alter table "payments" alter column "total_amount" type bigint using (("total_amount" * 100)::bigint);`,
    );
  }
}
