import { Entity, Enum, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { User } from 'src/users/entities/user.entity';
import { Admin } from 'src/admins/entities/admin.entity';
import { SupportTicket } from './support-ticket.entity';

export enum SenderType {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

@Entity()
export class SupportMessage {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => SupportTicket)
  ticket!: SupportTicket;

  @Enum(() => SenderType)
  senderType!: SenderType;

  @ManyToOne(() => User, { nullable: true })
  user?: User;

  @ManyToOne(() => Admin, { nullable: true })
  admin?: Admin;

  @Property({ type: 'text' })
  message!: string;

  @Property({ default: false })
  isRead: boolean = false;

  @Property({ onCreate: () => new Date() })
  createdAt?: Date;
}
