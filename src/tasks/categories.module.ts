import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { TaskCategory } from './entities/task-category.entity';
import { Task } from './entities/task.entity';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  imports: [MikroOrmModule.forFeature([TaskCategory, Task]), CloudinaryModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
