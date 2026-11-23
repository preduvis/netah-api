import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import {
  SupportTicket,
  TicketStatus,
  TicketPriority,
} from './entities/support-ticket.entity';
import { SupportMessage, SenderType } from './entities/support-message.entity';
import { User } from 'src/users/entities/user.entity';
import { Admin } from 'src/admins/entities/admin.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: EntityRepository<SupportTicket>,
    @InjectRepository(SupportMessage)
    private readonly messageRepo: EntityRepository<SupportMessage>,
    private readonly em: EntityManager,
  ) {}

  async createTicket(
    createTicketDto: CreateTicketDto,
    user: User,
  ): Promise<any> {
    const ticket = this.ticketRepo.create({
      subject: createTicketDto.topic,
      description: createTicketDto.message,
      priority: createTicketDto.priority || TicketPriority.MEDIUM,
      createdBy: user,
      lastUpdatedBy: user,
      status: TicketStatus.OPEN,
    });
    await this.em.persistAndFlush(ticket);

    return {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      createdBy: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profileImage: user.profileImage,
      },
      assignedTo: null,
      lastUpdatedBy: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: user.profileImage,
      },
    };
  }

  async getUserTickets(userId: number): Promise<any[]> {
    const tickets = await this.ticketRepo.find(
      { createdBy: userId },
      {
        populate: ['assignedTo', 'createdBy', 'lastUpdatedBy'],
        orderBy: { createdAt: 'DESC' },
      },
    );

    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      createdBy: {
        id: ticket.createdBy.id,
        firstName: ticket.createdBy.firstName,
        lastName: ticket.createdBy.lastName,
        profileImage: ticket.createdBy.profileImage,
      },
      assignedTo: ticket.assignedTo
        ? {
            id: ticket.assignedTo.id,
            firstName: ticket.assignedTo.firstName,
            lastName: ticket.assignedTo.lastName,
          }
        : null,
    }));
  }

  async getAllTickets(filters?: {
    status?: TicketStatus;
    assignedTo?: number;
  }): Promise<any[]> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.assignedTo) {
      where.assignedTo = filters.assignedTo;
    }

    const tickets = await this.ticketRepo.find(where, {
      populate: ['createdBy', 'assignedTo', 'lastUpdatedBy'],
      orderBy: { createdAt: 'DESC' },
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      createdBy: {
        id: ticket.createdBy.id,
        firstName: ticket.createdBy.firstName,
        lastName: ticket.createdBy.lastName,
        email: ticket.createdBy.email,
        profileImage: ticket.createdBy.profileImage,
      },
      assignedTo: ticket.assignedTo
        ? {
            id: ticket.assignedTo.id,
            firstName: ticket.assignedTo.firstName,
            lastName: ticket.assignedTo.lastName,
          }
        : null,
      lastUpdatedBy: ticket.lastUpdatedBy
        ? {
            id: ticket.lastUpdatedBy.id,
            firstName: ticket.lastUpdatedBy.firstName,
            lastName: ticket.lastUpdatedBy.lastName,
            profileImage: ticket.lastUpdatedBy.profileImage,
          }
        : null,
    }));
  }

  async getTicket(ticketId: number, user?: User): Promise<any> {
    const ticket = await this.ticketRepo.findOne(
      { id: ticketId },
      { populate: ['createdBy', 'assignedTo', 'lastUpdatedBy'] },
    );

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Check if user owns this ticket
    if (user && ticket.createdBy.id !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    // Get messages separately to avoid circular reference
    const messages = await this.messageRepo.find(
      { ticket: ticketId },
      {
        populate: ['user', 'admin'],
        orderBy: { createdAt: 'ASC' },
      },
    );

    // Format response to avoid circular references
    return {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      createdBy: {
        id: ticket.createdBy.id,
        firstName: ticket.createdBy.firstName,
        lastName: ticket.createdBy.lastName,
        email: ticket.createdBy.email,
        profileImage: ticket.createdBy.profileImage,
      },
      assignedTo: ticket.assignedTo
        ? {
            id: ticket.assignedTo.id,
            firstName: ticket.assignedTo.firstName,
            lastName: ticket.assignedTo.lastName,
          }
        : null,
      lastUpdatedBy: ticket.lastUpdatedBy
        ? {
            id: ticket.lastUpdatedBy.id,
            firstName: ticket.lastUpdatedBy.firstName,
            lastName: ticket.lastUpdatedBy.lastName,
            profileImage: ticket.lastUpdatedBy.profileImage,
          }
        : null,
      messages: messages.map((msg) => ({
        id: msg.id,
        message: msg.message,
        senderType: msg.senderType,
        isRead: msg.isRead,
        createdAt: msg.createdAt,
        sender: msg.user
          ? {
              id: msg.user.id,
              firstName: msg.user.firstName,
              lastName: msg.user.lastName,
              profileImage: msg.user.profileImage,
            }
          : msg.admin
            ? {
                id: msg.admin.id,
                firstName: msg.admin.firstName,
                lastName: msg.admin.lastName,
              }
            : null,
      })),
    };
  }

  async assignTicket(ticketId: number, admin: Admin): Promise<any> {
    const ticket = await this.ticketRepo.findOne(
      { id: ticketId },
      { populate: ['createdBy', 'lastUpdatedBy'] },
    );

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    ticket.assignedTo = admin;
    ticket.status = TicketStatus.IN_PROGRESS;
    await this.em.flush();

    await this.em.populate(ticket, ['assignedTo']);

    return {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      createdBy: {
        id: ticket.createdBy.id,
        firstName: ticket.createdBy.firstName,
        lastName: ticket.createdBy.lastName,
        email: ticket.createdBy.email,
        profileImage: ticket.createdBy.profileImage,
      },
      assignedTo: {
        id: ticket.assignedTo.id,
        firstName: ticket.assignedTo.firstName,
        lastName: ticket.assignedTo.lastName,
      },
      lastUpdatedBy: ticket.lastUpdatedBy
        ? {
            id: ticket.lastUpdatedBy.id,
            firstName: ticket.lastUpdatedBy.firstName,
            lastName: ticket.lastUpdatedBy.lastName,
            profileImage: ticket.lastUpdatedBy.profileImage,
          }
        : null,
    };
  }

  async updateTicket(
    ticketId: number,
    updateDto: UpdateTicketDto,
    admin: Admin,
  ): Promise<any> {
    const ticket = await this.ticketRepo.findOne(
      { id: ticketId },
      { populate: ['createdBy', 'assignedTo', 'lastUpdatedBy'] },
    );

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (updateDto.status) {
      ticket.status = updateDto.status;

      if (
        updateDto.status === TicketStatus.CLOSED ||
        updateDto.status === TicketStatus.RESOLVED
      ) {
        ticket.closedAt = new Date();
      }
    }

    if (updateDto.priority) {
      ticket.priority = updateDto.priority;
    }

    await this.em.flush();

    return {
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      createdBy: {
        id: ticket.createdBy.id,
        firstName: ticket.createdBy.firstName,
        lastName: ticket.createdBy.lastName,
        email: ticket.createdBy.email,
        profileImage: ticket.createdBy.profileImage,
      },
      assignedTo: ticket.assignedTo
        ? {
            id: ticket.assignedTo.id,
            firstName: ticket.assignedTo.firstName,
            lastName: ticket.assignedTo.lastName,
          }
        : null,
      lastUpdatedBy: ticket.lastUpdatedBy
        ? {
            id: ticket.lastUpdatedBy.id,
            firstName: ticket.lastUpdatedBy.firstName,
            lastName: ticket.lastUpdatedBy.lastName,
            profileImage: ticket.lastUpdatedBy.profileImage,
          }
        : null,
    };
  }

  async sendMessage(
    ticketId: number,
    messageDto: SendMessageDto,
    sender: User | Admin,
    senderType: SenderType,
  ): Promise<any> {
    const ticket = await this.ticketRepo.findOne(
      { id: ticketId },
      { populate: ['createdBy'] },
    );

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Check if user owns this ticket (for user messages)
    if (
      senderType === SenderType.USER &&
      ticket.createdBy.id !== (sender as User).id
    ) {
      throw new ForbiddenException('Access denied');
    }

    const message = this.messageRepo.create({
      ticket,
      message: messageDto.message,
      senderType,
      user: senderType === SenderType.USER ? (sender as User) : undefined,
      admin: senderType === SenderType.ADMIN ? (sender as Admin) : undefined,
      isRead: false,
    });

    await this.em.persistAndFlush(message);
    await this.em.populate(message, ['user', 'admin']);

    return {
      id: message.id,
      message: message.message,
      senderType: message.senderType,
      isRead: message.isRead,
      createdAt: message.createdAt,
      sender: message.user
        ? {
            id: message.user.id,
            firstName: message.user.firstName,
            lastName: message.user.lastName,
            profileImage: message.user.profileImage,
          }
        : message.admin
          ? {
              id: message.admin.id,
              firstName: message.admin.firstName,
              lastName: message.admin.lastName,
            }
          : null,
    };
  }

  async getMessages(ticketId: number, user?: User): Promise<any[]> {
    const ticket = await this.ticketRepo.findOne(
      { id: ticketId },
      { populate: ['createdBy'] },
    );

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Check if user owns this ticket
    if (user && ticket.createdBy.id !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    const messages = await this.messageRepo.find(
      { ticket: ticketId },
      {
        populate: ['user', 'admin'],
        orderBy: { createdAt: 'ASC' },
      },
    );

    return messages.map((msg) => ({
      id: msg.id,
      message: msg.message,
      senderType: msg.senderType,
      isRead: msg.isRead,
      createdAt: msg.createdAt,
      sender: msg.user
        ? {
            id: msg.user.id,
            firstName: msg.user.firstName,
            lastName: msg.user.lastName,
            profileImage: msg.user.profileImage,
          }
        : msg.admin
          ? {
              id: msg.admin.id,
              firstName: msg.admin.firstName,
              lastName: msg.admin.lastName,
            }
          : null,
    }));
  }

  async markMessagesAsRead(ticketId: number): Promise<void> {
    const messages = await this.messageRepo.find({
      ticket: ticketId,
      isRead: false,
    });

    messages.forEach((msg) => (msg.isRead = true));
    await this.em.flush();
  }
}
