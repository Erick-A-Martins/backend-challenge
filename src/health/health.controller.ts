import { Controller, Get, Res } from "@nestjs/common";
import { HealthService } from "./health.service";

interface StatusResponse {
    status(code: number): unknown;
}

@Controller("health")
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    @Get("live")
    live() {
        return this.healthService.live();
    }

    @Get("ready")
    async ready(@Res({ passthrough: true }) response: StatusResponse) {
        const result = await this.healthService.ready();
        response.status(result.httpStatus);
        const { httpStatus: _httpStatus, ...body } = result;
        return body;
    }
}
