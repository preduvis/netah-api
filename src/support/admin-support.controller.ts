import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { SupportService } from './support.service';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AdminJwtAuthGuard } from 'src/auth/guards/admin-jwt-auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user-decorator';
import { Admin } from 'src/admins/entities/admin.entity';
import { ResponseMessage } from 'src/response/response.decorator';
import { SenderType } from './entities/support-message.entity';
import { TicketStatus } from './entities/support-ticket.entity';

@Controller('admin/support')
@UseGuards(AdminJwtAuthGuard)
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @ResponseMessage('Tickets retrieved successfully!')
  @Get('tickets')
  async getAllTickets(
    @Query('status') status?: TicketStatus,
    @Query('assignedTo') assignedTo?: string,
  ) {
    const filters: any = {};

    if (status) {
      filters.status = status;
    }

    if (assignedTo) {
      filters.assignedTo = +assignedTo;
    }

    return this.supportService.getAllTickets(filters);
  }

  @ResponseMessage('Ticket retrieved successfully!')
  @Get('tickets/:id')
  async getTicket(@Param('id') id: string) {
    const ticketId = Number(id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('Invalid ticket ID');
    }
    return this.supportService.getTicket(ticketId);
  }

  @ResponseMessage('Messages retrieved successfully!')
  @Get('tickets/:id/messages')
  async getMessages(@Param('id') id: string) {
    const ticketId = Number(id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('Invalid ticket ID');
    }
    return this.supportService.getMessages(ticketId);
  }

  @ResponseMessage('Ticket assigned successfully!')
  @Post('tickets/:id/assign')
  @HttpCode(HttpStatus.OK)
  async assignTicket(@Param('id') id: string, @CurrentUser() admin: Admin) {
    const ticketId = Number(id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('Invalid ticket ID');
    }
    return this.supportService.assignTicket(ticketId, admin);
  }

  @ResponseMessage('Ticket updated successfully!')
  @Patch('tickets/:id')
  async updateTicket(
    @Param('id') id: string,
    @Body() updateDto: UpdateTicketDto,
    @CurrentUser() admin: Admin,
  ) {
    const ticketId = Number(id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('Invalid ticket ID');
    }
    return this.supportService.updateTicket(ticketId, updateDto, admin);
  }

  @ResponseMessage('Message sent successfully!')
  @Post('tickets/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Param('id') id: string,
    @Body() messageDto: SendMessageDto,
    @CurrentUser() admin: Admin,
  ) {
    const ticketId = Number(id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('Invalid ticket ID');
    }
    return this.supportService.sendMessage(
      ticketId,
      messageDto,
      admin,
      SenderType.ADMIN,
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
