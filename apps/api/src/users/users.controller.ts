import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';

type User = { businessId: string };

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.users.list(user.businessId);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body()
    body: { email: string; name: string; password: string; role: string },
  ) {
    return this.users.create(user.businessId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body()
    body: { name?: string; role?: string; isActive?: boolean; password?: string },
  ) {
    return this.users.update(id, user.businessId, body);
  }
}
