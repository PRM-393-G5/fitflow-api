import { Controller, Get } from '@nestjs/common';
import { TemplatesService } from './templates.service.js';
import type { TemplateJson } from './templates.service.js';

/** Built-in workout plans; public, like the old Firestore collection. */
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  findAll(): Promise<TemplateJson[]> {
    return this.templates.findAll();
  }
}
