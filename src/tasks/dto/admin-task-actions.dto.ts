import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  MinLength,
} from 'class-validator';
import { FlagSeverity } from '../entities/task-flag.entity';

export class SuspendTaskDto {
  @ApiProperty({ example: 'Task flagged for potential fraud', minLength: 10 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Admin note must be at least 10 characters' })
  note!: string;

  @ApiProperty({
    example: 'FRAUD',
    enum: ['FRAUD', 'POLICY_VIOLATION', 'DISPUTE', 'OTHER'],
  })
  @IsEnum(['FRAUD', 'POLICY_VIOLATION', 'DISPUTE', 'OTHER'])
  reason!: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  notifyUsers?: boolean;
}

export class CloseTaskDto {
  @ApiProperty({
    example: 'Closing task due to inactive poster',
    minLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  note!: string;

  @ApiProperty({ example: 'Inactive poster' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  notifyUsers?: boolean;
}

export class ReopenTaskDto {
  @ApiProperty({
    example: 'Reopening task after resolving dispute',
    minLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  note!: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  notifyUsers?: boolean;
}

export class FlagTaskDto {
  @ApiProperty({ example: 'Inappropriate content' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ example: 'Task description contains offensive language' })
  @IsString()
  @IsNotEmpty()
  details!: string;

  @ApiProperty({ enum: FlagSeverity, example: FlagSeverity.MEDIUM })
  @IsEnum(FlagSeverity)
  severity!: FlagSeverity;
}

export class ClearFlagsDto {
  @ApiProperty({ example: 'Issue resolved, content updated', minLength: 10 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  note!: string;

  @ApiProperty({
    enum: ['RESOLVED', 'FALSE_POSITIVE', 'NO_ACTION_NEEDED'],
    example: 'RESOLVED',
  })
  @IsEnum(['RESOLVED', 'FALSE_POSITIVE', 'NO_ACTION_NEEDED'])
  resolution!: string;
}

export class ReleasePaymentDto {
  @ApiProperty({ example: 'Task completed successfully', minLength: 10 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  note!: string;

  @ApiProperty({ required: false, example: 50000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  notifyUsers?: boolean;
}

export class RefundPaymentDto {
  @ApiProperty({ example: 'Runner failed to complete task', minLength: 10 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  note!: string;

  @ApiProperty({
    enum: ['TASK_CANCELLED', 'RUNNER_NO_SHOW', 'DISPUTE_RESOLVED', 'OTHER'],
    example: 'RUNNER_NO_SHOW',
  })
  @IsEnum(['TASK_CANCELLED', 'RUNNER_NO_SHOW', 'DISPUTE_RESOLVED', 'OTHER'])
  reason!: string;

  @ApiProperty({ required: false, example: 50000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  notifyUsers?: boolean;
}

export class AddModerationNoteDto {
  @ApiProperty({ example: 'Monitoring this task for potential issues' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  content!: string;
}
