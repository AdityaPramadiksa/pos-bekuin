import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, MergeCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  list(@Query('q') q?: string) {
    return this.customers.list(q);
  }

  @Get('suggest')
  suggest(@Query('q') q: string) {
    return this.customers.suggest(q);
  }

  @Get(':id/last-order')
  lastOrder(@Param('id') id: string) {
    return this.customers.lastOrder(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/merge')
  merge(@Param('id') id: string, @Body() dto: MergeCustomerDto) {
    return this.customers.merge(id, dto.duplicateId);
  }
}
