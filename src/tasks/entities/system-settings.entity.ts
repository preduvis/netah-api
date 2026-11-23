import {
  Entity,
  Enum,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core';
import { Admin } from 'src/admins/entities/admin.entity';

export enum ServiceChargeType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

@Entity({ tableName: 'system_settings' })
export class SystemSettings {
  @PrimaryKey()
  id!: number;

  @Property()
  @Unique()
  key!: string;

  @Property()
  value!: string;

  @Property({ nullable: true })
  description?: string;

  @ManyToOne(() => Admin, { nullable: true })
  createdBy?: Admin;

  @ManyToOne(() => Admin, { nullable: true })
  lastUpdatedBy?: Admin;

  @Property({ onCreate: () => new Date() })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;
}
