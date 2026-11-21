import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@mikro-orm/nestjs';
import { User } from './entities/user.entity';
import { UserActivity, UserActivityType } from './entities/user-activity.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { Payment } from 'src/tasks/entities/payment.entity';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: EntityRepository<User>,
    @InjectRepository(UserActivity)
    private readonly userActivityRepo: EntityRepository<UserActivity>,
    @InjectRepository(Task)
    private readonly taskRepo: EntityRepository<Task>,
    @InjectRepository(Payment)
    private readonly paymentRepo: EntityRepository<Payment>,
    private readonly em: EntityManager,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.userRepo.findOne({
      email: createUserDto.email,
    });

    if (existingUser) {
      throw new ConflictException('user already exists');
    }
    const user = this.userRepo.create(createUserDto);
    await this.em.persistAndFlush(user);
    return user;
  }

  async findAll(): Promise<User[]> {
    return await this.userRepo.findAll();
  }

  async findOne(id: number): Promise<User | null> {
    const user = await this.userRepo.findOne({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findOneByUuid(uuid: string): Promise<User | null> {
    const user = await this.userRepo.findOne({ uuid });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async adminGetUserByUuid(uuid: string) {
    const user = await this.userRepo.findOne({ uuid });
    if (!user) throw new NotFoundException('User not found');

    // Get tasks posted count
    const tasksPosted = await this.taskRepo.count({
      postedBy: user,
    });

    // Get completed tasks count
    const completedTasks = await this.taskRepo.count({
      assignedTo: user,
      status: 'COMPLETED' as any,
    });

    // Get total tasks taken (assigned)
    const tasksTaken = await this.taskRepo.count({
      assignedTo: user,
    });

    // Calculate total spent (as poster)
    const paymentsAsPoster = await this.paymentRepo.find(
      { paidBy: user },
      { populate: ['taskBid', 'taskBid.task'] }
    );
    const totalSpent = paymentsAsPoster
      .filter(p => p.status !== 'REFUNDED' && p.status !== 'FAILED')
      .reduce((sum, p) => sum + Number(p.totalAmount), 0);

    // Calculate total earned (as runner - released payments)
    const paymentsAsRunner = await this.paymentRepo.find(
      {
        taskBid: { task: { assignedTo: user } },
        status: { $in: ['RELEASED', 'COMPLETED'] as any },
      },
      { populate: ['taskBid', 'taskBid.task'] }
    );
    const totalEarned = paymentsAsRunner.reduce((sum, p) => sum + Number(p.bidAmount), 0);

    // Get reviews and calculate rating
    const runnerReviews = await this.taskRepo.find({
      assignedTo: user,
      status: 'COMPLETED' as any,
      rating: { $ne: null },
    });

    const posterReviews = await this.taskRepo.find({
      postedBy: user,
      status: 'COMPLETED' as any,
      posterRating: { $ne: null },
    });

    const allRatings = [
      ...runnerReviews.map((t) => t.rating!),
      ...posterReviews.map((t) => t.posterRating!),
    ];

    const avgRating =
      allRatings.length > 0
        ? parseFloat((allRatings.reduce((sum, r) => sum + r, 0) / allRatings.length).toFixed(1))
        : 0;

    // Calculate completion rate (completed / assigned)
    const completionRate =
      tasksTaken > 0
        ? parseFloat(((completedTasks / tasksTaken) * 100).toFixed(1))
        : 0;

    // Calculate on-time rate (tasks not disputed / completed)
    let onTimeRate = 0;
    if (completedTasks > 0) {
      const tasksNotDisputed = await this.taskRepo.count({
        assignedTo: user,
        status: 'COMPLETED' as any,
        disputeReason: null,
      });
      onTimeRate = parseFloat(((tasksNotDisputed / completedTasks) * 100).toFixed(1));
    }

    return {
      id: user.id,
      uuid: user.uuid,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      address: user.address,
      city: user.city,
      bio: user.bio,
      skills: user.skills || [],
      profileImage: user.profileImage,
      registeredAs: user.registeredAs,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      isActive: !user.deletedAt,
      stats: {
        totalSpent,
        totalEarned,
        tasksPosted,
        tasksTaken,
        completedTasks,
        completionRate,
        rating: avgRating,
        totalReviews: allRatings.length,
        onTimeRate,
      },
    };
  }

  async findOneByEmailWithPassword(email: string): Promise<User | null> {
    const user = await this.userRepo.findOne({ email: { $ilike: email } });
    // if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async findOneByPhoneNumber(phoneNumber: string): Promise<User | null> {
    const user = await this.userRepo.findOne({ phoneNumber });
    // if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.userRepo.findOne({ id });
    if (!user) throw new NotFoundException('User not found');
    this.userRepo.assign(user, updateUserDto);
    await this.em.flush();
    return user;
  }

  async updateByUuid(uuid: string, updateUserDto: UpdateUserDto) {
    const user = await this.userRepo.findOne({ uuid });
    if (!user) throw new NotFoundException('User not found');
    this.userRepo.assign(user, updateUserDto);
    await this.em.flush();
    return user;
  }

  async remove(id: number) {
    const user = await this.userRepo.findOneOrFail({ id });
    if (!user) throw new NotFoundException('User not found');
    user.deletedAt = new Date();
    await this.em.flush();
  }

  async removeByUuid(uuid: string) {
    const user = await this.userRepo.findOne({ uuid });
    if (!user) throw new NotFoundException('User not found');
    user.deletedAt = new Date();
    await this.em.flush();
  }

  // Admin methods
  async adminFindAllUsers(options?: {
    search?: string;
    status?: 'active' | 'inactive';
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
    sort?: 'created_asc' | 'created_desc' | 'name_asc' | 'name_desc';
  }) {
    const page = options?.page || 1;
    const pageSize = Math.min(options?.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    // Build filter
    const filter: any = {};

    if (options?.search) {
      filter.$or = [
        { firstName: { $ilike: `%${options.search}%` } },
        { lastName: { $ilike: `%${options.search}%` } },
        { email: { $ilike: `%${options.search}%` } },
        { phoneNumber: { $ilike: `%${options.search}%` } },
        { uuid: { $ilike: `%${options.search}%` } },
      ];
    }

    if (options?.status) {
      if (options.status === 'active') {
        filter.deletedAt = null;
      } else if (options.status === 'inactive') {
        filter.deletedAt = { $ne: null };
      }
    }

    if (options?.fromDate) {
      filter.createdAt = { $gte: new Date(options.fromDate) };
    }

    if (options?.toDate) {
      if (!filter.createdAt) filter.createdAt = {};
      filter.createdAt.$lte = new Date(options.toDate);
    }

    // Build orderBy
    let orderBy: any = { createdAt: 'DESC' };
    if (options?.sort === 'created_asc') orderBy = { createdAt: 'ASC' };
    else if (options?.sort === 'created_desc') orderBy = { createdAt: 'DESC' };
    else if (options?.sort === 'name_asc') orderBy = { firstName: 'ASC', lastName: 'ASC' };
    else if (options?.sort === 'name_desc') orderBy = { firstName: 'DESC', lastName: 'DESC' };

    // Get users with pagination
    const [users, total] = await this.userRepo.findAndCount(filter, {
      orderBy,
      limit: pageSize,
      offset,
      filters: false, // Disable soft delete filter to show inactive users if filtered
    });

    // Enrich users
    const enrichedUsers = users.map((user) => ({
      id: user.id,
      uuid: user.uuid,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profileImage: user.profileImage,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      isActive: !user.deletedAt,
    }));

    return {
      users: enrichedUsers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async adminGetUserStats() {
    const totalUsers = await this.userRepo.count();

    return {
      totalUsers,
    };
  }

  async adminGetUserTasks(userId: number) {
    const user = await this.userRepo.findOne({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    // This would need to be implemented with proper task relations
    // For now, return empty array as placeholder
    return [];
  }

  async adminGetUserTasksByUuid(uuid: string, options?: {
    role?: 'poster' | 'runner' | 'all';
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const user = await this.userRepo.findOne({ uuid });
    if (!user) throw new NotFoundException('User not found');

    const page = options?.page || 1;
    const pageSize = Math.min(options?.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    // Build filter based on role
    const filter: any = {};

    if (options?.role === 'poster') {
      filter.postedBy = user;
    } else if (options?.role === 'runner') {
      filter.assignedTo = user;
    } else {
      // Default: all tasks (poster or runner)
      filter.$or = [
        { postedBy: user },
        { assignedTo: user },
      ];
    }

    if (options?.status) {
      filter.status = options.status;
    }

    const [tasks, total] = await this.taskRepo.findAndCount(filter, {
      orderBy: { createdAt: 'DESC' },
      limit: pageSize,
      offset,
      populate: ['postedBy', 'assignedTo', 'category'],
    });

    const enrichedTasks = tasks.map((task) => ({
      publicId: task.publicId,
      title: task.title,
      description: task.description,
      reward: task.reward,
      status: task.status,
      category: {
        id: task.category.id,
        name: task.category.name,
      },
      postedBy: {
        uuid: task.postedBy.uuid,
        firstName: task.postedBy.firstName,
        lastName: task.postedBy.lastName,
      },
      assignedTo: task.assignedTo ? {
        uuid: task.assignedTo.uuid,
        firstName: task.assignedTo.firstName,
        lastName: task.assignedTo.lastName,
      } : null,
      userRole: task.postedBy.id === user.id ? 'poster' : 'runner',
      createdAt: task.createdAt,
      deadline: task.deadline,
      completedAt: task.completedAt,
    }));

    return {
      tasks: enrichedTasks,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async adminGetUserPaymentsByUuid(uuid: string, options?: {
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const user = await this.userRepo.findOne({ uuid });
    if (!user) throw new NotFoundException('User not found');

    const page = options?.page || 1;
    const pageSize = Math.min(options?.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    const filter: any = {
      paidBy: user,
    };

    if (options?.status) {
      filter.status = options.status;
    }

    const [payments, total] = await this.paymentRepo.findAndCount(filter, {
      orderBy: { createdAt: 'DESC' },
      limit: pageSize,
      offset,
      populate: ['taskBid', 'taskBid.task', 'taskBid.task.category', 'taskBid.task.postedBy', 'taskBid.task.assignedTo'],
    });

    const enrichedPayments = payments.map((payment) => ({
      id: payment.id,
      publicId: payment.publicId,
      amount: payment.totalAmount,
      bidAmount: payment.bidAmount,
      serviceCharge: payment.serviceCharge,
      status: payment.status,
      paymentReference: payment.paymentReference,
      task: {
        publicId: payment.taskBid.task.publicId,
        title: payment.taskBid.task.title,
        category: payment.taskBid.task.category.name,
        postedBy: {
          uuid: payment.taskBid.task.postedBy.uuid,
          firstName: payment.taskBid.task.postedBy.firstName,
          lastName: payment.taskBid.task.postedBy.lastName,
        },
        assignedTo: payment.taskBid.task.assignedTo ? {
          uuid: payment.taskBid.task.assignedTo.uuid,
          firstName: payment.taskBid.task.assignedTo.firstName,
          lastName: payment.taskBid.task.assignedTo.lastName,
        } : null,
      },
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
      escrowedAt: payment.escrowedAt,
      releasedAt: payment.releasedAt,
      refundedAt: payment.refundedAt,
    }));

    return {
      payments: enrichedPayments,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async adminGetUserActivity(
    userId: number,
    options?: {
      type?: UserActivityType;
      limit?: number;
      offset?: number;
    },
  ) {
    const user = await this.userRepo.findOne({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const limit = Math.min(options?.limit || 50, 100);
    const offset = options?.offset || 0;

    const filter: any = { user };
    if (options?.type) {
      filter.type = options.type;
    }

    const [activities, total] = await this.userActivityRepo.findAndCount(filter, {
      orderBy: { timestamp: 'DESC' },
      limit,
      offset,
    });

    return {
      activities: activities.map((activity) => ({
        id: activity.id,
        type: activity.type,
        action: activity.action,
        details: activity.details,
        metadata: activity.metadata,
        ipAddress: activity.ipAddress,
        userAgent: activity.userAgent,
        timestamp: activity.timestamp,
      })),
      total,
      limit,
      offset,
      hasMore: offset + activities.length < total,
    };
  }

  async adminGetUserActivityByUuid(
    uuid: string,
    options?: {
      type?: UserActivityType;
      limit?: number;
      offset?: number;
    },
  ) {
    const user = await this.userRepo.findOne({ uuid });
    if (!user) throw new NotFoundException('User not found');

    const limit = Math.min(options?.limit || 50, 100);
    const offset = options?.offset || 0;

    const filter: any = { user };
    if (options?.type) {
      filter.type = options.type;
    }

    const [activities, total] = await this.userActivityRepo.findAndCount(filter, {
      orderBy: { timestamp: 'DESC' },
      limit,
      offset,
    });

    return {
      activities: activities.map((activity) => ({
        id: activity.id,
        type: activity.type,
        action: activity.action,
        details: activity.details,
        metadata: activity.metadata,
        ipAddress: activity.ipAddress,
        userAgent: activity.userAgent,
        timestamp: activity.timestamp,
      })),
      total,
      limit,
      offset,
      hasMore: offset + activities.length < total,
    };
  }

  async getUserActivity(
    user: User,
    options?: {
      type?: UserActivityType;
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = Math.min(options?.limit || 50, 100);
    const offset = options?.offset || 0;

    const filter: any = { user };
    if (options?.type) {
      filter.type = options.type;
    }

    const [activities, total] = await this.userActivityRepo.findAndCount(filter, {
      orderBy: { timestamp: 'DESC' },
      limit,
      offset,
    });

    return {
      activities: activities.map((activity) => ({
        id: activity.id,
        type: activity.type,
        action: activity.action,
        details: activity.details,
        metadata: activity.metadata,
        ipAddress: activity.ipAddress,
        userAgent: activity.userAgent,
        timestamp: activity.timestamp,
      })),
      total,
      limit,
      offset,
      hasMore: offset + activities.length < total,
    };
  }

  // Helper to log user activity
  async logUserActivity(params: {
    user: User;
    type: UserActivityType;
    action: string;
    details?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const activity = this.userActivityRepo.create({
      user: params.user,
      type: params.type,
      action: params.action,
      details: params.details,
      metadata: params.metadata,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    await this.em.persistAndFlush(activity);
    return activity;
  }
}
