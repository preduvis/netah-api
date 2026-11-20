import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateTaskDto, TaskStatusEnum } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateTaskCategoryDto } from './dto/create-task-category.dto';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { TaskCategory } from './entities/task-category.entity';
import { Task } from './entities/task.entity';
import { User } from 'src/users/entities/user.entity';
import { CreateTaskBidDto, TaskBidStatus } from './dto/create-task-bid.dto';
import { TaskBid } from './entities/task-bid.entity';
import { NotFoundError } from 'rxjs';
import { MyTaskResponseDto } from './dto/my-task.response.dto';
import { CounterTaskBidDto } from './dto/counter-task-bid.dto';
import { ApproveTaskDto } from './dto/approve-task.dto';
import { DisputeTaskDto } from './dto/dispute-task.dto';
import { ReviewPosterDto } from './dto/review-poster.dto';
import { NegotiationRole, TaskBidNegotiation } from './entities/task-bid-negotiation.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { SystemSettings } from './entities/system-settings.entity';
import { NotificationType } from './entities/notification.entity';
import { NotificationsService } from 'src/notifications/notifications.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PaystackService } from './paystack.service';
import { v4 as uuidv4 } from 'uuid';
import { TaskFlag, FlagStatus, FlagSeverity, FlagReporterRole } from './entities/task-flag.entity';
import { ModerationNote } from './entities/moderation-note.entity';
import { TaskActivity, ActivityType, ActorRole } from './entities/task-activity.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
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

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskCategory)
    private readonly taskCategoryRepo: EntityRepository<TaskCategory>,

    @InjectRepository(Task)
    private readonly taskRepo: EntityRepository<Task>,

    @InjectRepository(TaskBid)
    private readonly taskBidRepo: EntityRepository<TaskBid>,

    @InjectRepository(TaskBidNegotiation)
    private readonly taskBidNegotiationRepo: EntityRepository<TaskBidNegotiation>,

    @InjectRepository(Payment)
    private readonly paymentRepo: EntityRepository<Payment>,

    @InjectRepository(SystemSettings)
    private readonly systemSettingsRepo: EntityRepository<SystemSettings>,

    @InjectRepository(User)
    private readonly userRepo: EntityRepository<User>,

    @InjectRepository(TaskFlag)
    private readonly taskFlagRepo: EntityRepository<TaskFlag>,

    @InjectRepository(ModerationNote)
    private readonly moderationNoteRepo: EntityRepository<ModerationNote>,

    @InjectRepository(TaskActivity)
    private readonly taskActivityRepo: EntityRepository<TaskActivity>,

    @InjectRepository(AdminAuditLog)
    private readonly adminAuditLogRepo: EntityRepository<AdminAuditLog>,

    private readonly notificationsService: NotificationsService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly paystackService: PaystackService,

    private readonly em: EntityManager,
  ) {}

  // Helper method to serialize user for public consumption
  private async serializePublicUser(user: User | null | undefined): Promise<any> {
    if (!user) return null;

    // Extract values before building object to ensure no entity references
    const uuid = user.uuid || `user-${user.id}`; // Fallback if uuid is missing
    const firstName = user.firstName;
    const lastName = user.lastName;
    const registeredAs = user.registeredAs;
    const showRating = user.showRating ?? false;
    const showLocation = user.showLocation ?? false;
    const showCompletedTasksCount = user.showCompletedTasksCount ?? false;

    // Create plain object with only public fields
    const publicUser: any = {
      uuid,
      firstName,
      lastName,
      registeredAs,
      createdAt: user.createdAt,
      skills: user.skills || [],
      profileImage: user.profileImage,
    };

    // Get tasks posted count (always show for transparency)
    const tasksPostedCount = await this.taskRepo.count({
      postedBy: user,
    });
    publicUser.tasksPosted = tasksPostedCount;

    // Only include profile visibility fields if they're explicitly allowed
    if (showRating) {
      // Get reviews for rating calculation
      const runnerReviews = await this.taskRepo.find({
        assignedTo: user,
        status: TaskStatusEnum.COMPLETED,
        rating: { $ne: null },
      });

      const posterReviews = await this.taskRepo.find({
        postedBy: user,
        status: TaskStatusEnum.COMPLETED,
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

      publicUser.rating = avgRating;
      publicUser.totalReviews = allRatings.length;
    }
    if (showLocation && user.city) {
      publicUser.city = user.city;
    }
    if (showCompletedTasksCount) {
      const completedTasks = await this.taskRepo.count({
        assignedTo: user,
        status: TaskStatusEnum.COMPLETED,
      });
      publicUser.completedTasksCount = completedTasks;
    }

    return publicUser;
  }

  // Helper method for creating admin audit logs
  private async createAdminAuditLog(data: {
    admin: Admin;
    action: string;
    taskId?: string;
    userId?: string;
    note?: string;
    ipAddress?: string;
    beforeState?: Record<string, any>;
    afterState?: Record<string, any>;
    metadata?: Record<string, any>;
  }) {
    const auditLog = this.adminAuditLogRepo.create({
      admin: data.admin,
      action: data.action,
      taskId: data.taskId,
      userId: data.userId,
      note: data.note,
      ipAddress: data.ipAddress,
      beforeState: data.beforeState,
      afterState: data.afterState,
      metadata: data.metadata,
    });
    await this.em.persist(auditLog);
    return auditLog;
  }

  // Helper method for creating task activity logs
  private async createTaskActivity(data: {
    task: Task;
    type: ActivityType;
    actorRole: ActorRole;
    actorId: string;
    actorName: string;
    action: string;
    details?: string;
    metadata?: Record<string, any>;
  }) {
    const activity = this.taskActivityRepo.create({
      task: data.task,
      type: data.type,
      actorRole: data.actorRole,
      actorId: data.actorId,
      actorName: data.actorName,
      action: data.action,
      details: data.details,
      metadata: data.metadata,
    });
    await this.em.persist(activity);
    return activity;
  }


  async create(createTaskDto: CreateTaskDto, currentUser: User) {
    const category = await this.taskCategoryRepo.findOne({
      id: createTaskDto?.categoryId,
    });

    if (!category) {
      throw new NotFoundException('Task category not found');
    }

    const user = await this.userRepo.findOne(currentUser.id);

    if (!user) {
      throw new NotFoundException('Task category not found');
    }

    const task = this.taskRepo.create({
      title: createTaskDto.title,
      description: createTaskDto.description,
      location: createTaskDto.location,
      reward: createTaskDto.reward,
      deadline: new Date(createTaskDto.deadline),
      requirements: createTaskDto.requirements,
      status: TaskStatusEnum.OPEN,
      category,
      postedBy: user, // 👈 creator
    });

    await this.em.persistAndFlush(task);

    // Log task creation activity
    await this.createTaskActivity({
      task,
      type: ActivityType.CREATION,
      actorRole: ActorRole.POSTER,
      actorId: user.uuid || user.id.toString(),
      actorName: `${user.firstName} ${user.lastName}`,
      action: 'Created task',
      details: `Task created with reward ₦${task.reward.toFixed(2)}`,
      metadata: {
        reward: task.reward,
        category: category.name,
        deadline: task.deadline,
      },
    });

    await this.em.flush();

    // Return serialized task with converted amounts
    return {
      id: task.id,
      publicId: task.publicId,
      title: task.title,
      description: task.description,
      location: task.location,
      reward: task.reward,
      deadline: task.deadline,
      requirements: task.requirements,
      images: task.images,
      status: task.status,
      bidsCount: task.bidsCount,
      createdAt: task.createdAt,
      category: {
        id: category.id,
        name: category.name,
      },
      postedBy: {
        id: user.id,
        uuid: user.uuid,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  async findAll(currentUser?: User) {
    const filter: any = {
      status: TaskStatusEnum.OPEN,
      deadline: { $gte: new Date() }, // Only show tasks that haven't expired
      assignedTo: null, // Only show unassigned tasks
    };

    // If user is logged in, exclude their own tasks
    if (currentUser) {
      filter.postedBy = { $ne: currentUser.id };
    }

    const tasks = await this.taskRepo.find(filter, {
      populate: ['category', 'postedBy'],
    });

    return Promise.all(tasks.map(async task => ({
      id: task.id,
      publicId: task.publicId,
      title: task.title,
      description: task.description,
      location: task.location,
      reward: task.reward,
      deadline: task.deadline,
      requirements: task.requirements,
      images: (task.images || []).map(img => img.url),
      status: task.status,
      createdAt: task.createdAt,
      category: {
        id: task.category.id,
        name: task.category.name,
        description: task.category.description,
      },
      postedBy: await this.serializePublicUser(task.postedBy),
    })));
  }

  async findOne(id: number) {
    const task = await this.taskRepo.findOne({ id });
    return task;
  }

  async findOneByUuid(publicId: string, currentUser: User): Promise<any> {
    const task = await this.taskRepo.findOne(
      { publicId },
      {
        populate: ['category', 'postedBy', 'assignedTo'],
      },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // If task is assigned, only poster and assignedTo can view
    if (task.assignedTo) {
      const isPoster = task.postedBy.id === currentUser.id;
      const isAssignee = task.assignedTo.id === currentUser.id;

      if (!isPoster && !isAssignee) {
        throw new NotFoundException('Task not found');
      }
    }

    // Build explicit response without spreading task to avoid leaking populated relations
    const response = {
      id: task.id,
      publicId: task.publicId,
      title: task.title,
      description: task.description,
      location: task.location,
      reward: task.reward,
      deadline: task.deadline,
      requirements: task.requirements,
      images: (task.images || []).map(img => img.url),
      status: task.status,
      rating: task.rating,
      feedback: task.feedback,
      posterRating: task.posterRating,
      posterReview: task.posterReview,
      disputeReason: task.disputeReason,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      category: {
        id: task.category.id,
        name: task.category.name,
        description: task.category.description,
      },
      postedBy: await this.serializePublicUser(task.postedBy),
      assignedTo: await this.serializePublicUser(task.assignedTo),
    };

    if (currentUser) {
      const isRunner = task.assignedTo?.id === currentUser.id;
      const isPoster = task.postedBy.id === currentUser.id;

      response['hasReviewed'] = isRunner ? !!task.posterRating : isPoster ? !!task.rating : false;
    }

    return response;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, currentUser: User) {
    const task = await this.taskRepo.findOne({ publicId: id });
    if (task?.postedBy?.id !== currentUser?.id) {
      throw new UnauthorizedException();
    }
    if (!task) throw new NotFoundException('Task not found');
    this.taskRepo.assign(task, updateTaskDto);
    await this.em.flush();
    return task;
  }

  remove(id: number) {
    return `This action removes a #${id} task`;
  }

  async createCategory(createTaskCategoryDto: CreateTaskCategoryDto) {
    const normalizedName = createTaskCategoryDto.name.trim().toLowerCase();

    const existingCategory = await this.taskCategoryRepo.findOne({
      name: normalizedName,
    });

    if (existingCategory) {
      throw new ConflictException(`Category with name ${normalizedName} already exists`);
    }
    const taskCategory = this.taskCategoryRepo.create({
      ...createTaskCategoryDto,
      name: normalizedName,
    });
    await this.em.persistAndFlush(taskCategory);
    return taskCategory;
  }

  async findAllCategories() {
    const taskCategories = await this.taskCategoryRepo.findAll();
    return taskCategories;
  }

  async removeCategory(id: number) {
    const category = await this.taskCategoryRepo.findOneOrFail({ id });
    if (!category) throw new NotFoundException('Category not found');
    category.deletedAt = new Date();
    await this.em.flush();
  }

  async createBid(id: string, createTaskBidDto: CreateTaskBidDto, currentUser: User) {
    const task = await this.taskRepo.findOneOrFail(
      {
        publicId: id,
        status: TaskStatusEnum.OPEN,
      },
      { populate: ['postedBy'] },
    );

    if (task?.postedBy?.id === currentUser?.id) {
      throw new BadRequestException('You cannot bid on your own task');
    }

    // Check if task deadline has passed
    if (task.deadline && new Date(task.deadline) < new Date()) {
      throw new BadRequestException('Cannot bid on an overdue task');
    }

    const existingBid = await this.taskBidRepo.findOne({
      task,
      createdBy: currentUser?.id,
      status: {
        $in: [
          TaskBidStatus.PENDING,
          TaskBidStatus.COUNTERED_BY_CLIENT,
          TaskBidStatus.COUNTERED_BY_RUNNER,
        ],
      },
    });

    if (existingBid) {
      throw new BadRequestException('You already have an active bid on this task');
    }

    // Get full user object with names
    const bidder = await this.userRepo.findOne({ id: currentUser.id });
    if (!bidder) {
      throw new NotFoundException('User not found');
    }

    const taskBid = this.taskBidRepo.create({
      task,
      createdBy: bidder,
      amount: createTaskBidDto.amount,
      message: createTaskBidDto.message,
      status: TaskBidStatus.PENDING,
    });

    await this.em.persistAndFlush(taskBid);

    const bidHistory = this.taskBidNegotiationRepo.create({
      taskBid,
      amount: createTaskBidDto.amount,
      message: createTaskBidDto.message,
      createdBy: bidder,
      role: NegotiationRole.RUNNER,
    });

    await this.em.persistAndFlush(bidHistory);

    // Log bid activity
    await this.createTaskActivity({
      task,
      type: ActivityType.BID,
      actorRole: ActorRole.RUNNER,
      actorId: bidder.uuid || bidder.id.toString(),
      actorName: `${bidder.firstName} ${bidder.lastName}`,
      action: `Placed bid of ₦${taskBid.amount.toFixed(2)}`,
      details: createTaskBidDto.message || undefined,
      metadata: {
        amount: createTaskBidDto.amount,
        bidId: taskBid.id,
      },
    });

    await this.em.flush();

    // Notify task poster of new bid
    await this.notificationsService.createNotification(
      task.postedBy,
      NotificationType.NEW_BID,
      'New bid on your task',
      `${bidder.firstName} ${bidder.lastName} bid ${createTaskBidDto.amount} on "${task.title}"`,
      task,
      taskBid,
    );

    return taskBid;
  }

  async getUserBid(publicId: string, currentUser: User) {
    const task = await this.taskRepo.findOne({
      publicId,
    });
    if (!task) {
      throw new NotFoundError('Task not found');
    }

    if (task?.postedBy === currentUser) {
      throw new BadRequestException('You cannot bid on your own tasks');
    }

    const taskBid = await this.taskBidRepo.findOne({
      task,
      createdBy: currentUser?.id,
    });

    if (!taskBid) {
      throw new NotFoundError('Task Bid not found');
    }

    return taskBid;
  }

  async getTaskBids(publicId: string, currentUser: User) {
    const task = await this.taskRepo.findOne({
      publicId,
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    if (task?.postedBy?.id !== currentUser?.id)
      throw new UnauthorizedException('You cannot view other bids');

    const taskBids = await this.taskBidRepo.find(
      {
        task,
      },
      { populate: ['createdBy'] },
    );

    return Promise.all(taskBids.map(async bid => ({
      id: bid.id,
      amount: bid.amount,
      message: bid.message,
      status: bid.status,
      createdAt: bid.createdAt,
      createdBy: await this.serializePublicUser(bid.createdBy),
    })));
  }

  async findMyTasks(currentUser: User): Promise<MyTaskResponseDto[]> {
    const tasks = await this.taskRepo.find(
      { postedBy: currentUser },
      { populate: ['category', 'assignedTo', 'postedBy'], },
    );

    const tasksWithBidCount: MyTaskResponseDto[] = await Promise.all(
      tasks.map(async (task) => {
        const bidCount = await this.taskBidRepo.count({ task });

        return {
          id: task.id,
          publicId: task.publicId!,
          title: task.title,
          description: task.description,
          location: task.location,
          reward: task.reward,
          deadline: task.deadline,
          status: task.status,
          createdAt: task.createdAt,
          bidCount,
          hasReviewed: !!task.rating,
        };
      }),
    );

    return tasksWithBidCount;
  }

  async getMyBids(currentUser: User) {
    const bids = await this.taskBidRepo.find(
      {
        createdBy: currentUser,
        status: {
          $in: [
            TaskBidStatus.PENDING,
            TaskBidStatus.COUNTERED_BY_CLIENT,
            TaskBidStatus.COUNTERED_BY_RUNNER,
          ],
        },
      },
      { populate: ['task', 'task.category', 'task.postedBy'] },
    );

    return Promise.all(bids.map(async bid => ({
      id: bid.id,
      amount: bid.amount,
      message: bid.message,
      status: bid.status,
      createdAt: bid.createdAt,
      task: {
        id: bid.task.id,
        publicId: bid.task.publicId,
        title: bid.task.title,
        description: bid.task.description,
        location: bid.task.location,
        reward: bid.task.reward,
        deadline: bid.task.deadline,
        status: bid.task.status,
        createdAt: bid.task.createdAt,
        category: {
          id: bid.task.category.id,
          name: bid.task.category.name,
          description: bid.task.category.description,
        },
        postedBy: await this.serializePublicUser(bid.task.postedBy),
      }
    })));
  }

  async getMyAssignedTasks(currentUser: User): Promise<any[]> {
    const tasks = await this.taskRepo.find(
      { assignedTo: currentUser },
      { populate: ['category', 'postedBy', 'assignedTo'] },
    );

    return Promise.all(tasks.map(async (task) => ({
      id: task.id,
      publicId: task.publicId,
      title: task.title,
      description: task.description,
      location: task.location,
      reward: task.reward,
      deadline: task.deadline,
      requirements: task.requirements,
      status: task.status,
      rating: task.rating,
      feedback: task.feedback,
      posterRating: task.posterRating,
      posterReview: task.posterReview,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      category: {
        id: task.category.id,
        name: task.category.name,
        description: task.category.description,
      },
      postedBy: await this.serializePublicUser(task.postedBy),
      assignedTo: await this.serializePublicUser(task.assignedTo),
      hasReviewed: !!task.posterRating,
    })));
  }

  async counterTaskBid(
    publicId: string,
    bidId: string,
    counterTaskBidDto: CounterTaskBidDto,
    currentUser: User,
  ) {
    const task = await this.taskRepo.findOne(
      {
        publicId,
      },
      { populate: ['postedBy'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const parsedBidId = Number(bidId);
    if (!Number.isInteger(parsedBidId) || parsedBidId <= 0) {
      throw new BadRequestException('Invalid bid id');
    }

    const isTaskPoster = task?.postedBy?.id === currentUser?.id;

    const taskBid = await this.taskBidRepo.findOne(
      {
        id: parsedBidId,
        task,
      },
      { populate: ['createdBy'] },
    );

    if (!taskBid) {
      throw new NotFoundException('Task bid not found');
    }

    if ([TaskBidStatus.ACCEPTED, TaskBidStatus.REJECTED].includes(taskBid.status)) {
      throw new BadRequestException('You cannot counterbid on a closed bid');
    }

    if (!isTaskPoster && taskBid.createdBy.id !== currentUser.id) {
      throw new UnauthorizedException('You are not allowed to counter this bid');
    }

    // Get full user object with names
    const counteringUser = await this.userRepo.findOne({ id: currentUser.id });
    if (!counteringUser) {
      throw new NotFoundException('User not found');
    }

    taskBid.amount = counterTaskBidDto.amount;
    taskBid.message = counterTaskBidDto.message ?? taskBid.message;
    taskBid.status = isTaskPoster ? TaskBidStatus.COUNTERED_BY_CLIENT : TaskBidStatus.COUNTERED_BY_RUNNER;

    const bidHistory = this.taskBidNegotiationRepo.create({
      taskBid,
      amount: counterTaskBidDto.amount,
      message: counterTaskBidDto.message,
      createdBy: counteringUser,
      role: isTaskPoster ? NegotiationRole.CLIENT : NegotiationRole.RUNNER,
    });

    await this.em.persistAndFlush([taskBid, bidHistory]);

    // Log counter offer activity
    await this.createTaskActivity({
      task,
      type: ActivityType.BID,
      actorRole: isTaskPoster ? ActorRole.POSTER : ActorRole.RUNNER,
      actorId: counteringUser.uuid || counteringUser.id.toString(),
      actorName: `${counteringUser.firstName} ${counteringUser.lastName}`,
      action: `Counter offer: ₦${taskBid.amount.toFixed(2)}`,
      details: counterTaskBidDto.message || undefined,
      metadata: {
        amount: counterTaskBidDto.amount,
        bidId: taskBid.id,
        counterOfferBy: isTaskPoster ? 'CLIENT' : 'RUNNER',
      },
    });

    await this.em.flush();

    // Notify the other party of counter offer
    const notificationRecipient = isTaskPoster ? taskBid.createdBy : task.postedBy;
    const notificationType = isTaskPoster
      ? NotificationType.COUNTER_OFFER_CLIENT
      : NotificationType.COUNTER_OFFER_RUNNER;

    await this.notificationsService.createNotification(
      notificationRecipient,
      notificationType,
      'Counter offer received',
      `${counteringUser.firstName} ${counteringUser.lastName} countered with ${counterTaskBidDto.amount} on "${task.title}"`,
      task,
      taskBid,
    );

    return taskBid;
  }

  async getTaskBidHistory(publicId: string, bidId: string, currentUser: User) {
    const task = await this.taskRepo.findOne({
      publicId,
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const parsedBidId = Number(bidId);
    if (!Number.isInteger(parsedBidId) || parsedBidId <= 0) {
      throw new BadRequestException('Invalid bid id');
    }

    const isTaskPoster = task?.postedBy?.id === currentUser?.id;

    const taskBid = await this.taskBidRepo.findOne(
      {
        id: parsedBidId,
        task,
      },
      { populate: ['task', 'createdBy'] },
    );

    if (!taskBid) {
      throw new NotFoundException('Task bid not found');
    }

    if (!isTaskPoster && taskBid.createdBy.id !== currentUser.id) {
      throw new UnauthorizedException('You are not allowed to view this bid history');
    }

    const bidHistory = await this.taskBidNegotiationRepo.find(
      { taskBid },
      {
        orderBy: { createdAt: 'DESC' },
        populate: ['createdBy'],
      },
    );

    return {
      bid: taskBid,
      negotiations: bidHistory.map((negotiation) => ({
        id: negotiation.id,
        amount: negotiation.amount,
        message: negotiation.message,
        role: negotiation.role,
        createdAt: negotiation.createdAt,
        createdBy: {
          id: negotiation.createdBy.id,
          uuid: negotiation.createdBy.uuid,
          firstName: negotiation.createdBy.firstName,
          lastName: negotiation.createdBy.lastName,
        },
      })),
    };
  }

  async getPaymentBreakdown(publicId: string, bidId: string, currentUser: User) {
    const task = await this.taskRepo.findOne({ publicId });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.postedBy.id !== currentUser.id) {
      throw new UnauthorizedException('Only task owner can view payment breakdown');
    }

    const parsedBidId = Number(bidId);
    if (!Number.isInteger(parsedBidId) || parsedBidId <= 0) {
      throw new BadRequestException('Invalid bid id');
    }

    const taskBid = await this.taskBidRepo.findOne(
      { id: parsedBidId, task },
      { populate: ['createdBy', 'task'] },
    );

    if (!taskBid) {
      throw new NotFoundException('Task bid not found');
    }

    if (taskBid.status === TaskBidStatus.ACCEPTED) {
      throw new BadRequestException('Bid already accepted');
    }

    if (taskBid.status === TaskBidStatus.REJECTED) {
      throw new BadRequestException('Cannot view breakdown for rejected bid');
    }

    // Get service charge settings
    const serviceChargePercentageSetting = await this.systemSettingsRepo.findOne({
      key: 'service_charge_percentage',
    });
    const serviceChargeFixedSetting = await this.systemSettingsRepo.findOne({
      key: 'service_charge_fixed',
    });

    // Calculate service charge (apply both and use higher value)
    let serviceCharge = 0;
    let appliedChargeType = 'none';
    const bidAmount = Number(taskBid.amount);

    const percentageCharge = serviceChargePercentageSetting
      ? bidAmount * Number(serviceChargePercentageSetting.value)
      : 0;
    const fixedCharge = serviceChargeFixedSetting
      ? Number(serviceChargeFixedSetting.value)
      : 0;

    if (percentageCharge > fixedCharge) {
      serviceCharge = percentageCharge;
      appliedChargeType = 'percentage';
    } else if (fixedCharge > 0) {
      serviceCharge = fixedCharge;
      appliedChargeType = 'fixed';
    }

    const totalAmount = bidAmount + serviceCharge;

    return {
      bid: {
        id: taskBid.id,
        amount: taskBid.amount,
        message: taskBid.message,
        status: taskBid.status,
        runner: {
          id: taskBid.createdBy.id,
          firstName: taskBid.createdBy.firstName,
          lastName: taskBid.createdBy.lastName,
        },
      },
      breakdown: {
        bidAmount,
        serviceCharge,
        serviceChargeType: appliedChargeType,
        totalAmount,
      },
    };
  }

  async acceptTaskBid(publicId: string, bidId: string, currentUser: User) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'assignedTo'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.postedBy.id !== currentUser.id) {
      throw new UnauthorizedException('Only task owner can accept bids');
    }

    if (task.status !== TaskStatusEnum.OPEN) {
      throw new BadRequestException('Task is not open for bids');
    }

    const parsedBidId = Number(bidId);
    if (!Number.isInteger(parsedBidId) || parsedBidId <= 0) {
      throw new BadRequestException('Invalid bid id');
    }

    const taskBid = await this.taskBidRepo.findOne(
      { id: parsedBidId, task },
      { populate: ['createdBy'] },
    );

    if (!taskBid) {
      throw new NotFoundException('Task bid not found');
    }

    if (taskBid.status === TaskBidStatus.ACCEPTED) {
      throw new BadRequestException('Bid already accepted');
    }

    if (taskBid.status === TaskBidStatus.REJECTED) {
      throw new BadRequestException('Cannot accept a rejected bid');
    }

    // Check for existing pending payment - delete and recreate for retry
    const existingPayment = await this.paymentRepo.findOne({
      taskBid,
      status: PaymentStatus.PENDING,
    });

    if (existingPayment) {
      // Delete old pending payment and create new one with fresh reference
      await this.em.removeAndFlush(existingPayment);
    }

    // Get service charge settings
    const serviceChargePercentageSetting = await this.systemSettingsRepo.findOne({
      key: 'service_charge_percentage',
    });
    const serviceChargeFixedSetting = await this.systemSettingsRepo.findOne({
      key: 'service_charge_fixed',
    });

    // Calculate service charge (apply both and use higher value)
    let serviceCharge = 0;
    const bidAmount = Number(taskBid.amount);

    if (serviceChargePercentageSetting) {
      const percentage = Number(serviceChargePercentageSetting.value);
      const percentageCharge = bidAmount * percentage;
      serviceCharge = Math.max(serviceCharge, percentageCharge);
    }

    if (serviceChargeFixedSetting) {
      const fixedCharge = Number(serviceChargeFixedSetting.value);
      serviceCharge = Math.max(serviceCharge, fixedCharge);
    }

    const totalAmount = bidAmount + serviceCharge;

    // Generate payment reference
    const paymentReference = this.paystackService.generateReference('NETAH');

    // Create pending payment
    const payment = this.paymentRepo.create({
      taskBid,
      paidBy: currentUser,
      bidAmount,
      serviceCharge,
      totalAmount,
      paymentReference,
      status: PaymentStatus.PENDING,
    });

    // Don't change task status yet - only update after payment verification
    await this.em.persistAndFlush(payment);

    // Initialize Paystack transaction
    const paystackResponse = await this.paystackService.initializeTransaction({
      email: currentUser.email,
      amount: Math.round(totalAmount * 100), // Convert naira to kobo for Paystack
      reference: paymentReference,
      callback_url: `${process.env.FRONTEND_URL}/payment/callback?reference=${paymentReference}`,
      metadata: {
        taskId: task.id,
        taskPublicId: task.publicId,
        bidId: taskBid.id,
        userId: currentUser.id,
        bidAmount,
        serviceCharge,
      },
    });

    return {
      message: 'Payment initialized successfully',
      payment: {
        id: payment.id,
        bidAmount: payment.bidAmount,
        serviceCharge: payment.serviceCharge,
        totalAmount: payment.totalAmount,
        paymentReference: payment.paymentReference,
        status: payment.status,
      },
      paymentUrl: paystackResponse.data.authorization_url,
      accessCode: paystackResponse.data.access_code,
    };
  }

  async verifyPayment(reference: string): Promise<any> {
    // Verify transaction with Paystack
    const paystackVerification = await this.paystackService.verifyTransaction(reference);

    if (!paystackVerification.status || paystackVerification.data.status !== 'success') {
      throw new BadRequestException('Payment verification failed');
    }

    // Find payment record
    const payment = await this.paymentRepo.findOne(
      { paymentReference: reference },
      { populate: ['taskBid', 'taskBid.task', 'taskBid.createdBy', 'paidBy'] },
    );

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      return {
        message: 'Payment already verified',
        payment,
      };
    }

    const taskBid = payment.taskBid;
    const task = taskBid.task;

    // Update payment status
    payment.status = PaymentStatus.COMPLETED;
    payment.completedAt = new Date();

    // Update bid status
    taskBid.status = TaskBidStatus.ACCEPTED;

    // Assign task to runner and mark as IN_PROGRESS
    task.assignedTo = taskBid.createdBy;
    task.status = TaskStatusEnum.IN_PROGRESS;

    // Auto-reject other bids
    const otherBids = await this.taskBidRepo.find({
      task,
      id: { $ne: taskBid.id },
      status: {
        $in: [
          TaskBidStatus.PENDING,
          TaskBidStatus.COUNTERED_BY_CLIENT,
          TaskBidStatus.COUNTERED_BY_RUNNER,
        ],
      },
    });

    otherBids.forEach((bid) => {
      bid.status = TaskBidStatus.REJECTED;
      bid.deletedAt = new Date();
    });

    await this.em.persistAndFlush([payment, taskBid, task, ...otherBids]);

    // Log assignment activity
    await this.createTaskActivity({
      task,
      type: ActivityType.ASSIGNMENT,
      actorRole: ActorRole.POSTER,
      actorId: payment.paidBy.uuid || payment.paidBy.id.toString(),
      actorName: `${payment.paidBy.firstName} ${payment.paidBy.lastName}`,
      action: 'Task assigned to runner',
      details: `Bid accepted: ₦${payment.bidAmount.toFixed(2)}`,
      metadata: {
        runnerId: taskBid.createdBy.id,
        runnerName: `${taskBid.createdBy.firstName} ${taskBid.createdBy.lastName}`,
        amount: payment.bidAmount,
      },
    });

    // Log payment activity
    await this.createTaskActivity({
      task,
      type: ActivityType.PAYMENT,
      actorRole: ActorRole.SYSTEM,
      actorId: 'system',
      actorName: 'System',
      action: 'Payment verified and escrowed',
      details: `Total: ₦${payment.totalAmount.toFixed(2)} (Bid: ₦${payment.bidAmount.toFixed(2)} + Fee: ₦${payment.serviceCharge.toFixed(2)})`,
      metadata: {
        paymentId: payment.id,
        reference: payment.paymentReference,
        bidAmount: payment.bidAmount,
        serviceCharge: payment.serviceCharge,
        totalAmount: payment.totalAmount,
      },
    });

    // Log status change activity
    await this.createTaskActivity({
      task,
      type: ActivityType.STATUS_CHANGE,
      actorRole: ActorRole.SYSTEM,
      actorId: 'system',
      actorName: 'System',
      action: 'Task status changed to IN_PROGRESS',
      details: 'Payment verified, task started',
      metadata: {
        previousStatus: 'OPEN',
        newStatus: 'IN_PROGRESS',
      },
    });

    await this.em.flush();

    // Notify runner of task assignment
    await this.notificationsService.createNotification(
      taskBid.createdBy,
      NotificationType.TASK_ASSIGNED,
      'Your bid was accepted!',
      `Your bid of ${payment.bidAmount} on "${task.title}" was accepted. Task is now in progress.`,
      task,
      taskBid,
    );

    // Notify client of successful task assignment
    await this.notificationsService.createNotification(
      payment.paidBy,
      NotificationType.BID_ACCEPTED,
      'Payment successful!',
      `Payment successful. ${taskBid.createdBy.firstName} ${taskBid.createdBy.lastName} has been assigned to "${task.title}". Task is now in progress.`,
      task,
      taskBid,
    );

    return {
      message: 'Payment verified successfully',
      payment,
      task,
      bid: taskBid,
    };
  }

  async rejectTaskBid(publicId: string, bidId: string, currentUser: User) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.postedBy.id !== currentUser.id) {
      throw new UnauthorizedException('Only task owner can reject bids');
    }

    const parsedBidId = Number(bidId);
    if (!Number.isInteger(parsedBidId) || parsedBidId <= 0) {
      throw new BadRequestException('Invalid bid id');
    }

    const taskBid = await this.taskBidRepo.findOne(
      {
        id: parsedBidId,
        task,
      },
      { populate: ['createdBy'] },
    );

    if (!taskBid) {
      throw new NotFoundException('Task bid not found');
    }

    if (taskBid.status === TaskBidStatus.ACCEPTED) {
      throw new BadRequestException('Cannot reject an accepted bid');
    }

    if (taskBid.status === TaskBidStatus.REJECTED) {
      throw new BadRequestException('Bid already rejected');
    }

    // Soft delete the bid
    taskBid.status = TaskBidStatus.REJECTED;
    taskBid.deletedAt = new Date();

    await this.em.flush();

    // Log bid rejection activity
    await this.createTaskActivity({
      task,
      type: ActivityType.BID,
      actorRole: ActorRole.POSTER,
      actorId: currentUser.uuid || currentUser.id.toString(),
      actorName: `${currentUser.firstName} ${currentUser.lastName}`,
      action: 'Bid rejected',
      details: `Rejected bid of ₦${taskBid.amount.toFixed(2)} from ${taskBid.createdBy.firstName} ${taskBid.createdBy.lastName}`,
      metadata: {
        bidId: taskBid.id,
        amount: taskBid.amount,
        runnerId: taskBid.createdBy.id,
      },
    });

    await this.em.flush();

    // Notify runner of bid rejection
    await this.notificationsService.createNotification(
      taskBid.createdBy,
      NotificationType.BID_REJECTED,
      'Your bid was rejected',
      `Your bid on "${task.title}" was rejected. You can submit a new bid if you wish.`,
      task,
      taskBid,
    );

    return { message: 'Bid rejected successfully. Runner can bid again if desired.' };
  }

  async withdrawBid(publicId: string, bidId: string, currentUser: User) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const parsedBidId = Number(bidId);
    if (!Number.isInteger(parsedBidId) || parsedBidId <= 0) {
      throw new BadRequestException('Invalid bid id');
    }

    const taskBid = await this.taskBidRepo.findOne(
      {
        id: parsedBidId,
        task,
      },
      { populate: ['createdBy'] },
    );

    if (!taskBid) {
      throw new NotFoundException('Task bid not found');
    }

    if (taskBid.createdBy.id !== currentUser.id) {
      throw new UnauthorizedException('Only the bid creator can withdraw this bid');
    }

    if (taskBid.status === TaskBidStatus.ACCEPTED) {
      throw new BadRequestException('Cannot withdraw an accepted bid');
    }

    if (taskBid.status === TaskBidStatus.REJECTED) {
      throw new BadRequestException('Bid already rejected/withdrawn');
    }

    // Soft delete the bid
    taskBid.status = TaskBidStatus.REJECTED;
    taskBid.deletedAt = new Date();

    await this.em.flush();

    // Log bid withdrawal activity
    await this.createTaskActivity({
      task,
      type: ActivityType.BID,
      actorRole: ActorRole.RUNNER,
      actorId: currentUser.uuid || currentUser.id.toString(),
      actorName: `${currentUser.firstName} ${currentUser.lastName}`,
      action: 'Bid withdrawn',
      details: `Withdrew bid of ₦${taskBid.amount.toFixed(2)}`,
      metadata: {
        bidId: taskBid.id,
        amount: taskBid.amount,
      },
    });

    await this.em.flush();

    // Notify poster of withdrawal
    await this.notificationsService.createNotification(
      task.postedBy,
      NotificationType.BID_REJECTED,
      'Bid withdrawn',
      `${taskBid.createdBy.firstName} ${taskBid.createdBy.lastName} withdrew their bid of ${taskBid.amount} on "${task.title}".`,
      task,
      taskBid,
    );

    return { message: 'Bid withdrawn successfully' };
  }

  async getCompletionDetails(publicId: string, currentUser: User) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'assignedTo', 'category'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.postedBy.id !== currentUser.id) {
      throw new UnauthorizedException('Only task poster can view completion details');
    }

    if (task.status !== TaskStatusEnum.PENDING_APPROVAL) {
      throw new BadRequestException('Task must be pending approval');
    }

    if (!task.assignedTo) {
      throw new BadRequestException('No runner assigned to this task');
    }

    // Get the accepted bid to find payment details
    const acceptedBid = await this.taskBidRepo.findOne({
      task,
      status: TaskBidStatus.ACCEPTED,
    });

    if (!acceptedBid) {
      throw new NotFoundException('Accepted bid not found');
    }

    // Get payment record
    const payment = await this.paymentRepo.findOne({
      taskBid: acceptedBid,
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    const amountToDisburse = Number(payment.bidAmount);

    return {
      task: {
        id: task.id,
        publicId: task.publicId,
        title: task.title,
        description: task.description,
        status: task.status,
        category: task.category.name,
        hasReviewed: !!task.rating,
      },
      runner: {
        id: task.assignedTo.id,
        firstName: task.assignedTo.firstName,
        lastName: task.assignedTo.lastName,
        email: task.assignedTo.email,
      },
      amountToDisburse,
    };
  }

  async markTaskAsCompleted(publicId: string, currentUser: User) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['assignedTo', 'postedBy'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!task.assignedTo || task.assignedTo.id !== currentUser.id) {
      throw new UnauthorizedException('Only the assigned runner can mark task as completed');
    }

    if (task.status !== TaskStatusEnum.IN_PROGRESS) {
      throw new BadRequestException('Only in-progress tasks can be marked as completed');
    }

    task.status = TaskStatusEnum.PENDING_APPROVAL;

    await this.em.flush();

    // Log status change activity
    await this.createTaskActivity({
      task,
      type: ActivityType.STATUS_CHANGE,
      actorRole: ActorRole.RUNNER,
      actorId: task.assignedTo.uuid || task.assignedTo.id.toString(),
      actorName: `${task.assignedTo.firstName} ${task.assignedTo.lastName}`,
      action: 'Task marked as completed',
      details: 'Awaiting poster approval',
      metadata: {
        previousStatus: 'IN_PROGRESS',
        newStatus: 'PENDING_APPROVAL',
      },
    });

    await this.em.flush();

    // Notify poster that task is ready for approval
    await this.notificationsService.createNotification(
      task.postedBy,
      NotificationType.TASK_STATUS_CHANGED,
      'Task completed - awaiting approval',
      `${task.assignedTo.firstName} ${task.assignedTo.lastName} marked "${task.title}" as completed. Please review and approve.`,
      task,
    );

    // Notify runner (confirmation)
    await this.notificationsService.createNotification(
      task.assignedTo,
      NotificationType.TASK_STATUS_CHANGED,
      'Task marked as completed',
      `You marked "${task.title}" as completed. Waiting for client approval.`,
      task,
    );

    return task;
  }

  async approveAndReleaseFunds(publicId: string, approveTaskDto: ApproveTaskDto, currentUser: User) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'assignedTo'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.postedBy.id !== currentUser.id) {
      throw new UnauthorizedException('Only task poster can approve and release funds');
    }

    if (task.status !== TaskStatusEnum.PENDING_APPROVAL) {
      throw new BadRequestException('Task must be pending approval');
    }

    if (!task.assignedTo) {
      throw new BadRequestException('No runner assigned to this task');
    }

    // Store rating and feedback
    task.rating = approveTaskDto.rating;
    task.feedback = approveTaskDto.feedback;
    task.status = TaskStatusEnum.COMPLETED;
    task.completedAt = new Date();

    await this.em.flush();

    // Log status change to COMPLETED
    await this.createTaskActivity({
      task,
      type: ActivityType.STATUS_CHANGE,
      actorRole: ActorRole.POSTER,
      actorId: currentUser.uuid || currentUser.id.toString(),
      actorName: `${currentUser.firstName} ${currentUser.lastName}`,
      action: 'Task approved and completed',
      details: `Rated ${approveTaskDto.rating} stars${approveTaskDto.feedback ? `: "${approveTaskDto.feedback}"` : ''}`,
      metadata: {
        previousStatus: 'PENDING_APPROVAL',
        newStatus: 'COMPLETED',
        rating: approveTaskDto.rating,
      },
    });

    // Log payment release
    const acceptedBid = await this.taskBidRepo.findOne({
      task,
      status: TaskBidStatus.ACCEPTED,
    });

    if (acceptedBid) {
      const payment = await this.paymentRepo.findOne({ taskBid: acceptedBid });

      if (payment) {
        await this.createTaskActivity({
          task,
          type: ActivityType.PAYMENT,
          actorRole: ActorRole.SYSTEM,
          actorId: 'system',
          actorName: 'System',
          action: 'Payment released to runner',
          details: `Amount: ₦${payment.bidAmount.toFixed(2)}`,
          metadata: {
            paymentId: payment.id,
            amount: payment.bidAmount,
          },
        });
      }
    }

    await this.em.flush();

    // Notify runner that task is approved and funds released
    const feedbackText = approveTaskDto.feedback
      ? ` Feedback: "${approveTaskDto.feedback}"`
      : '';
    await this.notificationsService.createNotification(
      task.assignedTo,
      NotificationType.TASK_STATUS_CHANGED,
      'Task approved - funds released!',
      `Your completed task "${task.title}" has been approved with ${approveTaskDto.rating} stars.${feedbackText} Funds have been released.`,
      task,
    );

    // Notify poster (confirmation)
    await this.notificationsService.createNotification(
      task.postedBy,
      NotificationType.TASK_STATUS_CHANGED,
      'Task completed successfully',
      `You approved "${task.title}" with ${approveTaskDto.rating} stars. Funds released to ${task.assignedTo.firstName} ${task.assignedTo.lastName}.`,
      task,
    );

    return {
      task,
      message: 'Task approved and funds released successfully',
    };
  }

  async disputeTask(publicId: string, disputeTaskDto: DisputeTaskDto, currentUser: User) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'assignedTo'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!task.assignedTo) {
      throw new BadRequestException('No runner assigned to this task');
    }

    const isPoster = task.postedBy.id === currentUser.id;
    const isRunner = task.assignedTo.id === currentUser.id;

    if (!isPoster && !isRunner) {
      throw new UnauthorizedException('Only task poster or runner can dispute a task');
    }

    // Poster can only dispute during PENDING_APPROVAL
    if (isPoster && task.status !== TaskStatusEnum.PENDING_APPROVAL) {
      throw new BadRequestException('Poster can only dispute pending approval tasks');
    }

    // Runner can dispute during IN_PROGRESS or PENDING_APPROVAL
    if (isRunner && ![TaskStatusEnum.IN_PROGRESS, TaskStatusEnum.PENDING_APPROVAL].includes(task.status)) {
      throw new BadRequestException('Runner can only dispute in-progress or pending approval tasks');
    }

    const previousStatus = task.status;
    task.status = TaskStatusEnum.DISPUTED;
    task.disputeReason = disputeTaskDto.reason;

    await this.em.flush();

    // Log dispute activity
    await this.createTaskActivity({
      task,
      type: ActivityType.STATUS_CHANGE,
      actorRole: isPoster ? ActorRole.POSTER : ActorRole.RUNNER,
      actorId: currentUser.uuid || currentUser.id.toString(),
      actorName: `${currentUser.firstName} ${currentUser.lastName}`,
      action: 'Task disputed',
      details: `Reason: ${disputeTaskDto.reason}`,
      metadata: {
        previousStatus,
        newStatus: 'DISPUTED',
        disputedBy: isPoster ? 'POSTER' : 'RUNNER',
      },
    });

    await this.em.flush();

    // Notify the other party
    const otherParty = isPoster ? task.assignedTo : task.postedBy;
    const disputingPartyName = isPoster
      ? 'Task poster'
      : `${currentUser.firstName} ${currentUser.lastName}`;

    await this.notificationsService.createNotification(
      otherParty,
      NotificationType.TASK_STATUS_CHANGED,
      'Task disputed',
      `${disputingPartyName} disputed "${task.title}". Reason: ${disputeTaskDto.reason}`,
      task,
    );

    // Notify disputing party (confirmation)
    await this.notificationsService.createNotification(
      currentUser,
      NotificationType.TASK_STATUS_CHANGED,
      'Dispute submitted',
      `You disputed "${task.title}". Our support team will review this case and contact both parties.`,
      task,
    );

    return {
      task,
      message: 'Dispute submitted successfully. Our support team will review this case.',
    };
  }

  async reviewPoster(publicId: string, reviewPosterDto: ReviewPosterDto, currentUser: User) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'assignedTo'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!task.assignedTo || task.assignedTo.id !== currentUser.id) {
      throw new UnauthorizedException('Only the assigned runner can review the poster');
    }

    if (task.status !== TaskStatusEnum.COMPLETED) {
      throw new BadRequestException('Only completed tasks can be reviewed');
    }

    if (task.posterRating) {
      throw new BadRequestException('You have already reviewed this poster');
    }

    task.posterRating = reviewPosterDto.rating;
    task.posterReview = reviewPosterDto.review;

    await this.em.flush();

    // Log review activity
    await this.createTaskActivity({
      task,
      type: ActivityType.STATUS_CHANGE,
      actorRole: ActorRole.RUNNER,
      actorId: currentUser.uuid || currentUser.id.toString(),
      actorName: `${currentUser.firstName} ${currentUser.lastName}`,
      action: 'Reviewed task poster',
      details: `Rated poster ${reviewPosterDto.rating} stars${reviewPosterDto.review ? `: "${reviewPosterDto.review}"` : ''}`,
      metadata: {
        rating: reviewPosterDto.rating,
      },
    });

    await this.em.flush();

    // Notify poster of review
    const reviewText = reviewPosterDto.review ? ` Review: "${reviewPosterDto.review}"` : '';
    await this.notificationsService.createNotification(
      task.postedBy,
      NotificationType.TASK_STATUS_CHANGED,
      'You received a review!',
      `${task.assignedTo.firstName} ${task.assignedTo.lastName} rated you ${reviewPosterDto.rating} stars for "${task.title}".${reviewText}`,
      task,
    );

    return {
      task,
      message: 'Review submitted successfully',
    };
  }

  async uploadTaskImage(publicId: string, currentUser: User, file: Express.Multer.File) {
    const task = await this.taskRepo.findOne({ publicId }, { populate: ['postedBy'] });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.postedBy.id !== currentUser.id) {
      throw new UnauthorizedException('Only task poster can upload images');
    }

    if (task.status !== TaskStatusEnum.OPEN) {
      throw new BadRequestException('Can only upload images for open tasks');
    }

    // Upload to Cloudinary
    const { url, publicId: imagePublicId } = await this.cloudinaryService.uploadImage(
      file,
      'netah/tasks',
    );

    // Add to task images array
    if (!task.images) {
      task.images = [];
    }
    task.images.push({ url, publicId: imagePublicId });

    await this.em.flush();

    return {
      image: url,
      message: 'Image uploaded successfully',
    };
  }

  async deleteTaskImage(publicId: string, imageIndex: number, currentUser: User) {
    const task = await this.taskRepo.findOne({ publicId }, { populate: ['postedBy'] });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.postedBy.id !== currentUser.id) {
      throw new UnauthorizedException('Only task poster can delete images');
    }

    if (!task.images || !task.images[imageIndex]) {
      throw new NotFoundException('Image not found');
    }

    // Delete from Cloudinary
    const image = task.images[imageIndex];
    await this.cloudinaryService.deleteImage(image.publicId);

    // Remove from array
    task.images.splice(imageIndex, 1);

    await this.em.flush();

    return {
      message: 'Image deleted successfully',
    };
  }

  // Admin methods
  async adminFindAllTasks(options?: {
    status?: TaskStatusEnum;
    search?: string;
    categoryId?: number;
    fromDate?: string;
    toDate?: string;
    hasFlagsOnly?: boolean;
    page?: number;
    pageSize?: number;
    sort?: 'created_asc' | 'created_desc' | 'reward_asc' | 'reward_desc' | 'deadline_asc' | 'deadline_desc';
  }) {
    const page = options?.page || 1;
    const pageSize = Math.min(options?.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    // Build filter
    const filter: any = {};

    if (options?.status) {
      filter.status = options.status;
    }

    if (options?.categoryId) {
      filter.category = options.categoryId;
    }

    if (options?.search) {
      filter.$or = [
        { title: { $ilike: `%${options.search}%` } },
        { description: { $ilike: `%${options.search}%` } },
        { publicId: { $ilike: `%${options.search}%` } },
      ];
    }

    if (options?.fromDate) {
      filter.createdAt = { $gte: new Date(options.fromDate) };
    }

    if (options?.toDate) {
      if (!filter.createdAt) filter.createdAt = {};
      filter.createdAt.$lte = new Date(options.toDate);
    }

    // Filter by flags at database level
    if (options?.hasFlagsOnly) {
      const openFlags = await this.taskFlagRepo.find(
        { status: FlagStatus.OPEN },
        { populate: ['task'] }
      );

      const taskIds = [...new Set(openFlags.map((flag) => flag.task.id))];

      if (taskIds.length === 0) {
        // No flagged tasks, return empty
        return {
          tasks: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }

      filter.id = { $in: taskIds };
    }

    // Build orderBy
    let orderBy: any = { createdAt: 'DESC' };
    if (options?.sort === 'created_asc') orderBy = { createdAt: 'ASC' };
    else if (options?.sort === 'created_desc') orderBy = { createdAt: 'DESC' };
    else if (options?.sort === 'reward_asc') orderBy = { reward: 'ASC' };
    else if (options?.sort === 'reward_desc') orderBy = { reward: 'DESC' };
    else if (options?.sort === 'deadline_asc') orderBy = { deadline: 'ASC' };
    else if (options?.sort === 'deadline_desc') orderBy = { deadline: 'DESC' };

    // Get tasks with pagination
    const [tasks, total] = await this.taskRepo.findAndCount(filter, {
      populate: ['postedBy', 'category', 'assignedTo'],
      orderBy,
      limit: pageSize,
      offset,
    });

    // Get additional info for each task
    const enrichedTasks = await Promise.all(
      tasks.map(async (task) => {
        const bidCount = await this.taskBidRepo.count({ task });
        const flagsCount = await this.taskFlagRepo.count({
          task,
          status: FlagStatus.OPEN,
        });

        return {
          id: task.publicId,
          title: task.title,
          status: task.status,
          reward: task.reward,
          deadline: task.deadline,
          createdAt: task.createdAt,
          category: {
            id: task.category.id,
            name: task.category.name,
          },
          poster: {
            id: task.postedBy.id,
            uuid: task.postedBy.uuid,
            firstName: task.postedBy.firstName,
            lastName: task.postedBy.lastName,
          },
          assignedTo: task.assignedTo
            ? {
                id: task.assignedTo.id,
                uuid: task.assignedTo.uuid,
                firstName: task.assignedTo.firstName,
                lastName: task.assignedTo.lastName,
              }
            : null,
          bidCount,
          flagsCount,
          hasFlags: flagsCount > 0,
        };
      }),
    );

    return {
      tasks: enrichedTasks,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async adminFindTaskById(publicId: string) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'category', 'assignedTo'] },
    );
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async adminGetTaskBids(publicId: string) {
    const task = await this.taskRepo.findOne({ publicId });
    if (!task) throw new NotFoundException('Task not found');

    const bids = await this.taskBidRepo.find(
      { task },
      { populate: ['createdBy'], orderBy: { createdAt: 'DESC' } },
    );
    return bids;
  }

  async adminUpdateTask(publicId: string, updateTaskDto: UpdateTaskDto) {
    const task = await this.taskRepo.findOne({ publicId });
    if (!task) throw new NotFoundException('Task not found');

    Object.assign(task, updateTaskDto);
    await this.em.flush();
    return task;
  }

  async adminDeleteTask(publicId: string) {
    const task = await this.taskRepo.findOne({ publicId });
    if (!task) throw new NotFoundException('Task not found');

    await this.em.removeAndFlush(task);
    return { message: 'Task deleted successfully' };
  }

  async adminGetTaskStats() {
    const totalTasks = await this.taskRepo.count();
    const openTasks = await this.taskRepo.count({ status: TaskStatusEnum.OPEN });
    const inProgressTasks = await this.taskRepo.count({ status: TaskStatusEnum.IN_PROGRESS });
    const completedTasks = await this.taskRepo.count({ status: TaskStatusEnum.COMPLETED });
    const disputedTasks = await this.taskRepo.count({ status: TaskStatusEnum.DISPUTED });

    return {
      totalTasks,
      openTasks,
      inProgressTasks,
      completedTasks,
      disputedTasks,
    };
  }

  // Enhanced admin task detail with full relations
  async adminGetTaskDetailFull(publicId: string) {
    const task = await this.taskRepo.findOne(
      { publicId },
      {
        populate: ['postedBy', 'assignedTo', 'category'],
      },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Get payment if exists
    const acceptedBid = await this.taskBidRepo.findOne({
      task,
      status: TaskBidStatus.ACCEPTED,
    });

    let payment: Payment | null = null;
    if (acceptedBid) {
      payment = await this.paymentRepo.findOne({ taskBid: acceptedBid });
    }

    // Get bid count
    const bidCount = await this.taskBidRepo.count({ task });

    // Get open flags
    const flags = await this.taskFlagRepo.find({
      task,
      status: FlagStatus.OPEN,
    });

    // Get moderation notes
    const moderationNotes = await this.moderationNoteRepo.find(
      { task },
      {
        populate: ['author'],
        orderBy: { createdAt: 'DESC' },
      },
    );

    // Helper to serialize user with stats for admin view
    const serializeUserWithStats = async (user: User | null) => {
      if (!user) return null;

      const tasksPosted = await this.taskRepo.count({ postedBy: user });
      const tasksCompleted = await this.taskRepo.count({
        assignedTo: user,
        status: TaskStatusEnum.COMPLETED,
      });

      // Calculate rating
      const runnerReviews = await this.taskRepo.find({
        assignedTo: user,
        status: TaskStatusEnum.COMPLETED,
        rating: { $ne: null },
      });

      const posterReviews = await this.taskRepo.find({
        postedBy: user,
        status: TaskStatusEnum.COMPLETED,
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

      return {
        id: user.id,
        uuid: user.uuid || `user-${user.id}`,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phoneNumber,
        avatar: user.profileImage,
        rating: avgRating,
        tasksPosted,
        tasksCompleted,
        joinedAt: user.createdAt,
        verificationStatus: 'UNVERIFIED', // TODO: Add verification status to User entity
      };
    };

    return {
      id: task.publicId,
      title: task.title,
      category: {
        id: task.category.id,
        name: task.category.name,
      },
      description: task.description,
      status: task.status,
      reward: task.reward,
      location: task.location,
      createdAt: task.createdAt,
      updatedAt: task.createdAt, // Task doesn't have updatedAt, using createdAt
      deadline: task.deadline,
      poster: await serializeUserWithStats(task.postedBy),
      assignedTo: task.assignedTo ? await serializeUserWithStats(task.assignedTo) : null,
      requirements: task.requirements || [],
      images: (task.images || []).map((img) => img.url),
      payment: payment
        ? {
            id: payment.id,
            publicId: payment.publicId,
            status: payment.status,
            amount: payment.totalAmount,
            currency: 'NGN',
            escrowedAt: payment.escrowedAt,
            releasedAt: payment.releasedAt,
            refundedAt: payment.refundedAt,
          }
        : null,
      bidCount,
      flags: flags.map((flag) => ({
        id: flag.id,
        reason: flag.reason,
        details: flag.details,
        reportedBy: {
          id: flag.reportedByUserId || flag.reportedByAdminId,
          name: flag.reportedByName,
          role: flag.reportedByRole,
        },
        createdAt: flag.createdAt,
        status: flag.status,
        severity: flag.severity,
      })),
      moderationNotes: moderationNotes.map((note) => ({
        id: note.id,
        content: note.content,
        author: {
          id: note.author.id,
          name: `${note.author.firstName} ${note.author.lastName}`,
        },
        createdAt: note.createdAt,
      })),
    };
  }

  // Enhanced admin get task bids with detailed filters
  async adminGetTaskBidsDetailed(
    publicId: string,
    options?: {
      status?: string;
      sort?: 'created_asc' | 'created_desc' | 'amount_asc' | 'amount_desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const task = await this.taskRepo.findOne({ publicId });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const page = options?.page || 1;
    const pageSize = Math.min(options?.pageSize || 20, 100);
    const offset = (page - 1) * pageSize;

    // Build filter
    const filter: any = { task };
    if (options?.status) {
      filter.status = options.status;
    }

    // Build orderBy
    let orderBy: any = { createdAt: 'DESC' };
    if (options?.sort === 'created_asc') orderBy = { createdAt: 'ASC' };
    else if (options?.sort === 'created_desc') orderBy = { createdAt: 'DESC' };
    else if (options?.sort === 'amount_asc') orderBy = { amount: 'ASC' };
    else if (options?.sort === 'amount_desc') orderBy = { amount: 'DESC' };

    // Get bids with pagination
    const [bids, total] = await this.taskBidRepo.findAndCount(filter, {
      populate: ['createdBy'],
      orderBy,
      limit: pageSize,
      offset,
    });

    // Serialize bid data
    const serializedBids = await Promise.all(
      bids.map(async (bid) => {
        const runnerTasksCompleted = await this.taskRepo.count({
          assignedTo: bid.createdBy,
          status: TaskStatusEnum.COMPLETED,
        });

        return {
          id: bid.id,
          taskId: publicId,
          runner: {
            id: bid.createdBy.id,
            uuid: bid.createdBy.uuid,
            firstName: bid.createdBy.firstName,
            lastName: bid.createdBy.lastName,
            avatar: bid.createdBy.profileImage,
            rating: 0, // Could calculate if needed
            tasksCompleted: runnerTasksCompleted,
            verificationStatus: 'UNVERIFIED', // TODO: Add verification status to User entity
          },
          amount: bid.amount,
          message: bid.message,
          status: bid.status,
          counterOffer: null, // TODO: if needed
          createdAt: bid.createdAt,
          updatedAt: bid.createdAt, // Using createdAt as updatedAt not tracked
        };
      }),
    );

    return {
      bids: serializedBids,
      total,
      page,
      pageSize,
    };
  }

  // Get task activity log
  async adminGetTaskActivity(
    publicId: string,
    options?: {
      type?: ActivityType;
      limit?: number;
      offset?: number;
    },
  ) {
    const task = await this.taskRepo.findOne({ publicId });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const limit = Math.min(options?.limit || 100, 500);
    const offset = options?.offset || 0;

    // Build filter
    const filter: any = { task };
    if (options?.type) {
      filter.type = options.type;
    }

    // Get activities
    const [activities, total] = await this.taskActivityRepo.findAndCount(filter, {
      orderBy: { timestamp: 'DESC' },
      limit,
      offset,
    });

    return {
      activities: activities.map((activity) => ({
        id: activity.id,
        timestamp: activity.timestamp,
        type: activity.type,
        actor: {
          id: activity.actorId,
          name: activity.actorName,
          role: activity.actorRole,
        },
        action: activity.action,
        details: activity.details,
        metadata: activity.metadata,
      })),
      total,
      hasMore: offset + activities.length < total,
    };
  }

  // Admin suspend task
  async adminSuspendTask(publicId: string, dto: SuspendTaskDto, admin: Admin) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'assignedTo'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Validate can suspend
    if (task.status === TaskStatusEnum.COMPLETED) {
      throw new BadRequestException('Cannot suspend completed tasks');
    }

    if (task.status === TaskStatusEnum.CANCELLED) {
      throw new BadRequestException('Cannot suspend cancelled tasks');
    }

    if (task.status === TaskStatusEnum.SUSPENDED) {
      throw new BadRequestException('Task is already suspended');
    }

    const beforeState = { status: task.status };

    // Store previous status for restoration
    task.previousStatus = task.status;
    task.status = TaskStatusEnum.SUSPENDED;

    const afterState = { status: task.status, previousStatus: task.previousStatus };

    // Create audit log
    await this.createAdminAuditLog({
      admin,
      action: 'TASK_SUSPENDED',
      taskId: publicId,
      note: dto.note,
      beforeState,
      afterState,
      metadata: { reason: dto.reason },
    });

    // Create activity log
    await this.createTaskActivity({
      task,
      type: ActivityType.ADMIN_ACTION,
      actorRole: ActorRole.ADMIN,
      actorId: admin.id.toString(),
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: 'Task suspended',
      details: `Reason: ${dto.reason}. Note: ${dto.note}`,
      metadata: { reason: dto.reason, previousStatus: task.previousStatus },
    });

    await this.em.flush();

    // Notify users
    if (dto.notifyUsers) {
      if (task.postedBy) {
        await this.notificationsService.createNotification(
          task.postedBy,
          NotificationType.TASK_STATUS_CHANGED,
          'Task suspended',
          `Your task "${task.title}" has been suspended by admin. Reason: ${dto.reason}`,
          task,
        );
      }
      if (task.assignedTo) {
        await this.notificationsService.createNotification(
          task.assignedTo,
          NotificationType.TASK_STATUS_CHANGED,
          'Task suspended',
          `Task "${task.title}" has been suspended by admin. Reason: ${dto.reason}`,
          task,
        );
      }
    }

    return {
      id: task.publicId,
      status: task.status,
      previousStatus: task.previousStatus,
      updatedAt: new Date(),
    };
  }

  // Admin close task
  async adminCloseTask(publicId: string, dto: CloseTaskDto, admin: Admin) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'assignedTo'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.status === TaskStatusEnum.COMPLETED) {
      throw new BadRequestException('Cannot close completed tasks');
    }

    if (task.status === TaskStatusEnum.CANCELLED) {
      throw new BadRequestException('Task is already cancelled');
    }

    const beforeState = {
      status: task.status,
      assignedTo: task.assignedTo?.id,
    };

    // Store previous status
    task.previousStatus = task.status;
    task.status = TaskStatusEnum.CANCELLED;

    // Handle escrowed payment refund if task was in progress
    let refundAmount = 0;
    if (task.assignedTo) {
      const acceptedBid = await this.taskBidRepo.findOne({
        task,
        status: TaskBidStatus.ACCEPTED,
      });

      if (acceptedBid) {
        const payment = await this.paymentRepo.findOne({ taskBid: acceptedBid });

        if (payment && payment.status === PaymentStatus.ESCROWED) {
          // Refund to poster
          refundAmount = payment.totalAmount;
          payment.status = PaymentStatus.REFUNDED;
          payment.refundedAt = new Date();

          await this.createTaskActivity({
            task,
            type: ActivityType.PAYMENT,
            actorRole: ActorRole.SYSTEM,
            actorId: 'system',
            actorName: 'System',
            action: 'Payment refunded to poster',
            details: `Amount: ₦${refundAmount.toFixed(2)}`,
            metadata: {
              paymentId: payment.id,
              amount: refundAmount,
              reason: 'Task closed by admin',
            },
          });
        }
      }

      // Clear assignment
      task.assignedTo = undefined;
    }

    // Reject all pending bids
    const pendingBids = await this.taskBidRepo.find({
      task,
      status: TaskBidStatus.PENDING,
    });

    for (const bid of pendingBids) {
      bid.status = TaskBidStatus.REJECTED;
      bid.deletedAt = new Date();
    }

    const afterState = {
      status: task.status,
      assignedTo: null,
      refundAmount,
      rejectedBids: pendingBids.length,
    };

    // Create audit log
    await this.createAdminAuditLog({
      admin,
      action: 'TASK_CLOSED',
      taskId: publicId,
      note: dto.note,
      beforeState,
      afterState,
      metadata: { reason: dto.reason },
    });

    // Create activity log
    await this.createTaskActivity({
      task,
      type: ActivityType.ADMIN_ACTION,
      actorRole: ActorRole.ADMIN,
      actorId: admin.id.toString(),
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: 'Task closed',
      details: `Reason: ${dto.reason}. Note: ${dto.note}${refundAmount > 0 ? `. Refunded ₦${refundAmount.toFixed(2)}` : ''}`,
      metadata: {
        reason: dto.reason,
        refundAmount,
        rejectedBids: pendingBids.length,
      },
    });

    await this.em.flush();

    // Notify users
    if (dto.notifyUsers) {
      if (task.postedBy) {
        await this.notificationsService.createNotification(
          task.postedBy,
          NotificationType.TASK_STATUS_CHANGED,
          'Task closed',
          `Your task "${task.title}" has been closed by admin. Reason: ${dto.reason}${refundAmount > 0 ? `. Refund of ₦${refundAmount.toFixed(2)} processed.` : ''}`,
          task,
        );
      }
      if (beforeState.assignedTo) {
        const runner = await this.userRepo.findOne({ id: beforeState.assignedTo });
        if (runner) {
          await this.notificationsService.createNotification(
            runner,
            NotificationType.TASK_STATUS_CHANGED,
            'Task closed',
            `Task "${task.title}" has been closed by admin. Reason: ${dto.reason}`,
            task,
          );
        }
      }
    }

    return {
      id: task.publicId,
      status: task.status,
      refundAmount,
      rejectedBids: pendingBids.length,
      updatedAt: new Date(),
    };
  }

  // Admin reopen task
  async adminReopenTask(publicId: string, dto: ReopenTaskDto, admin: Admin) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'assignedTo'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Can only reopen suspended or cancelled tasks
    if (task.status !== TaskStatusEnum.SUSPENDED && task.status !== TaskStatusEnum.CANCELLED) {
      throw new BadRequestException('Only suspended or cancelled tasks can be reopened');
    }

    const beforeState = { status: task.status };

    // Restore to previous status or default to OPEN if previousStatus is null (legacy tasks)
    const wasLegacyTask = !task.previousStatus;
    const restoredStatus = task.previousStatus || TaskStatusEnum.OPEN;
    task.status = restoredStatus;
    task.previousStatus = undefined;

    const afterState = { status: task.status };

    // Create audit log
    await this.createAdminAuditLog({
      admin,
      action: 'TASK_REOPENED',
      taskId: publicId,
      note: dto.note,
      beforeState,
      afterState,
      metadata: { restoredTo: restoredStatus, wasLegacyTask },
    });

    // Create activity log
    await this.createTaskActivity({
      task,
      type: ActivityType.ADMIN_ACTION,
      actorRole: ActorRole.ADMIN,
      actorId: admin.id.toString(),
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: 'Task reopened',
      details: `${dto.note}. Restored to ${restoredStatus} status.`,
      metadata: { restoredTo: restoredStatus },
    });

    await this.em.flush();

    // Notify users
    if (dto.notifyUsers) {
      if (task.postedBy) {
        await this.notificationsService.createNotification(
          task.postedBy,
          NotificationType.TASK_STATUS_CHANGED,
          'Task reopened',
          `Your task "${task.title}" has been reopened by admin and restored to ${restoredStatus} status.`,
          task,
        );
      }
      if (task.assignedTo) {
        await this.notificationsService.createNotification(
          task.assignedTo,
          NotificationType.TASK_STATUS_CHANGED,
          'Task reopened',
          `Task "${task.title}" has been reopened by admin and restored to ${restoredStatus} status.`,
          task,
        );
      }
    }

    return {
      id: task.publicId,
      status: task.status,
      restoredTo: restoredStatus,
      updatedAt: new Date(),
    };
  }

  // Admin flag task
  async adminFlagTask(publicId: string, dto: FlagTaskDto, admin: Admin) {
    const task = await this.taskRepo.findOne({ publicId });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Create flag
    const flag = this.taskFlagRepo.create({
      task,
      reason: dto.reason,
      details: dto.details,
      severity: dto.severity,
      status: FlagStatus.OPEN,
      reportedByRole: FlagReporterRole.ADMIN,
      reportedByAdminId: admin.id,
      reportedByName: `${admin.firstName} ${admin.lastName}`,
    });

    // Create audit log
    await this.createAdminAuditLog({
      admin,
      action: 'TASK_FLAGGED',
      taskId: publicId,
      metadata: {
        reason: dto.reason,
        details: dto.details,
        severity: dto.severity,
      },
    });

    // Create activity log
    await this.createTaskActivity({
      task,
      type: ActivityType.FLAG,
      actorRole: ActorRole.ADMIN,
      actorId: admin.id.toString(),
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: `Task flagged: ${dto.reason}`,
      details: dto.details,
      metadata: { severity: dto.severity },
    });

    await this.em.persistAndFlush(flag);

    return {
      flagId: flag.id,
      taskId: publicId,
      status: flag.status,
      createdAt: flag.createdAt,
    };
  }

  // Admin clear/resolve flags
  async adminClearFlags(publicId: string, dto: ClearFlagsDto, admin: Admin) {
    const task = await this.taskRepo.findOne({ publicId });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Find all open flags for this task
    const openFlags = await this.taskFlagRepo.find({
      task,
      status: FlagStatus.OPEN,
    });

    // Update all flags to resolved
    openFlags.forEach((flag) => {
      flag.status = FlagStatus.RESOLVED;
      flag.resolution = dto.note;
      flag.resolvedBy = `${admin.firstName} ${admin.lastName}`;
      flag.resolvedAt = new Date();
    });

    // Create audit log
    await this.createAdminAuditLog({
      admin,
      action: 'FLAGS_CLEARED',
      taskId: publicId,
      note: dto.note,
      metadata: {
        resolution: dto.resolution,
        flagsCleared: openFlags.length,
      },
    });

    // Create activity log
    await this.createTaskActivity({
      task,
      type: ActivityType.ADMIN_ACTION,
      actorRole: ActorRole.ADMIN,
      actorId: admin.id.toString(),
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: `Flags cleared (${openFlags.length})`,
      details: `Resolution: ${dto.resolution}. ${dto.note}`,
    });

    await this.em.flush();

    return {
      clearedCount: openFlags.length,
      taskId: publicId,
    };
  }

  // Admin release payment
  async adminReleasePayment(publicId: string, dto: ReleasePaymentDto, admin: Admin) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'assignedTo'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Find accepted bid and payment
    const acceptedBid = await this.taskBidRepo.findOne({
      task,
      status: TaskBidStatus.ACCEPTED,
    });

    if (!acceptedBid) {
      throw new NotFoundException('No accepted bid found for this task');
    }

    const payment = await this.paymentRepo.findOne({ taskBid: acceptedBid });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    // Validate payment is in ESCROWED or COMPLETED status
    if (![PaymentStatus.ESCROWED, PaymentStatus.COMPLETED].includes(payment.status)) {
      throw new BadRequestException(
        `Payment must be in ESCROWED or COMPLETED status. Current status: ${payment.status}`,
      );
    }

    if (payment.status === PaymentStatus.RELEASED) {
      throw new BadRequestException('Payment already released');
    }

    const beforeState = {
      status: payment.status,
      releasedAt: payment.releasedAt,
    };

    // Update payment
    payment.status = PaymentStatus.RELEASED;
    payment.releasedAt = new Date();
    payment.releasedBy = `${admin.firstName} ${admin.lastName}`;
    payment.adminNote = dto.note;

    const afterState = {
      status: payment.status,
      releasedAt: payment.releasedAt,
    };

    // Create audit log
    await this.createAdminAuditLog({
      admin,
      action: 'PAYMENT_RELEASED',
      taskId: publicId,
      note: dto.note,
      beforeState,
      afterState,
      metadata: {
        paymentId: payment.id,
        amount: dto.amount || payment.bidAmount,
      },
    });

    // Create activity log
    await this.createTaskActivity({
      task,
      type: ActivityType.PAYMENT,
      actorRole: ActorRole.ADMIN,
      actorId: admin.id.toString(),
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: 'Payment released to runner',
      details: dto.note,
      metadata: {
        amount: dto.amount || payment.bidAmount,
      },
    });

    await this.em.flush();

    // Optionally notify users
    if (dto.notifyUsers) {
      if (task.assignedTo) {
        await this.notificationsService.createNotification(
          task.assignedTo,
          NotificationType.TASK_STATUS_CHANGED,
          'Payment released',
          `Payment for "${task.title}" has been released to you.`,
          task,
        );
      }
      if (task.postedBy) {
        await this.notificationsService.createNotification(
          task.postedBy,
          NotificationType.TASK_STATUS_CHANGED,
          'Payment released',
          `Payment for "${task.title}" has been released to the runner.`,
          task,
        );
      }
    }

    return {
      success: true,
      payment: {
        id: payment.id,
        publicId: payment.publicId,
        status: payment.status,
        releasedAt: payment.releasedAt,
        amount: payment.bidAmount,
      },
    };
  }

  // Admin refund payment
  async adminRefundPayment(publicId: string, dto: RefundPaymentDto, admin: Admin) {
    const task = await this.taskRepo.findOne(
      { publicId },
      { populate: ['postedBy', 'assignedTo'] },
    );

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Find accepted bid and payment
    const acceptedBid = await this.taskBidRepo.findOne({
      task,
      status: TaskBidStatus.ACCEPTED,
    });

    if (!acceptedBid) {
      throw new NotFoundException('No accepted bid found for this task');
    }

    const payment = await this.paymentRepo.findOne({ taskBid: acceptedBid });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    // Validate payment status
    if (payment.status === PaymentStatus.RELEASED) {
      throw new BadRequestException('Cannot refund a released payment');
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('Payment already refunded');
    }

    const beforeState = {
      status: payment.status,
      refundedAt: payment.refundedAt,
    };

    // Update payment
    payment.status = PaymentStatus.REFUNDED;
    payment.refundedAt = new Date();
    payment.refundedBy = `${admin.firstName} ${admin.lastName}`;
    payment.adminNote = dto.note;

    const afterState = {
      status: payment.status,
      refundedAt: payment.refundedAt,
    };

    // Create audit log
    await this.createAdminAuditLog({
      admin,
      action: 'PAYMENT_REFUNDED',
      taskId: publicId,
      note: dto.note,
      beforeState,
      afterState,
      metadata: {
        paymentId: payment.id,
        reason: dto.reason,
        amount: dto.amount || payment.totalAmount,
      },
    });

    // Create activity log
    await this.createTaskActivity({
      task,
      type: ActivityType.PAYMENT,
      actorRole: ActorRole.ADMIN,
      actorId: admin.id.toString(),
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: 'Payment refunded to poster',
      details: `Reason: ${dto.reason}. ${dto.note}`,
      metadata: {
        amount: dto.amount || payment.totalAmount,
        reason: dto.reason,
      },
    });

    await this.em.flush();

    // Optionally notify users
    if (dto.notifyUsers) {
      if (task.postedBy) {
        await this.notificationsService.createNotification(
          task.postedBy,
          NotificationType.TASK_STATUS_CHANGED,
          'Payment refunded',
          `Payment for "${task.title}" has been refunded to you. Reason: ${dto.reason}`,
          task,
        );
      }
      if (task.assignedTo) {
        await this.notificationsService.createNotification(
          task.assignedTo,
          NotificationType.TASK_STATUS_CHANGED,
          'Payment refunded',
          `Payment for "${task.title}" has been refunded to poster. Reason: ${dto.reason}`,
          task,
        );
      }
    }

    return {
      success: true,
      payment: {
        id: payment.id,
        publicId: payment.publicId,
        status: payment.status,
        refundedAt: payment.refundedAt,
        amount: payment.totalAmount,
      },
    };
  }

  // Admin get bid negotiation history
  async adminGetBidHistory(publicId: string, bidId: string) {
    const task = await this.taskRepo.findOne({ publicId });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const parsedBidId = Number(bidId);
    if (!Number.isInteger(parsedBidId) || parsedBidId <= 0) {
      throw new BadRequestException('Invalid bid id');
    }

    const taskBid = await this.taskBidRepo.findOne(
      { id: parsedBidId, task },
      { populate: ['task', 'createdBy'] },
    );

    if (!taskBid) {
      throw new NotFoundException('Task bid not found');
    }

    // Get negotiation history
    const bidHistory = await this.taskBidNegotiationRepo.find(
      { taskBid },
      {
        orderBy: { createdAt: 'DESC' },
        populate: ['createdBy'],
      },
    );

    return {
      bid: {
        id: taskBid.id,
        amount: taskBid.amount,
        message: taskBid.message,
        status: taskBid.status,
        createdAt: taskBid.createdAt,
        runner: {
          id: taskBid.createdBy.id,
          uuid: taskBid.createdBy.uuid,
          firstName: taskBid.createdBy.firstName,
          lastName: taskBid.createdBy.lastName,
        },
      },
      negotiations: bidHistory.map((negotiation) => ({
        id: negotiation.id,
        amount: negotiation.amount,
        message: negotiation.message,
        role: negotiation.role,
        createdAt: negotiation.createdAt,
        createdBy: {
          id: negotiation.createdBy.id,
          uuid: negotiation.createdBy.uuid,
          firstName: negotiation.createdBy.firstName,
          lastName: negotiation.createdBy.lastName,
        },
      })),
      totalNegotiations: bidHistory.length,
    };
  }

  // Admin add moderation note
  async adminAddModerationNote(publicId: string, dto: AddModerationNoteDto, admin: Admin) {
    const task = await this.taskRepo.findOne({ publicId });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Create moderation note
    const note = this.moderationNoteRepo.create({
      task,
      author: admin,
      content: dto.content,
    });

    // Create activity log (optional, for transparency)
    await this.createTaskActivity({
      task,
      type: ActivityType.ADMIN_ACTION,
      actorRole: ActorRole.ADMIN,
      actorId: admin.id.toString(),
      actorName: `${admin.firstName} ${admin.lastName}`,
      action: 'Moderation note added',
      details: 'Internal admin note added to task',
    });

    await this.em.persistAndFlush(note);

    return {
      id: note.id,
      content: note.content,
      author: {
        id: admin.id,
        name: `${admin.firstName} ${admin.lastName}`,
      },
      createdAt: note.createdAt,
    };
  }
}
