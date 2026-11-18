import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AdminsService } from './admins.service';
import { AdminsController } from './admins.controller';
import { Admin } from './entities/admin.entity';
import { AdminAuditLog } from 'src/tasks/entities/admin-audit-log.entity';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [MikroOrmModule.forFeature([Admin, AdminAuditLog]), EmailModule],
  controllers: [AdminsController],
  providers: [AdminsService],
  exports: [AdminsService],
})
export class AdminsModule {}
