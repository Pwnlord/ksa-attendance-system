import { Body, Controller, Get, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "./decorators/current-user.decorator";
import type { AuthRequestContext } from "./decorators/current-user.decorator";
import { IdentityService } from "./identity.service";
import { PhotoChangeService } from "./photo-change.service";
import { PhotoNoteDto } from "./dto/admin.dto";
import { MAX_PHOTO_BYTES } from "./identity.constants";

@Controller("me")
export class MeController {
  constructor(
    private readonly identity: IdentityService,
    private readonly photoChanges: PhotoChangeService,
  ) {}

  @Get()
  async profile(@CurrentUser() auth: AuthRequestContext) {
    const user = await this.identity.findById(auth.userId);
    if (!user) return { data: null };
    return { data: await this.identity.toUser(user) };
  }

  @Patch()
  async updateProfile(
    @CurrentUser() auth: AuthRequestContext,
    @Body() input: import("./dto/auth.dto").ProfileUpdateDto,
  ) {
    return { data: await this.identity.updateOwnProfile(auth.userId, input) };
  }

  @Get("photo-change-requests")
  async photoRequests(@CurrentUser() auth: AuthRequestContext) {
    return this.photoChanges.listOwn(auth.userId);
  }

  @Post("photo-change-requests")
  @UseInterceptors(
    FileInterceptor("identificationPhoto", { limits: { fileSize: MAX_PHOTO_BYTES } }),
  )
  async requestPhotoChange(
    @CurrentUser() auth: AuthRequestContext,
    @UploadedFile()
    file: { buffer: Buffer; size: number; mimetype?: string; originalname?: string } | undefined,
    @Body() input: PhotoNoteDto,
  ) {
    return { data: await this.photoChanges.create(auth.userId, file, input.note) };
  }
}
