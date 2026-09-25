import { Body, Controller, Get, Param, ParseBoolPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateIngredientDto, UpdateIngredientDto } from './dto/ingredient.dto';
import { IngredientsService } from './ingredients.service';

@ApiTags('Ingredients')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredients: IngredientsService) {}

  @Get()
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'type', required: false, enum: ['RAW', 'SEMI_FINISHED', 'PACKAGING'] })
  list(
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
    @Query('type') type?: string,
  ) {
    return this.ingredients.list(!!includeInactive, type);
  }

  @Post()
  create(@Body() dto: CreateIngredientDto) {
    return this.ingredients.create(dto);
  }

  /** Tidak ada hapus permanen: nonaktifkan lewat isActive = false. */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIngredientDto) {
    return this.ingredients.update(id, dto);
  }
}
