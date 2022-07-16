import {
    Service,
    PlatformAccessory,
    CharacteristicValue,
} from "homebridge";

import { ProsegurPlatform } from "../platforms/prosegur.platform";
import { AlarmStatus } from "../types/alarm-status.enum";

export class InstallationAccesory {
    private service: Service;
    private readonly statesMap = [
        AlarmStatus.PARTIALLY,
        AlarmStatus.ARMED,
        AlarmStatus.PARTIALLY,
        AlarmStatus.DISARMED,
        AlarmStatus.ALARM,
    ];

    private readonly error_map = {
        "error": 0,
        "ok": 1,
    };

    constructor(
        private readonly platform: ProsegurPlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        // set accessory information
        this.accessory
            .getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(
                this.platform.Characteristic.Manufacturer,
                "Prosegur",
            );

        this.service =
            this.accessory.getService(this.platform.Service.SecuritySystem) ||
            this.accessory.addService(this.platform.Service.SecuritySystem);

        this.service.setCharacteristic(
            this.platform.Characteristic.Name,
            accessory.displayName,
        );

        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://developers.homebridge.io/#/service/

        this.service
            .getCharacteristic(
                this.platform.Characteristic.SecuritySystemCurrentState,
            )
            .onGet(this.getStatus.bind(this));
        this.service
            .getCharacteristic(
                this.platform.Characteristic.SecuritySystemTargetState,
            )
            .onSet(this.setStatus.bind(this));
        this.service
            .getCharacteristic(this.platform.Characteristic.StatusFault)
            .onSet(this.getFaultStatus.bind(this));
    }

    async setStatus(value: CharacteristicValue) {
        // implement your own code to turn your device on/off
        const installationId = this.accessory.context.installationId;
        this.platform.prosegurService.setStatus(
            installationId,
            this.statesMap[value as number],
        );
    }

    async getStatus(): Promise<CharacteristicValue> {
        const installationId = this.accessory.context.installationId;
        const status = await this.platform.prosegurService.getStatus(
            installationId,
        );
        return this.statesMap.findIndex((state) => state === status);
    }

    async getFaultStatus(): Promise<CharacteristicValue> {
        const installationId = this.accessory.context.installationId;
        const status = await this.platform.prosegurService.getStatus(
            installationId,
        );
        switch (status) {
            case AlarmStatus.ERROR_ARMED_TOTAL:
            case AlarmStatus.ERROR_ARMED_TOTAL_COMMUNICATIONS:
            case AlarmStatus.ERROR_DISARMED:
            case AlarmStatus.ERROR_DISARMED_COMMUNICATIONS:
            case AlarmStatus.ERROR_PARTIALLY:
            case AlarmStatus.ERROR_PARTIALLY_COMMUNICATIONS:
            case AlarmStatus.GENERAL_ERROR:
                return this.error_map.error;
            default:
                return this.error_map.ok;
        }
    }
}
