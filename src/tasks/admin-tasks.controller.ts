import {
  Controller,
  Get,
  Param,
  UseGuards,
  Delete,
  Patch,
  Body,
  Post,
  Query,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ResponseMessage } from 'src/response/response.decorator';
import { AdminJwtAuthGuard } from 'src/auth/guards/admin-jwt-auth.guard';
import { MustChangePasswordGuard } from 'src/auth/guards/must-change-password.guard';
import { Must2FAGuard } from 'src/auth/guards/must-2fa.guard';
import { SuperAdminGuard } from 'src/auth/guards/super-admin.guard';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CurrentAdmin } from 'src/auth/decorators/current-admin.decorator';
import { Admin } from 'src/admins/entities/admin.entity';
import {
  SuspendTaskDto,
  CloseTaskDto,
  ReopenTaskDto,
  FlagTaskDto,
  ClearFlagsDto,
  ReleasePaymentDto,
  RefundPaymentDto,
  AddModerationNoteDto,
} from './dto/admin-task-actions.dto';
import { ActivityType } from './entities/task-activity.entity';
import { TaskStatusEnum } from './dto/create-task.dto';

@UseGuards(AdminJwtAuthGuard, MustChangePasswordGuard, Must2FAGuard)
@Controller('admin/tasks')
export class AdminTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ResponseMessage('All tasks retrieved successfully!')
  @Get()
  findAllTasks(
    @Query('status') status?: TaskStatusEnum,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: number,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('hasFlagsOnly') hasFlagsOnly?: boolean,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('sort') sort?: 'created_asc' | 'created_desc' | 'reward_asc' | 'reward_desc' | 'deadline_asc' | 'deadline_desc',
  ) {
    return this.tasksService.adminFindAllTasks({
      status,
      search,
      categoryId,
      fromDate,
      toDate,
      hasFlagsOnly,
      page,
      pageSize,
      sort,
    });
  }

  @ResponseMessage('Task retrieved successfully!')
  @Get(':id')
  findTaskById(@Param('id') id: string) {
    return this.tasksService.adminGetTaskDetailFull(id);
  }

  @ResponseMessage('Task bids retrieved successfully!')
  @Get(':id/bids')
  getTaskBids(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('sort') sort?: 'created_asc' | 'created_desc' | 'amount_asc' | 'amount_desc',
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.tasksService.adminGetTaskBidsDetailed(id, {
      status,
      sort,
      page,
      pageSize,
    });
  }

  @ResponseMessage('Task activity retrieved successfully!')
  @Get(':id/activity')
  getTaskActivity(
    @Param('id') id: string,
    @Query('type') type?: ActivityType,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.tasksService.adminGetTaskActivity(id, { type, limit, offset });
  }

  @ResponseMessage('Bid negotiation history retrieved successfully!')
  @Get(':id/bids/:bidId/history')
  getBidHistory(@Param('id') id: string, @Param('bidId') bidId: string) {
    return this.tasksService.adminGetBidHistory(id, bidId);
  }

  @ResponseMessage('Task updated successfully!')
  @Patch(':id')
  updateTask(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    return this.tasksService.adminUpdateTask(id, updateTaskDto);
  }

  @ResponseMessage('Task deleted successfully!')
  @UseGuards(SuperAdminGuard)
  @Delete(':id')
  deleteTask(@Param('id') id: string) {
    return this.tasksService.adminDeleteTask(id);
  }

  @ResponseMessage('Task statistics retrieved successfully!')
  @Get('stats/overview')
  getTaskStats() {
    return this.tasksService.adminGetTaskStats();
  }

  // Task action endpoints
  @ResponseMessage('Task suspended successfully!')
  @Post(':id/actions/suspend')
  suspendTask(
    @Param('id') id: string,
    @Body() dto: SuspendTaskDto,
    @CurrentAdmin() admin: Admin,
  ) {
    return this.tasksService.adminSuspendTask(id, dto, admin);
  }

  @ResponseMessage('Task closed successfully!')
  @Post(':id/actions/close')
  closeTask(
    @Param('id') id: string,
    @Body() dto: CloseTaskDto,
    @CurrentAdmin() admin: Admin,
  ) {
    return this.tasksService.adminCloseTask(id, dto, admin);
  }

  @ResponseMessage('Task reopened successfully!')
  @Post(':id/actions/reopen')
  reopenTask(
    @Param('id') id: string,
    @Body() dto: ReopenTaskDto,
    @CurrentAdmin() admin: Admin,
  ) {
    return this.tasksService.adminReopenTask(id, dto, admin);
  }

  @ResponseMessage('Task flagged successfully!')
  @Post(':id/actions/flag')
  flagTask(
    @Param('id') id: string,
    @Body() dto: FlagTaskDto,
    @CurrentAdmin() admin: Admin,
  ) {
    return this.tasksService.adminFlagTask(id, dto, admin);
  }

  @ResponseMessage('Flags cleared successfully!')
  @Post(':id/actions/clear-flags')
  clearFlags(
    @Param('id') id: string,
    @Body() dto: ClearFlagsDto,
    @CurrentAdmin() admin: Admin,
  ) {
    return this.tasksService.adminClearFlags(id, dto, admin);
  }

  // Payment action endpoints
  @ResponseMessage('Payment released successfully!')
  @Post(':id/payments/release')
  releasePayment(
    @Param('id') id: string,
    @Body() dto: ReleasePaymentDto,
    @CurrentAdmin() admin: Admin,
  ) {
    return this.tasksService.adminReleasePayment(id, dto, admin);
  }

  @ResponseMessage('Payment refunded successfully!')
  @Post(':id/payments/refund')
  refundPayment(
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
    @CurrentAdmin() admin: Admin,
  ) {
    return this.tasksService.adminRefundPayment(id, dto, admin);
  }

  // Moderation notes endpoint
  @ResponseMessage('Moderation note added successfully!')
  @Post(':id/moderation-notes')
  addModerationNote(
    @Param('id') id: string,
    @Body() dto: AddModerationNoteDto,
    @CurrentAdmin() admin: Admin,
  ) {
    return this.tasksService.adminAddModerationNote(id, dto, admin);
  }
}
