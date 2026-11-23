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
import { Admin } from 'src/admins/entities/admin.entity';

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

  async create(
    createCategoryDto: CreateTaskCategoryDto,
    admin: Admin,
  ): Promise<any> {
    // Check for duplicate name
    const existing = await this.categoryRepo.findOne({
      name: { $ilike: createCategoryDto.name },
    });

    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }

    const category = this.categoryRepo.create({
      ...createCategoryDto,
      createdBy: admin,
      lastUpdatedBy: admin,
    });
    await this.em.persistAndFlush(category);

    // Reload with relations
    await this.em.populate(category, ['createdBy', 'lastUpdatedBy']);
    return this.formatCategory(category);
  }

  private formatCategory(category: TaskCategory): any {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      image: category.image,
      imagePublicId: category.imagePublicId,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      createdBy: category.createdBy
        ? {
            id: category.createdBy.id,
            firstName: category.createdBy.firstName,
            lastName: category.createdBy.lastName,
          }
        : null,
      lastUpdatedBy: category.lastUpdatedBy
        ? {
            id: category.lastUpdatedBy.id,
            firstName: category.lastUpdatedBy.firstName,
            lastName: category.lastUpdatedBy.lastName,
          }
        : null,
    };
  }

  async findAll(): Promise<any[]> {
    const categories = await this.categoryRepo.findAll({
      populate: ['createdBy', 'lastUpdatedBy'],
      orderBy: { name: 'ASC' },
    });

    return categories.map((category) => this.formatCategory(category));
  }

  async findOne(id: number): Promise<any> {
    const category = await this.categoryRepo.findOne(
      { id },
      { populate: ['createdBy', 'lastUpdatedBy'] },
    );
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return this.formatCategory(category);
  }

  private async findOneEntity(id: number): Promise<TaskCategory> {
    const category = await this.categoryRepo.findOne({ id });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async update(
    id: number,
    updateCategoryDto: UpdateTaskCategoryDto,
    admin: Admin,
  ): Promise<any> {
    const category = await this.findOneEntity(id);

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
    category.lastUpdatedBy = admin;
    await this.em.flush();

    // Reload with relations
    await this.em.populate(category, ['createdBy', 'lastUpdatedBy']);
    return this.formatCategory(category);
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOneEntity(id);

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

  async uploadImage(
    id: number,
    file: Express.Multer.File,
    admin: Admin,
  ): Promise<any> {
    const category = await this.findOneEntity(id);

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
    category.lastUpdatedBy = admin;
    await this.em.flush();

    // Reload with relations
    await this.em.populate(category, ['createdBy', 'lastUpdatedBy']);
    return this.formatCategory(category);
  }

  async deleteImage(id: number, admin: Admin): Promise<any> {
    const category = await this.findOneEntity(id);

    if (!category.imagePublicId) {
      throw new BadRequestException('Category does not have an image');
    }

    // Delete from Cloudinary
    await this.cloudinaryService.deleteImage(category.imagePublicId);

    // Update category
    category.image = undefined;
    category.imagePublicId = undefined;
    category.lastUpdatedBy = admin;
    await this.em.flush();

    // Reload with relations
    await this.em.populate(category, ['createdBy', 'lastUpdatedBy']);
    return this.formatCategory(category);
  }
}
