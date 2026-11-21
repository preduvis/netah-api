import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { cookieExtractor } from './utils/cookie-extractor';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: cookieExtractor,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Validate that payload.sub is a valid number
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return null;
    }

    // Fetch full user to get latest mustChangePassword status
    try {
      const user = await this.usersService.findOne(userId);
      return user;
    } catch (error) {
      // Return minimal user object if fetch fails
      return {
        id: userId,
        email: payload.email,
      };
    }
  }
}
