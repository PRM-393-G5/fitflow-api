import { ApiTags } from '@nestjs/swagger';
import { Controller, Get, Header } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';
import type { TemplateJson } from './templates.service.js';

/** Built-in workout plans; public, like the old Firestore collection. */
@Controller('templates')
@ApiTags('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** Changes only when the seed runs, so clients/proxies may cache it. */
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  findAll(): Promise<TemplateJson[]> {
    return this.templates.findAll();
  }
}
