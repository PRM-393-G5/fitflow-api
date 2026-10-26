import { ApiTags } from '@nestjs/swagger';
import { Controller, Get, Header } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';
import type { TemplateJson } from './templates.service.js';

/** Built-in workout plans; public, like the old Firestore collection. */
@Controller('templates')
@ApiTags('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /**
   * Edited from the admin web, but rarely: clients and proxies may cache
   * it for 5 minutes (the app refreshes templates on start and keeps its
   * cached copy offline).
   */
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  findAll(): Promise<TemplateJson[]> {
    return this.templates.findAll();
  }
}
