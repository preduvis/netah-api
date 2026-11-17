import { Entity, Enum, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { TaskBid } from './task-bid.entity';
import { User } from 'src/users/entities/user.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED', // Legacy status for completed payments
  ESCROWED = 'ESCROWED',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

@Entity({ tableName: 'payments' })
export class Payment {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => TaskBid, { eager: false })
  taskBid!: TaskBid;

  @ManyToOne(() => User, { eager: false })
  paidBy!: User;

  @Property({ columnType: 'decimal(10,2)' })
  bidAmount!: number;

  @Property({ columnType: 'decimal(10,2)' })
  serviceCharge!: number;

  @Property({ columnType: 'decimal(10,2)' })
  totalAmount!: number;

  @Property()
  paymentReference!: string;

  @Property({ unique: true, nullable: true })
  publicId?: string; // e.g., "PAY-77491"

  @Enum(() => PaymentStatus)
  status: PaymentStatus = PaymentStatus.PENDING;

  @Property({ onCreate: () => new Date() })
  createdAt?: Date;

  @Property({ nullable: true })
  escrowedAt?: Date;

  @Property({ nullable: true })
  releasedAt?: Date;

  @Property({ nullable: true })
  refundedAt?: Date;

  @Property({ nullable: true })
  completedAt?: Date;

  @Property({ nullable: true, type: 'text' })
  adminNote?: string; // Admin note for manual release/refund

  @Property({ nullable: true })
  releasedBy?: string; // Admin name who released payment

  @Property({ nullable: true })
  refundedBy?: string; // Admin name who refunded payment
}
