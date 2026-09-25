import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MAX_UPLOAD_BYTES, UPLOAD_PURPOSES, type UploadPurpose } from '@bekuin/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { UploadsService } from './uploads.service';

@ApiTags('Uploads')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'purpose', enum: UPLOAD_PURPOSES })
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('purpose') purpose: UploadPurpose,
  ) {
    // Bukti bayar diunggah pelanggan lewat endpoint publik (Sprint 3), bukan di sini.
    if (!UPLOAD_PURPOSES.includes(purpose) || purpose === 'proof') {
      throw new BadRequestException('Parameter purpose tidak valid');
    }
    return { url: await this.uploads.saveImage(file, purpose) };
  }
}
