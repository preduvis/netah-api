import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user-decorator';
import { User } from 'src/users/entities/user.entity';
import { ResponseMessage } from 'src/response/response.decorator';
import { SenderType } from './entities/support-message.entity';

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @ResponseMessage('Support ticket created successfully!')
  @Post('tickets')
  async createTicket(
    @Body() createTicketDto: CreateTicketDto,
    @CurrentUser() user: User,
  ) {
    return this.supportService.createTicket(createTicketDto, user);
  }

  @ResponseMessage('Tickets retrieved successfully!')
  @Get('tickets')
  async getMyTickets(@CurrentUser() user: User) {
    return this.supportService.getUserTickets(user.id);
  }

  @ResponseMessage('Ticket retrieved successfully!')
  @Get('tickets/:id')
  async getTicket(@Param('id') id: string, @CurrentUser() user: User) {
    const ticketId = Number(id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('Invalid ticket ID');
    }
    return this.supportService.getTicket(ticketId, user);
  }

  @ResponseMessage('Messages retrieved successfully!')
  @Get('tickets/:id/messages')
  async getMessages(@Param('id') id: string, @CurrentUser() user: User) {
    const ticketId = Number(id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('Invalid ticket ID');
    }
    return this.supportService.getMessages(ticketId, user);
  }

  @ResponseMessage('Message sent successfully!')
  @Post('tickets/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Param('id') id: string,
    @Body() messageDto: SendMessageDto,
    @CurrentUser() user: User,
  ) {
    const ticketId = Number(id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('Invalid ticket ID');
    }
    return this.supportService.sendMessage(
      ticketId,
      messageDto,
      user,
      SenderType.USER,
    );
  }

  @ResponseMessage('Messages marked as read!')
  @Post('tickets/:id/mark-read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Param('id') id: string) {
    const ticketId = Number(id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('Invalid ticket ID');
    }
    await this.supportService.markMessagesAsRead(ticketId);
    return { success: true };
  }
}
