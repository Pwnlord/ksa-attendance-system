import { Body, Controller, Get, Patch } from "@nestjs/common";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { AuthRequestContext } from "./decorators/current-user.decorator";
import { Roles } from "./decorators/roles.decorator";
import { CourseConfigService } from "./course-config.service";
import { CourseConfigUpdateDto } from "./dto/course-config.dto";

@Controller("admin/config")
@Roles("ADMIN")
export class AdminConfigController {
  constructor(private readonly config: CourseConfigService) {}

  @Get()
  get() {
    return this.config.get().then((data) => ({ data }));
  }

  @Patch()
  update(@CurrentUser() auth: AuthRequestContext, @Body() input: CourseConfigUpdateDto) {
    return this.config.update(auth.userId, input).then((data) => ({ data }));
  }
}
