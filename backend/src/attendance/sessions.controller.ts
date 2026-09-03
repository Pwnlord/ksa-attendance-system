import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../identity/decorators/current-user.decorator";
import type { AuthRequestContext } from "../identity/decorators/current-user.decorator";
import { Roles } from "../identity/decorators/roles.decorator";
import { SessionService } from "./session.service";
import {
  CreateSessionDto,
  ExtendSessionDto,
  ReasonedVersionedCommandDto,
  ReopenSessionDto,
  VersionedCommandDto,
} from "./dto/session.dto";

@Controller("sessions")
@Roles("COURSE_REP", "ADMIN")
export class SessionsController {
  constructor(private readonly sessions: SessionService) {}

  @Get("current")
  current() {
    return this.sessions.current().then((data) => ({ data }));
  }

  @Get()
  list(@Query("status") status?: string) {
    return this.sessions.list(status);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() auth: AuthRequestContext, @Body() input: CreateSessionDto) {
    return this.sessions.create(auth.userId, auth.roles, input).then((data) => ({ data }));
  }

  @Get(":sessionId")
  detail(@Param("sessionId") sessionId: string) {
    return this.sessions.detail(sessionId).then((data) => ({ data }));
  }

  @Post(":sessionId/open")
  @HttpCode(HttpStatus.OK)
  open(
    @CurrentUser() auth: AuthRequestContext,
    @Param("sessionId") sessionId: string,
    @Body() input: VersionedCommandDto,
  ) {
    return this.sessions.open(sessionId, auth.userId, auth.roles, input).then((data) => ({ data }));
  }

  @Post(":sessionId/close")
  @HttpCode(HttpStatus.OK)
  close(
    @CurrentUser() auth: AuthRequestContext,
    @Param("sessionId") sessionId: string,
    @Body() input: VersionedCommandDto,
  ) {
    return this.sessions
      .close(sessionId, auth.userId, auth.roles, input)
      .then((data) => ({ data }));
  }

  @Post(":sessionId/extend")
  @HttpCode(HttpStatus.OK)
  extend(
    @CurrentUser() auth: AuthRequestContext,
    @Param("sessionId") sessionId: string,
    @Body() input: ExtendSessionDto,
  ) {
    return this.sessions
      .extend(sessionId, auth.userId, auth.roles, input)
      .then((data) => ({ data }));
  }

  @Post(":sessionId/cancel")
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() auth: AuthRequestContext,
    @Param("sessionId") sessionId: string,
    @Body() input: ReasonedVersionedCommandDto,
  ) {
    return this.sessions
      .cancel(sessionId, auth.userId, auth.roles, input)
      .then((data) => ({ data }));
  }

  @Post(":sessionId/reopen")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  reopen(
    @CurrentUser() auth: AuthRequestContext,
    @Param("sessionId") sessionId: string,
    @Body() input: ReopenSessionDto,
  ) {
    return this.sessions.reopen(sessionId, auth.userId, input).then((data) => ({ data }));
  }

  @Get(":sessionId/attendance")
  attendance(@Param("sessionId") sessionId: string, @Query("query") query?: string) {
    return this.sessions.listAttendance(sessionId, query);
  }
}
