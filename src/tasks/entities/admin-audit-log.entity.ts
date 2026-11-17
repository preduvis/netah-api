import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { Admin } from 'src/admins/entities/admin.entity';

@Entity()
export class AdminAuditLog {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => Admin)
  admin!: Admin;

  @Property()
  action!: string; // e.g., "TASK_SUSPENDED", "PAYMENT_RELEASED"

  @Property({ nullable: true })
  taskId?: string; // Task public ID

  @Property({ nullable: true })
  userId?: string; // Affected user UUID

  @Property({ type: 'text', nullable: true })
  note?: string; // Admin's note/reason

  @Property({ nullable: true })
  ipAddress?: string;

  @Property({ type: 'json', nullable: true })
  beforeState?: Record<string, any>;

  @Property({ type: 'json', nullable: true })
  afterState?: Record<string, any>;

  @Property({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Property({ onCreate: () => new Date(), index: true })
  timestamp?: Date;
}
