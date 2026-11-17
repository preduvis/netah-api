import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { AdminTasksController } from './admin-tasks.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { TaskCategory } from './entities/task-category.entity';
import { Task } from './entities/task.entity';
import { User } from 'src/users/entities/user.entity';
import { TaskBid } from './entities/task-bid.entity';
import { TaskBidNegotiation } from './entities/task-bid-negotiation.entity';
import { Payment } from './entities/payment.entity';
import { SystemSettings } from './entities/system-settings.entity';
import { TaskFlag } from './entities/task-flag.entity';
import { ModerationNote } from './entities/moderation-note.entity';
import { TaskActivity } from './entities/task-activity.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { PaystackService } from './paystack.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      TaskCategory,
      Task,
      TaskBid,
      TaskBidNegotiation,
      Payment,
      SystemSettings,
      User,
      TaskFlag,
      ModerationNote,
      TaskActivity,
      AdminAuditLog,
    ]),
    NotificationsModule,
    CloudinaryModule,
  ],
  controllers: [TasksController, AdminTasksController, AdminPaymentsController],
  providers: [TasksService, PaystackService],
})
export class TasksModule {}
