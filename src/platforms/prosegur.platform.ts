import {
    API,
    APIEvent,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service,
    Characteristic,
} from "homebridge";

import { PLATFORM_NAME, PLUGIN_NAME } from "../settings";
import { AlarmAccesory } from "../accesories/alarm.accesory";
import { Container } from "typedi";
import { ProsegurService } from "../services/prosegur.service";
import { CameraAccesory } from "../accesories/camera.accessory";

export class ProsegurPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic =
        this.api.hap.Characteristic;

    public readonly accessories: PlatformAccessory[] = [];

    public readonly prosegurService: ProsegurService = Container.get(ProsegurService);

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API
    ) {
        this.log.debug("Finished initializing platform:", this.config.name);
        this.prosegurService.init(config, log);
        this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
            this.discoverDevices();
        });
    }

    configureAccessory(accessory: PlatformAccessory): void {
        this.log.info("Loading accessory from cache:", accessory.displayName);
        this.accessories.push(accessory);
    }

    async discoverDevices(): Promise<void> {
        this.log.info("Discovering devices");
        try {
            const installationResponse =
                await this.prosegurService.getInstallations();
            const newAccesories: PlatformAccessory[] = [];
            const existingAccessories: PlatformAccessory[] = [];

            for (const installation of installationResponse.data) {
                const uuid = this.api.hap.uuid.generate(
                    installation.installationId
                );

                // see if an accessory with the same uuid has already been registered and restored from the cached devices
                const existingInstallation = this.accessories.find(
                    (accessory) => accessory.UUID === uuid
                );

                if (existingInstallation) {
                    // the installation already exists
                    this.log.info(
                        "Restoring existing installation from cache:",
                        existingInstallation.displayName
                    );

                    existingInstallation.context.installation = installation;
                    existingAccessories.push(existingInstallation);
                    new AlarmAccesory(this, existingInstallation);
                } else {
                    // the installation does not exist, so we need to create it
                    this.log.info(
                        "Adding new installation:",
                        installation.description
                    );
                    const accessory = new this.api.platformAccessory(
                        installation.description,
                        uuid
                    );
                    accessory.context.installation = installation;
                    new AlarmAccesory(this, accessory);

                    newAccesories.push(accessory);
                }
                if (installation.videoDetectors.length > 0) {
                    this.log.info("Installation has cameras available");
                    installation.videoDetectors.forEach((camera) => {
                        this.log.info(`${JSON.stringify(camera)}`);
                        const uuid = this.api.hap.uuid.generate(`${camera.id}`);
                        // see if an accessory with the same uuid has already been registered and restored from the cached devices
                        const existingCamera = this.accessories.find(
                            (accessory) => accessory.UUID === uuid
                        );

                        if (existingCamera) {
                            // the camera already exists
                            this.log.info(
                                "Restoring existing camera from cache:",
                                existingCamera.displayName
                            );

                            existingCamera.context.camera = camera;
                            existingAccessories.push(existingCamera);
                            new CameraAccesory(this, existingCamera);
                        } else {
                            // the camera does not exist, so we need to create it
                            this.log.info(
                                "Adding new camera:",
                                camera.description
                            );
                            const accessory = new this.api.platformAccessory(
                                camera.description,
                                uuid
                            );
                            accessory.context.camera = camera;
                            new CameraAccesory(this, accessory);

                            newAccesories.push(accessory);
                        }
                    });
                }
            }
            if (newAccesories.length > 0) {
                this.log.info(
                    "Register new accesories:" +
                    newAccesories.map((item) => item.displayName)
                );
                this.api.registerPlatformAccessories(
                    PLUGIN_NAME,
                    PLATFORM_NAME,
                    newAccesories
                );
            }

            if (existingAccessories.length > 0) {
                this.log.info(
                    "Register existing accesories:" +
                    existingAccessories.map((item) => item.displayName)
                );
                this.api.updatePlatformAccessories(existingAccessories);
            }

            const removedAccesories: PlatformAccessory[] =
                this.accessories.filter((existing) =>
                    installationResponse.data.find((installation) => {
                        if (existing.context.installation) {
                            return (
                                installation.installationId ===
                                existing.context.installation.installationId
                            );
                        } else if (existing.context.camera) {
                            return installation.videoDetectors.find(
                                (camera) =>
                                    camera.id === existing.context.camera.id
                            );
                        }
                    })
                        ? false
                        : existing
                );
            if (removedAccesories.length > 0) {
                this.log.info(
                    "Removing accesories:" +
                    removedAccesories.map((item) => item.displayName)
                );
                this.api.unregisterPlatformAccessories(
                    PLUGIN_NAME,
                    PLATFORM_NAME,
                    removedAccesories
                );
            }
        } catch (error) {
            this.log.error("Error initializing accesories");
            if (error instanceof Error) {
                this.log.error(error.message);
                if (error.stack) {
                    this.log.error(error.stack!);
                }
            }
        }
    }
}
