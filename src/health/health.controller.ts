import {Controller, Get} from "@nestjs/common";

@Controller("health")
export class HealthController {
    @Get("teste-mesmo")
    teste() {
        return { status: "ok" };
    }
}
