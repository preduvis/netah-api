import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminUsersController } from './admin-users.controller';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { User } from './entities/user.entity';
import { UserActivity } from './entities/user-activity.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { Payment } from 'src/tasks/entities/payment.entity';

@Module({
  imports: [MikroOrmModule.forFeature([User, UserActivity, Task, Payment])],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
