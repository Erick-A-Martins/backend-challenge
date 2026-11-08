import type { INestApplication } from "@nestjs/common";
import { HttpExceptionFilter } from "./shared/interface/http/http-exception.filter";

export function configureApp(app: INestApplication): void {
    app.useGlobalFilters(new HttpExceptionFilter());
}
