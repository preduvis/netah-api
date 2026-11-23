import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupportService } from './support.service';
import { UsersService } from 'src/users/users.service';
import { AdminsService } from 'src/admins/admins.service';
import { SenderType } from './entities/support-message.entity';
import { User } from 'src/users/entities/user.entity';
import { Admin } from 'src/admins/entities/admin.entity';
import { EntityManager, RequestContext } from '@mikro-orm/postgresql';

interface AuthenticatedSocket extends Socket {
  user?: User;
  admin?: Admin;
  userType?: 'user' | 'admin';
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/support',
})
export class SupportGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly supportService: SupportService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly adminsService: AdminsService,
    private readonly em: EntityManager,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    const em = this.em.fork();
    try {
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(' ')[1];

      console.log(`[WS] Connection attempt: ${client.id}`);
      console.log(`[WS] Token present:`, !!token);

      if (!token) {
        console.error('[WS] No token provided, disconnecting:', client.id);
        throw new UnauthorizedException('No token provided');
      }

      // Try to verify as user token first
      let payload: any;
      let isAdmin = false;

      try {
        console.log(`[WS] Attempting to verify as user token...`);
        payload = this.jwtService.verify(token);
        console.log(`[WS] User token verified, payload.sub:`, payload.sub);
      } catch (error) {
        // If user token fails, try admin token with admin secret
        console.log(`[WS] User token failed, trying admin token...`);
        try {
          payload = this.jwtService.verify(token, {
            secret: process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET,
          });
          isAdmin = true;
          console.log(`[WS] Admin token verified, payload.sub:`, payload.sub);
        } catch (adminError) {
          console.error('[WS] Both token verifications failed');
          throw new UnauthorizedException('Invalid token');
        }
      }

      // Authenticate and attach user/admin to socket
      if (isAdmin) {
        const adminId = Number(payload.sub);
        console.log(`[WS] Admin ID parsed:`, adminId);
        if (!Number.isInteger(adminId) || adminId <= 0) {
          console.error('[WS] Invalid admin ID:', adminId);
          throw new UnauthorizedException('Invalid admin token');
        }
        console.log(`[WS] Looking up admin with ID:`, adminId);
        const admin = await em.findOne(Admin, adminId);
        if (!admin) {
          console.error('[WS] Admin not found in database:', adminId);
          throw new UnauthorizedException('Admin not found');
        }
        console.log(`[WS] Admin found:`, admin.id, admin.email);
        client.admin = admin;
        client.userType = 'admin';
      } else {
        const userId = Number(payload.sub);
        console.log(`[WS] User ID parsed:`, userId);
        if (!Number.isInteger(userId) || userId <= 0) {
          console.error('[WS] Invalid user ID:', userId);
          throw new UnauthorizedException('Invalid user token');
        }
        console.log(`[WS] Looking up user with ID:`, userId);
        const user = await em.findOne(User, userId);
        if (!user) {
          console.error('[WS] User not found in database:', userId);
          throw new UnauthorizedException('User not found');
        }
        console.log(`[WS] User found:`, user.id, user.email);
        client.user = user;
        client.userType = 'user';
      }

      console.log(
        `[WS] ✅ ${client.userType} successfully authenticated and connected: ${client.id}`,
      );
    } catch (error) {
      console.error('[WS] ❌ Connection authentication failed:', error.message);
      console.error('[WS] Error stack:', error.stack);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    console.log(
      `[WS] 🔌 ${client.userType || 'Unknown'} disconnected: ${client.id}`,
    );
    if (client.user) {
      console.log(`[WS] Disconnected user:`, client.user.id, client.user.email);
    }
    if (client.admin) {
      console.log(
        `[WS] Disconnected admin:`,
        client.admin.id,
        client.admin.email,
      );
    }
  }

  @SubscribeMessage('joinTicket')
  async handleJoinTicket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { ticketId: number },
  ) {
    return RequestContext.create(this.em, async () => {
      try {
        const { ticketId } = data;

        // Verify access to ticket
        let ticket;
        if (client.userType === 'user') {
          ticket = await this.supportService.getTicket(ticketId, client.user);
        } else {
          // Admin can access any ticket
          ticket = await this.supportService.getTicket(ticketId);
        }

        // Join the ticket room
        const roomName = `ticket_${ticketId}`;
        await client.join(roomName);

        console.log(
          `[WS] ${client.userType} ${client.id} joined room ${roomName}`,
        );

        // Mark messages as read
        await this.supportService.markMessagesAsRead(ticketId);

        // Emit success
        client.emit('joinedTicket', {
          ticketId,
          ticket,
        });
      } catch (error) {
        client.emit('error', {
          message: error.message,
        });
      }
    });
  }

  @SubscribeMessage('leaveTicket')
  async handleLeaveTicket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { ticketId: number },
  ) {
    return RequestContext.create(this.em, async () => {
      try {
        const { ticketId } = data;
        const roomName = `ticket_${ticketId}`;
        await client.leave(roomName);

        console.log(
          `[WS] ${client.userType} ${client.id} left room ${roomName}`,
        );

        client.emit('leftTicket', { ticketId });
      } catch (error) {
        console.error('[WS] Error in leaveTicket:', error.message);
        client.emit('error', {
          message: error.message,
        });
      }
    });
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { ticketId: number; message: string },
  ) {
    return RequestContext.create(this.em, async () => {
      try {
        const { ticketId, message } = data;
        console.log(
          `[WS] Received sendMessage from ${client.userType} ${client.id} for ticket ${ticketId}`,
        );

        if (!message || message.trim().length === 0) {
          throw new Error('Message cannot be empty');
        }

        // Send message based on user type
        let savedMessage;
        if (client.userType === 'user') {
          if (!client.user) {
            throw new Error('User not authenticated');
          }
          savedMessage = await this.supportService.sendMessage(
            ticketId,
            { message },
            client.user,
            SenderType.USER,
          );
        } else {
          if (!client.admin) {
            throw new Error('Admin not authenticated');
          }
          savedMessage = await this.supportService.sendMessage(
            ticketId,
            { message },
            client.admin,
            SenderType.ADMIN,
          );
        }

        // Broadcast message to all users in the ticket room
        const roomName = `ticket_${ticketId}`;

        const messageData = {
          id: savedMessage.id,
          ticketId,
          message: savedMessage.message,
          senderType: savedMessage.senderType,
          sender: savedMessage.sender,
          createdAt: savedMessage.createdAt,
          isRead: savedMessage.isRead,
        };

        this.server.to(roomName).emit('newMessage', messageData);
        console.log(
          `[WS] Broadcasting to room ${roomName}:`,
          JSON.stringify(messageData),
        );
      } catch (error) {
        client.emit('error', {
          message: error.message,
        });
      }
    });
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { ticketId: number; isTyping: boolean },
  ) {
    return RequestContext.create(this.em, async () => {
      try {
        const { ticketId, isTyping } = data;
        const roomName = `ticket_${ticketId}`;

        // Broadcast typing status to others in the room
        client.to(roomName).emit('userTyping', {
          ticketId,
          isTyping,
          userType: client.userType,
          userId: client.user?.id || client.admin?.id,
        });
      } catch (error) {
        console.error('[WS] Error in typing handler:', error.message);
        client.emit('error', {
          message: error.message,
        });
      }
    });
  }
}
