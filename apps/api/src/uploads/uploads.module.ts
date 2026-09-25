import { Global, Module } from '@nestjs/common';
import { FileStorage, LocalDiskStorage } from './storage';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Global()
@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    LocalDiskStorage,
    { provide: FileStorage, useExisting: LocalDiskStorage },
  ],
  exports: [UploadsService, LocalDiskStorage],
})
export class UploadsModule {}
