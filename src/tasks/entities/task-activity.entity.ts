import { Entity, Enum, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { Task } from './task.entity';

export enum ActivityType {
  CREATION = 'CREATION',
  BID = 'BID',
  ASSIGNMENT = 'ASSIGNMENT',
  STATUS_CHANGE = 'STATUS_CHANGE',
  PAYMENT = 'PAYMENT',
  MESSAGE = 'MESSAGE',
  FLAG = 'FLAG',
  ADMIN_ACTION = 'ADMIN_ACTION',
}

export enum ActorRole {
  POSTER = 'POSTER',
  RUNNER = 'RUNNER',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
}

@Entity()
export class TaskActivity {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => Task)
  task!: Task;

  @Enum(() => ActivityType)
  type!: ActivityType;

  @Enum(() => ActorRole)
  actorRole!: ActorRole;

  @Property()
  actorId!: string; // UUID or ID

  @Property()
  actorName!: string;

  @Property()
  action!: string; // Human-readable description

  @Property({ type: 'text', nullable: true })
  details?: string;

  @Property({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Property({ onCreate: () => new Date(), index: true })
  timestamp?: Date;
}
