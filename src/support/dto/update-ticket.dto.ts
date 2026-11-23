import { IsEnum, IsOptional } from 'class-validator';
import {
  TicketStatus,
  TicketPriority,
} from '../entities/support-ticket.entity';

export class UpdateTicketDto {
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;
}
