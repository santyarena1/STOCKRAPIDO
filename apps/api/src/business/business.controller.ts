import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BusinessService } from './business.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateBusinessDto } from './dto/update-business.dto';

type User = { businessId: string };

@Controller('business')
@UseGuards(JwtAuthGuard)
export class BusinessController {
  constructor(private business: BusinessService) {}

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.business.getByUser(user.businessId);
  }

  @Patch('me')
  update(@CurrentUser() user: User, @Body() body: UpdateBusinessDto) {
    return this.business.update(user.businessId, body);
  }

  @Get('categories')
  categories(@CurrentUser() user: User) {
    return this.business.listCategories(user.businessId);
  }

  @Post('categories')
  createCategory(@CurrentUser() user: User, @Body() body: { name: string }) {
    return this.business.createCategory(user.businessId, body.name);
  }
}
