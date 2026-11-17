import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { User } from './user.entity';

export enum UserActivityType {
  // Authentication
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  PHONE_VERIFIED = 'PHONE_VERIFIED',

  // Profile
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  PROFILE_IMAGE_CHANGED = 'PROFILE_IMAGE_CHANGED',

  // Tasks
  TASK_CREATED = 'TASK_CREATED',
  TASK_UPDATED = 'TASK_UPDATED',
  BID_PLACED = 'BID_PLACED',
  BID_ACCEPTED = 'BID_ACCEPTED',
  BID_REJECTED = 'BID_REJECTED',
  BID_WITHDRAWN = 'BID_WITHDRAWN',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_APPROVED = 'TASK_APPROVED',
  TASK_DISPUTED = 'TASK_DISPUTED',

  // Payments
  PAYMENT_MADE = 'PAYMENT_MADE',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',

  // Account
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',
  ACCOUNT_REACTIVATED = 'ACCOUNT_REACTIVATED',
}

@Entity()
export class UserActivity {
  @PrimaryKey()
  id: number;

  @ManyToOne(() => User)
  user!: User;

  @Property()
  type!: UserActivityType;

  @Property()
  action!: string;

  @Property({ type: 'text', nullable: true })
  details?: string;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Property({ nullable: true })
  ipAddress?: string;

  @Property({ nullable: true })
  userAgent?: string;

  @Property({ onCreate: () => new Date() })
  timestamp?: Date;
}
