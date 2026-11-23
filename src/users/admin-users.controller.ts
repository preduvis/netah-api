import {
  Controller,
  Get,
  Param,
  UseGuards,
  Delete,
  Patch,
  Body,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { ResponseMessage } from 'src/response/response.decorator';
import { AdminJwtAuthGuard } from 'src/auth/guards/admin-jwt-auth.guard';
import { MustChangePasswordGuard } from 'src/auth/guards/must-change-password.guard';
import { Must2FAGuard } from 'src/auth/guards/must-2fa.guard';
import { SuperAdminGuard } from 'src/auth/guards/super-admin.guard';
import { UpdateUserDto } from './dto/update-user.dto';

@UseGuards(AdminJwtAuthGuard, MustChangePasswordGuard, Must2FAGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @ResponseMessage('All users retrieved successfully!')
  @Get()
  findAllUsers(
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('sort')
    sort?: 'created_asc' | 'created_desc' | 'name_asc' | 'name_desc',
  ) {
    return this.usersService.adminFindAllUsers({
      search,
      status,
      fromDate,
      toDate,
      page,
      pageSize,
      sort,
    });
  }

  @ResponseMessage('User retrieved successfully!')
  @Get(':uuid')
  findUserById(@Param('uuid') uuid: string) {
    return this.usersService.adminGetUserByUuid(uuid);
  }

  @ResponseMessage('User updated successfully!')
  @Patch(':uuid')
  updateUser(
    @Param('uuid') uuid: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateByUuid(uuid, updateUserDto);
  }

  @ResponseMessage('User deleted successfully!')
  @UseGuards(SuperAdminGuard)
  @Delete(':uuid')
  deleteUser(@Param('uuid') uuid: string) {
    return this.usersService.removeByUuid(uuid);
  }

  @ResponseMessage('User statistics retrieved successfully!')
  @Get('stats/overview')
  getUserStats() {
    return this.usersService.adminGetUserStats();
  }

  @ResponseMessage('User tasks retrieved successfully!')
  @Get(':uuid/tasks')
  getUserTasks(
    @Param('uuid') uuid: string,
    @Query('role') role?: 'poster' | 'runner' | 'all',
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.usersService.adminGetUserTasksByUuid(uuid, {
      role,
      status,
      page,
      pageSize,
    });
  }

  @ResponseMessage('User activity retrieved successfully!')
  @Get(':uuid/activity')
  getUserActivity(
    @Param('uuid') uuid: string,
    @Query('type') type?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.usersService.adminGetUserActivityByUuid(uuid, {
      type: type as any,
      limit,
      offset,
    });
  }

  @ResponseMessage('User payments retrieved successfully!')
  @Get(':uuid/payments')
  getUserPayments(
    @Param('uuid') uuid: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.usersService.adminGetUserPaymentsByUuid(uuid, {
      status,
      page,
      pageSize,
    });
  }
}
