import {
    API,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service,
    Characteristic,
} from "homebridge";

import { PLATFORM_NAME, PLUGIN_NAME } from "../settings";
import { InstallationAccesory } from "../accesories/installation.accesory";
import { Container } from "typedi";
import { ProsegurService } from "../services/prosegur.service";

export class ProsegurPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic =
        this.api.hap.Characteristic;

    public readonly accessories: PlatformAccessory[] = [];

    public readonly prosegurService: ProsegurService =
        Container.get(ProsegurService);

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.log.debug("Finished initializing platform:", this.config.name);
        this.prosegurService.init(config, log);
        this.api.on("didFinishLaunching", () => {
            log.debug("Executed didFinishLaunching callback");
            this.discoverDevices();
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.info("Loading accessory from cache:", accessory.displayName);
        this.accessories.push(accessory);
    }

    async discoverDevices(): Promise<void> {
        const installationResponse =
            await this.prosegurService.getInstallations();
        const newAccesories: PlatformAccessory[] = [];
        const existingAccessories: PlatformAccessory[] = [];
        const removedAccesories: PlatformAccessory[] = [];

        for (const installation of installationResponse.data) {
            const uuid = this.api.hap.uuid.generate(
                installation.installationId,
            );

            // see if an accessory with the same uuid has already been registered and restored from the cached devices
            const existingInstallation = this.accessories.find(
                (accessory) => accessory.UUID === uuid,
            );

            if (existingInstallation) {
                // the installation already exists
                this.log.info(
                    "Restoring existing installation from cache:",
                    existingInstallation.displayName,
                );

                existingInstallation.context.installation = installation;
                existingAccessories.push(existingInstallation);
                new InstallationAccesory(this, existingInstallation);
            } else {
                // the installation does not exist, so we need to create it
                this.log.info(
                    "Adding new installation:",
                    installation.description,
                );
                const accessory = new this.api.platformAccessory(
                    installation.description,
                    uuid,
                );
                accessory.context.installation = installation;
                new InstallationAccesory(this, accessory);

                newAccesories.push(accessory);
            }
        }
        this.api.registerPlatformAccessories(
            PLUGIN_NAME,
            PLATFORM_NAME,
            newAccesories,
        );
        this.api.updatePlatformAccessories(existingAccessories);

        const removedInstallations: PlatformAccessory[] =
            this.accessories.filter((existing) =>
                installationResponse.data.find(
                    (installation) =>
                        installation.installationId ===
                        existing.context.installation.installationId,
                )
                    ? false
                    : existing,
            );
        this.api.unregisterPlatformAccessories(
            PLUGIN_NAME,
            PLATFORM_NAME,
            removedAccesories.concat(removedInstallations),
        );
    }
}
