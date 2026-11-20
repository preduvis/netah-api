import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import { TaskCategory } from './entities/task-category.entity';
import { Task } from './entities/task.entity';
import { CreateTaskCategoryDto } from './dto/create-task-category.dto';
import { UpdateTaskCategoryDto } from './dto/update-task-category.dto';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(TaskCategory)
    private readonly categoryRepo: EntityRepository<TaskCategory>,
    @InjectRepository(Task)
    private readonly taskRepo: EntityRepository<Task>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly em: EntityManager,
  ) {}

  async create(createCategoryDto: CreateTaskCategoryDto): Promise<TaskCategory> {
    // Check for duplicate name
    const existing = await this.categoryRepo.findOne({
      name: { $ilike: createCategoryDto.name },
    });

    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }

    const category = this.categoryRepo.create(createCategoryDto);
    await this.em.persistAndFlush(category);
    return category;
  }

  async findAll(): Promise<TaskCategory[]> {
    return this.categoryRepo.findAll({ orderBy: { name: 'ASC' } });
  }

  async findOne(id: number): Promise<TaskCategory> {
    const category = await this.categoryRepo.findOne({ id });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async update(id: number, updateCategoryDto: UpdateTaskCategoryDto): Promise<TaskCategory> {
    const category = await this.findOne(id);

    // Check for duplicate name if name is being updated
    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const existing = await this.categoryRepo.findOne({
        name: { $ilike: updateCategoryDto.name },
      });

      if (existing) {
        throw new ConflictException('Category with this name already exists');
      }
    }

    Object.assign(category, updateCategoryDto);
    await this.em.flush();
    return category;
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id);

    // Check if category has active tasks
    const taskCount = await this.taskRepo.count({ category: id });

    if (taskCount > 0) {
      throw new BadRequestException(
        `Cannot delete category. ${taskCount} task(s) are using this category. Please reassign or delete those tasks first.`,
      );
    }

    // Delete image if exists
    if (category.imagePublicId) {
      await this.cloudinaryService.deleteImage(category.imagePublicId);
    }

    // Soft delete
    category.deletedAt = new Date();
    category.isActive = false;
    await this.em.flush();
  }

  async uploadImage(id: number, file: Express.Multer.File): Promise<TaskCategory> {
    const category = await this.findOne(id);

    // Delete old image if exists
    if (category.imagePublicId) {
      await this.cloudinaryService.deleteImage(category.imagePublicId);
    }

    // Upload new image
    const { url, publicId } = await this.cloudinaryService.uploadImage(
      file,
      'netah/categories',
    );

    category.image = url;
    category.imagePublicId = publicId;
    await this.em.flush();

    return category;
  }

  async deleteImage(id: number): Promise<TaskCategory> {
    const category = await this.findOne(id);

    if (!category.imagePublicId) {
      throw new BadRequestException('Category does not have an image');
    }

    // Delete from Cloudinary
    await this.cloudinaryService.deleteImage(category.imagePublicId);

    // Update category
    category.image = undefined;
    category.imagePublicId = undefined;
    await this.em.flush();

    return category;
  }
}
