import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { TicketPriority } from '../entities/support-ticket.entity';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  topic: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority = TicketPriority.MEDIUM;
}
