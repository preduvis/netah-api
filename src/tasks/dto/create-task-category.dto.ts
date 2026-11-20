import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTaskCategoryDto {
  @ApiProperty({
    example: 'Grocery Shopping',
    description: 'Task Category Name',
  })
  @IsString()
  @IsNotEmpty({ message: 'Category name is required' })
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name!: string;

  @ApiProperty({
    example: 'Tasks related to grocery shopping and errands',
    description: 'Brief explanation of the task category',
  })
  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  @MinLength(10, { message: 'Description must be at least 10 characters' })
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description: string;

  @ApiProperty({
    example: true,
    description: 'Whether the category is active',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
