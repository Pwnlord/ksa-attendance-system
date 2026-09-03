import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { AuthRequestContext } from "../identity/decorators/current-user.decorator";
import { Roles } from "../identity/decorators/roles.decorator";
import { IdentityService } from "../identity/identity.service";
import { ParticipantSearchQueryDto } from "./dto/review.dto";

@Controller("participants")
@Roles("COURSE_REP", "ADMIN")
export class ParticipantsController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  search(
    @CurrentUser() _auth: AuthRequestContext,
    @Query() input: ParticipantSearchQueryDto,
    @Query("limit") limit?: number,
  ) {
    return this.identity.searchParticipants(input.query, limit);
  }
}
