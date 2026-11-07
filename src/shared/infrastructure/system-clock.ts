import { Injectable } from '@nestjs/common';
import { Clock } from '../application/clock';

@Injectable()
export class SystemClock extends Clock {
    override now(): Date {
        return new Date();
    }
}
