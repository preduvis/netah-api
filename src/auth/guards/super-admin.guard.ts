import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const admin = request.user;

    if (!admin) {
      throw new ForbiddenException('Authentication required');
    }

    // Only allow davidalademerin@gmail.com to access this resource
    if (admin.email !== 'davidalademerin@gmail.com') {
      throw new ForbiddenException(
        'Access denied. This operation is restricted to super administrators only.',
      );
    }

    return true;
  }
}
