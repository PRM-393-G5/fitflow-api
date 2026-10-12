import { ApiTags } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import type { ApiInfo } from './app.service.js';
import { AppService } from './app.service.js';

@Controller()
@ApiTags('system')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getInfo(): ApiInfo {
    return this.appService.getInfo();
  }
}
