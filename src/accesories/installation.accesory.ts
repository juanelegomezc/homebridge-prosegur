import {
    Service,
    PlatformAccessory,
    CharacteristicValue,
    Logger,
} from "homebridge";

import { ProsegurPlatform } from "../platforms/prosegur.platform";
import { ProsegurAlarmStatus } from "../types/prosegur-alarm-status.enum";

export class InstallationAccesory {
    private service: Service;
    private readonly statesMap = [
        ProsegurAlarmStatus.PARTIALLY, // STAY_ARM = 0
        ProsegurAlarmStatus.ARMED, // AWAY_ARM = 1
        ProsegurAlarmStatus.PARTIALLY, // NIGHT_ARM = 2
        ProsegurAlarmStatus.DISARMED, // DISARMED = 3
        ProsegurAlarmStatus.ALARM, // ALARM_TRIGGERED = 4
    ];

    private log: Logger;

    constructor(
        private readonly platform: ProsegurPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        this.log = this.platform.log;
        this.service =
            this.accessory.getService(this.platform.Service.SecuritySystem) ??
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
            .setProps({ validValues: [0, 1, 3, 4] })
            .onSet(this.setStatus.bind(this))
            .onGet(this.getStatus.bind(this));

        this.service
            .getCharacteristic(this.platform.Characteristic.StatusFault)
            .onGet(this.getFaultStatus.bind(this));
    }

    async setStatus(value: CharacteristicValue) {
        this.log.debug(
            `Setting installation status, value: ${this.statesMap[value as number]}`
        );
        const installationId =
            this.accessory.context.installation.installationId;
        await this.platform.prosegurService.setStatus(
            installationId,
            this.statesMap[value as number]
        );
        this.getStatus();
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
            case ProsegurAlarmStatus.ERROR_ARMED_TOTAL:
            case ProsegurAlarmStatus.ERROR_ARMED_TOTAL_COMMUNICATIONS:
            case ProsegurAlarmStatus.ERROR_DISARMED:
            case ProsegurAlarmStatus.ERROR_DISARMED_COMMUNICATIONS:
            case ProsegurAlarmStatus.ERROR_PARTIALLY:
            case ProsegurAlarmStatus.ERROR_PARTIALLY_COMMUNICATIONS:
            case ProsegurAlarmStatus.GENERAL_ERROR:
                return this.platform.Characteristic.StatusFault.GENERAL_FAULT;
            default:
                return this.platform.Characteristic.StatusFault.NO_FAULT;
        }
    }
}
