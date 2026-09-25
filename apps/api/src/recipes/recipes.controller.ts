import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipe.dto';
import { RecipesService } from './recipes.service';

@ApiTags('Recipes')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  list() {
    return this.recipes.list();
  }

  /** Resep + rincian biaya per bahan. */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.recipes.get(id);
  }

  @Get(':id/cost')
  cost(@Param('id') id: string) {
    return this.recipes.get(id);
  }

  @Post()
  create(@Body() dto: CreateRecipeDto) {
    return this.recipes.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRecipeDto) {
    return this.recipes.update(id, dto);
  }
}
