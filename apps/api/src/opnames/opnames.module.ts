import { Module } from '@nestjs/common';
import { OpnamesController } from './opnames.controller';
import { OpnamesService } from './opnames.service';

@Module({ controllers: [OpnamesController], providers: [OpnamesService] })
export class OpnamesModule {}
