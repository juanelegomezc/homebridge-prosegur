import { PlatformConfig } from "homebridge";
import { Service } from "typedi";

@Service({ transient: true })
export class ConfigService {
    validateConfig(config: PlatformConfig): boolean {
        return (
            this.validateField(config.username, "string") &&
            this.validateField(config.password, "string") &&
            this.validateField(config.country, "country")
        );
    }

    private validateField(value: unknown, type: string): boolean {
        if (value === null || value === undefined) {
            return false;
        }
        switch (type) {
            case "string":
                return (value as string) !== "";
            case "country":
                switch (value) {
                    case "CO":
                    case "ES":
                    case "PT":
                    case "AR":
                        return true;
                    default:
                        return false;
                }
        }
        return false;
    }
}
