import { Entity, Filter, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
@Filter({
  name: 'softDelete',
  cond: { deletedAt: null },
  default: true, // 👈 automatically applied to all queries
})
export class TaskCategory {
  @PrimaryKey()
  id: number;

  @Property({ unique: true })
  name: string;

  @Property()
  description: string;

  @Property({ nullable: true })
  image?: string; // Cloudinary URL

  @Property({ nullable: true })
  imagePublicId?: string; // Cloudinary public ID for deletion

  @Property({ default: true })
  isActive?: boolean = true;

  @Property({ onCreate: () => new Date() })
  createdAt?: Date;

  @Property({ onUpdate: () => new Date(), nullable: true })
  updatedAt?: Date;

  @Property({ nullable: true })
  deletedAt?: Date;
}
