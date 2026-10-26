import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { TemplatesService } from '../../templates/templates.service.js';
import type { AdminTemplateJson } from '../../templates/templates.service.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import {
  CreateTemplateDto,
  ReorderTemplatesDto,
  TemplateBodyDto,
} from './dto/template.dto.js';

/**
 * Manages the public workout templates the app downloads. The app's
 * `GET /api/templates` is cacheable for 5 minutes, so edits can take that
 * long to reach devices.
 */
@Controller('admin/templates')
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
export class AdminTemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** Every template in display order, with `updatedAt`. */
  @Get()
  list(): Promise<AdminTemplateJson[]> {
    return this.templates.findAllForAdmin();
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<AdminTemplateJson> {
    return orNotFound(await this.templates.findOne(id), id);
  }

  /** Adds a template at the end of the list; 409 if the id is taken. */
  @Post()
  create(@Body() body: CreateTemplateDto): Promise<AdminTemplateJson> {
    return this.templates.create(body);
  }

  /** Body: every template id in the new order → the reordered list. */
  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  reorder(@Body() body: ReorderTemplatesDto): Promise<AdminTemplateJson[]> {
    return this.templates.reorder(body.ids);
  }

  /** Replaces everything but the id and the position. */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: TemplateBodyDto,
  ): Promise<AdminTemplateJson> {
    return orNotFound(await this.templates.update(id, body), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    if (!(await this.templates.remove(id))) throw notFound(id);
  }
}

const notFound = (id: string) =>
  new NotFoundException(`Template ${id} not found`);

function orNotFound<T>(value: T | null, id: string): T {
  if (value === null) throw notFound(id);
  return value;
}
