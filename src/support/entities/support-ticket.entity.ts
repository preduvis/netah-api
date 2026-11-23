import {
  Entity,
  Enum,
  Filter,
  ManyToOne,
  OneToMany,
  Collection,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { User } from 'src/users/entities/user.entity';
import { Admin } from 'src/admins/entities/admin.entity';
import { SupportMessage } from './support-message.entity';

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

@Entity()
@Filter({
  name: 'softDelete',
  cond: { deletedAt: null },
  default: true,
})
export class SupportTicket {
  @PrimaryKey()
  id!: number;

  @Property()
  subject!: string;

  @Property({ type: 'text' })
  description!: string;

  @Enum(() => TicketStatus)
  status: TicketStatus = TicketStatus.OPEN;

  @Enum(() => TicketPriority)
  priority: TicketPriority = TicketPriority.MEDIUM;

  @ManyToOne(() => User)
  createdBy!: User;

  @ManyToOne(() => Admin, { nullable: true })
  assignedTo?: Admin;

  @ManyToOne(() => User, { nullable: true })
  lastUpdatedBy?: User;

  @OneToMany(() => SupportMessage, (message) => message.ticket)
  messages = new Collection<SupportMessage>(this);

  @Property({ onCreate: () => new Date() })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;

  @Property({ nullable: true })
  closedAt?: Date;

  @Property({ nullable: true })
  deletedAt?: Date;
}
