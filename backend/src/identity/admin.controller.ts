import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { AuthRequestContext } from "./decorators/current-user.decorator";
import { Roles } from "./decorators/roles.decorator";
import { IdentityService } from "./identity.service";
import { PhotoChangeService } from "./photo-change.service";
import { RoleService } from "./role.service";
import { RosterService } from "./roster.service";
import {
  AssignCourseRepDto,
  GrantAdminDto,
  ReasonDto,
  ReviewDecisionDto,
  RosterEntryUpdateDto,
} from "./dto/admin.dto";

@Controller("admin")
@Roles("ADMIN")
export class AdminController {
  constructor(
    private readonly roster: RosterService,
    private readonly photos: PhotoChangeService,
    private readonly roles: RoleService,
    private readonly identity: IdentityService,
  ) {}

  @Get("roster")
  listRoster(
    @Query()
    query: {
      status?: "UNCLAIMED" | "CLAIMED" | "DISABLED";
      query?: string;
      limit?: number;
    },
  ) {
    return this.roster.list(query);
  }

  @Post("roster")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importRoster(
    @CurrentUser() auth: AuthRequestContext,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
    @Body("reason") reason: string,
  ) {
    return { data: await this.roster.importCsv(file?.buffer, auth.userId, reason) };
  }

  @Patch("roster/:rosterEntryId")
  async updateRoster(
    @CurrentUser() auth: AuthRequestContext,
    @Param("rosterEntryId") id: string,
    @Body() input: RosterEntryUpdateDto,
  ) {
    return { data: await this.roster.update(id, input, auth.userId) };
  }

  @Get("photo-change-requests")
  listPhotoRequests(@Query("status") status?: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED") {
    return this.photos.listAdmin(status);
  }

  @Get("photo-change-requests/:requestId")
  getPhotoRequest(@Param("requestId") id: string) {
    return this.photos.detail(id, true).then((data) => ({ data }));
  }

  @Post("photo-change-requests/:requestId/approve")
  @HttpCode(HttpStatus.OK)
  approvePhotoRequest(
    @CurrentUser() auth: AuthRequestContext,
    @Param("requestId") id: string,
    @Body() input: ReviewDecisionDto,
  ) {
    return this.photos
      .decide(id, auth.userId, input.expectedVersion, input.reason, true)
      .then((data) => ({ data }));
  }

  @Post("photo-change-requests/:requestId/reject")
  @HttpCode(HttpStatus.OK)
  rejectPhotoRequest(
    @CurrentUser() auth: AuthRequestContext,
    @Param("requestId") id: string,
    @Body() input: ReviewDecisionDto,
  ) {
    return this.photos
      .decide(id, auth.userId, input.expectedVersion, input.reason, false)
      .then((data) => ({ data }));
  }

  @Put("roles/course-representative")
  async replaceCourseRep(
    @CurrentUser() auth: AuthRequestContext,
    @Body() input: AssignCourseRepDto,
  ) {
    await this.roles.replaceCourseRep(
      auth.userId,
      input.participantId,
      input.reason,
      input.currentPassword,
    );
    const user = await this.identity.findById(input.participantId);
    if (!user) throw new Error("Assigned participant was not found.");
    return { data: await this.identity.toUser(user) };
  }

  @Get("roles/admins")
  async listAdmins() {
    const entries = await this.identity.activeAdministrators();
    return { items: await Promise.all(entries.map((user) => this.identity.toUser(user))) };
  }

  @Post("roles/admins")
  async grantAdmin(@CurrentUser() auth: AuthRequestContext, @Body() input: GrantAdminDto) {
    await this.roles.grantAdmin(auth.userId, input.userId, input.reason, input.currentPassword);
    const user = await this.identity.findById(input.userId);
    if (!user) throw new Error("Granted account was not found.");
    return { data: await this.identity.toUser(user) };
  }

  @Post("roles/admins/:userId/revoke")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAdmin(
    @CurrentUser() auth: AuthRequestContext,
    @Param("userId") userId: string,
    @Body() input: ReasonDto,
  ): Promise<void> {
    await this.roles.revokeAdmin(auth.userId, userId, input.reason, input.currentPassword);
  }
}
