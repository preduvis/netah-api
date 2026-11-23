import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import { Admin } from './entities/admin.entity';
import { AdminAuditLog } from 'src/tasks/entities/admin-audit-log.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { User } from 'src/users/entities/user.entity';
import { CreateAdminDto } from './dto/create-admin.dto';

@Injectable()
export class AdminsService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: EntityRepository<Admin>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogRepo: EntityRepository<AdminAuditLog>,
    @InjectRepository(Task)
    private readonly taskRepo: EntityRepository<Task>,
    @InjectRepository(User)
    private readonly userRepo: EntityRepository<User>,
    private readonly em: EntityManager,
  ) {}

  async create(
    createAdminDto: CreateAdminDto | Partial<Admin>,
  ): Promise<Admin> {
    const admin = this.em.create(Admin, createAdminDto as any);
    await this.em.persistAndFlush(admin);
    return admin;
  }

  async createWithoutFlush(
    createAdminDto: CreateAdminDto | Partial<Admin>,
  ): Promise<Admin> {
    const admin = this.em.create(Admin, createAdminDto as any);
    await this.em.persist(admin);
    return admin;
  }

  async findOne(id: number): Promise<Admin> {
    const admin = await this.adminRepository.findOne({ id });
    if (!admin) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }
    return admin;
  }

  async findOneByEmail(email: string): Promise<Admin | null> {
    return this.adminRepository.findOne({ email: { $ilike: email } });
  }

  async findOneByEmailWithPassword(email: string): Promise<Admin | null> {
    return this.adminRepository.findOne(
      { email: { $ilike: email } },
      { populate: ['password'] },
    );
  }

  async findOneByPhoneNumber(phoneNumber: string): Promise<Admin | null> {
    return this.adminRepository.findOne({ phoneNumber });
  }

  async update(id: number, updateData: Partial<Admin>): Promise<Admin> {
    const admin = await this.findOne(id);

    // If password is being updated, hash it
    if (updateData.password) {
      admin.password = updateData.password;
    }

    Object.assign(admin, updateData);
    await this.em.flush();
    return admin;
  }

  async findAll(): Promise<Admin[]> {
    return this.adminRepository.findAll();
  }

  async getMe(admin: Admin): Promise<Admin> {
    return this.findOne(admin.id);
  }

  async remove(id: number): Promise<void> {
    const admin = await this.findOne(id);
    await this.em.removeAndFlush(admin);
  }

  async getAuditLogs(options?: {
    adminId?: number;
    action?: string;
    taskId?: string;
    userId?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(options?.page || 1, 1);
    const pageSize = Math.min(options?.pageSize || 50, 100);
    const offset = (page - 1) * pageSize;

    // Build filter
    const filter: any = {};

    if (options?.adminId) {
      filter.admin = options.adminId;
    }

    if (options?.action) {
      filter.action = options.action;
    }

    if (options?.taskId) {
      filter.taskId = options.taskId;
    }

    if (options?.userId) {
      filter.userId = options.userId;
    }

    if (options?.fromDate || options?.toDate) {
      filter.timestamp = {};
      if (options.fromDate) {
        filter.timestamp.$gte = new Date(options.fromDate);
      }
      if (options.toDate) {
        const toDate = new Date(options.toDate);
        toDate.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = toDate;
      }
    }

    const [logs, total] = await this.auditLogRepo.findAndCount(filter, {
      populate: ['admin'],
      orderBy: { timestamp: 'DESC' },
      limit: pageSize,
      offset,
    });

    // Collect unique taskIds and userIds
    const taskIds = [
      ...new Set(logs.map((log) => log.taskId).filter(Boolean)),
    ] as string[];
    const userIds = [
      ...new Set(logs.map((log) => log.userId).filter(Boolean)),
    ] as string[];

    // Fetch all related tasks and users in bulk
    const tasks =
      taskIds.length > 0
        ? await this.taskRepo.find({ publicId: { $in: taskIds } })
        : [];

    const users =
      userIds.length > 0
        ? await this.userRepo.find({ uuid: { $in: userIds } })
        : [];

    // Create lookup maps for quick access
    const taskMap = new Map(tasks.map((task) => [task.publicId, task]));
    const userMap = new Map(users.map((user) => [user.uuid, user]));

    return {
      logs: logs.map((log) => {
        const task = log.taskId ? taskMap.get(log.taskId) : null;
        const user = log.userId ? userMap.get(log.userId) : null;

        return {
          id: log.id,
          admin: {
            id: log.admin.id,
            name: `${log.admin.firstName} ${log.admin.lastName}`,
            email: log.admin.email,
          },
          action: log.action,
          task: task ? { id: task.publicId, title: task.title } : null,
          user: user
            ? { id: user.uuid, name: `${user.firstName} ${user.lastName}` }
            : null,
          note: log.note,
          ipAddress: log.ipAddress,
          beforeState: log.beforeState,
          afterState: log.afterState,
          metadata: log.metadata,
          timestamp: log.timestamp,
        };
      }),
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: offset + logs.length < total,
      },
    };
  }
}
