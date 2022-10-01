import {
    Service,
    PlatformAccessory,
    CharacteristicValue,
    Logger,
} from "homebridge";

import { ProsegurPlatform } from "../platforms/prosegur.platform";
import { AlarmStatus } from "../types/alarm-status.enum";

export class AlarmAccesory {
    private service: Service;
    private readonly statesMap = [
        AlarmStatus.PARTIALLY, // STAY_ARM = 0
        AlarmStatus.ARMED, // AWAY_ARM = 1
        AlarmStatus.PARTIALLY, // NIGHT_ARM = 2
        AlarmStatus.DISARMED, // DISARMED = 3
        AlarmStatus.ALARM, // ALARM_TRIGGERED = 4
    ];

    private log: Logger;

    constructor(
        private readonly platform: ProsegurPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        this.log = this.platform.log;
        this.service =
            this.accessory.getService(this.platform.Service.SecuritySystem) ||
            this.accessory.addService(this.platform.Service.SecuritySystem);

        // set accessory information
        this.service
            .setCharacteristic(
                this.platform.Characteristic.Manufacturer,
                "Prosegur"
            )
            .setCharacteristic(
                this.platform.Characteristic.Name,
                accessory.displayName
            )
            .setCharacteristic(
                this.platform.Characteristic.SerialNumber,
                accessory.context.installation.installationId
            );

        this.service
            .getCharacteristic(
                this.platform.Characteristic.SecuritySystemCurrentState
            )
            .onGet(this.getStatus.bind(this));

        this.service
            .getCharacteristic(
                this.platform.Characteristic.SecuritySystemTargetState
            )
            .onSet(this.setStatus.bind(this))
            .onGet(this.getStatus.bind(this));

        this.service
            .getCharacteristic(this.platform.Characteristic.StatusFault)
            .onGet(this.getFaultStatus.bind(this));
    }

    async setStatus(value: CharacteristicValue) {
        this.log.debug(
            `Setting installation status, value: ${
                this.statesMap[value as number]
            }`
        );
        const installationId =
            this.accessory.context.installation.installationId;
        this.platform.prosegurService.setStatus(
            installationId,
            this.statesMap[value as number]
        );
    }

    async getStatus(): Promise<CharacteristicValue> {
        this.log.debug("Requesting installation status");
        const installationId =
            this.accessory.context.installation.installationId;
        const status = await this.platform.prosegurService.getStatus(
            installationId
        );
        this.log.debug(`Status: ${status}`);
        return this.statesMap.findIndex((state) => state === status);
    }

    async getFaultStatus(): Promise<CharacteristicValue> {
        this.log.debug("Requesting installation fault status");
        const installationId =
            this.accessory.context.installation.installationId;
        const status = await this.platform.prosegurService.getStatus(
            installationId
        );
        switch (status) {
            case AlarmStatus.ERROR_ARMED_TOTAL:
            case AlarmStatus.ERROR_ARMED_TOTAL_COMMUNICATIONS:
            case AlarmStatus.ERROR_DISARMED:
            case AlarmStatus.ERROR_DISARMED_COMMUNICATIONS:
            case AlarmStatus.ERROR_PARTIALLY:
            case AlarmStatus.ERROR_PARTIALLY_COMMUNICATIONS:
            case AlarmStatus.GENERAL_ERROR:
                return this.platform.Characteristic.StatusFault.GENERAL_FAULT;
            default:
                return this.platform.Characteristic.StatusFault.NO_FAULT;
        }
    }
}
