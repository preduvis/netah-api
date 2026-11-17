import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { Task } from './task.entity';
import { Admin } from 'src/admins/entities/admin.entity';

@Entity()
export class ModerationNote {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => Task)
  task!: Task;

  @ManyToOne(() => Admin)
  author!: Admin;

  @Property({ type: 'text' })
  content!: string;

  @Property({ onCreate: () => new Date() })
  createdAt?: Date;
}
