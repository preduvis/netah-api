import {
  Entity,
  Enum,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { Task } from './task.entity';
import { User } from 'src/users/entities/user.entity';
import { Admin } from 'src/admins/entities/admin.entity';

export enum FlagStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

export enum FlagSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum FlagReporterRole {
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
  USER = 'USER',
}

@Entity()
export class TaskFlag {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => Task)
  task!: Task;

  @Property()
  reason!: string;

  @Property({ type: 'text' })
  details!: string;

  @Enum(() => FlagSeverity)
  severity: FlagSeverity = FlagSeverity.MEDIUM;

  @Enum(() => FlagStatus)
  status: FlagStatus = FlagStatus.OPEN;

  @Enum(() => FlagReporterRole)
  reportedByRole!: FlagReporterRole;

  // Can be User or Admin
  @Property({ nullable: true })
  reportedByUserId?: number;

  @Property({ nullable: true })
  reportedByAdminId?: number;

  @Property()
  reportedByName!: string;

  @Property({ nullable: true, type: 'text' })
  resolution?: string;

  @Property({ nullable: true })
  resolvedBy?: string; // Admin name who resolved

  @Property({ onCreate: () => new Date() })
  createdAt?: Date;

  @Property({ nullable: true })
  resolvedAt?: Date;
}
