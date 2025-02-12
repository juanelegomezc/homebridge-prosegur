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
import { Container } from "typedi";
import { ProsegurService } from "../services/prosegur.service";
import { ProsegurInstallation } from "../types/prosegur-response.interface";
import { CameraAccesory } from "../accesories/camera.accessory";
import { InstallationAccesory } from "../accesories/installation.accesory";
import { inspect } from "util";

export class ProsegurPlatform implements DynamicPlatformPlugin {

    public readonly Service: typeof Service;
    public readonly Characteristic: typeof Characteristic;
    public readonly accessories: PlatformAccessory[] = [];
    public readonly prosegurService: ProsegurService = Container.get(ProsegurService);

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API
    ) {
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;
        this.prosegurService.init(config, log);
        this.log.debug("Finished initializing platform:", this.config.name);
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
            const installationResponse = await this.prosegurService.getInstallations();
            const newAccesories: PlatformAccessory[] = [];
            const existingAccessories: PlatformAccessory[] = [];

            for (const installation of installationResponse.data) {
                let newInstallationAccesories: PlatformAccessory[] = [];
                let existingInstallationAccessories: PlatformAccessory[] = [];
                [newInstallationAccesories, existingInstallationAccessories] = this.checkInstallation(installation);
                newAccesories.push(...newInstallationAccesories);
                existingAccessories.push(...existingInstallationAccessories);
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

            this.checkRemovedAccesories(installationResponse.data);
        } catch (error) {
            this.log.error("Error initializing accesories");
            if (error instanceof Error) {
                this.log.error(error.message);
                if (error.stack) {
                    this.log.error(error.stack);
                }
            }
        }
    }

    checkInstallation(installation: ProsegurInstallation): [PlatformAccessory[], PlatformAccessory[]] {
        const newAccesories: PlatformAccessory[] = [];
        const existingAccessories: PlatformAccessory[] = [];
        const uuid = this.api.hap.uuid.generate(
            installation.installationId
        );

        // see if an accessory with the same uuid has already been registered and restored from the cached devices
        const existingInstallation = this.accessories.find(
            (accessory) => accessory.UUID === uuid
        );

        let accessory: PlatformAccessory | undefined;
        if (existingInstallation) {
            // the installation already exists
            this.log.info(
                "Restoring existing installation from cache:",
                existingInstallation.displayName
            );

            existingInstallation.context.installation = installation;
            existingAccessories.push(existingInstallation);
            accessory = existingInstallation;
        } else {
            // the installation does not exist, so we need to create it
            this.log.info(
                "Adding new installation:",
                installation.description
            );
            accessory = new this.api.platformAccessory(
                installation.description,
                uuid
            );
            accessory.context.installation = installation;
            newAccesories.push(accessory);
        }

        try {
            new InstallationAccesory(this, accessory);
        } catch (e) {
            this.log.error("Error creating alarm accesory");
            this.log.error(inspect(e));
        }

        if (this.config.enableVideoCamera && installation.videoDetectors.length > 0) {
            this.log.info("Installation has cameras available");
            installation.videoDetectors.forEach((camera) => {
                this.log.info(`Video Detector: ${JSON.stringify(camera)}`);
                const uuid = this.api.hap.uuid.generate(`${camera.id}`);
                // see if an accessory with the same uuid has already been registered and restored from the cached devices
                const existingCamera = this.accessories.find(
                    (accessory) => accessory.UUID === uuid
                );

                let accessory: PlatformAccessory | undefined;
                if (existingCamera) {
                    // the camera already exists
                    this.log.info(
                        "Restoring existing camera from cache:",
                        existingCamera.displayName
                    );

                    existingCamera.context.camera = camera;
                    existingAccessories.push(existingCamera);
                    accessory = existingCamera;
                } else {
                    // the camera does not exist, so we need to create it
                    this.log.info(
                        "Adding new camera:",
                        camera.description
                    );
                    accessory = new this.api.platformAccessory(
                        camera.description,
                        uuid
                    );
                    accessory.context.camera = camera;
                    newAccesories.push(accessory);
                }

                try {
                    new CameraAccesory(this, accessory);
                } catch (e) {
                    this.log.error("Error creating camera accesory");
                    this.log.error(inspect(e));
                }

            });
        }
        return [newAccesories, existingAccessories];
    }

    checkRemovedAccesories(installation: ProsegurInstallation[]): void {
        const removedAccesories: PlatformAccessory[] =
            this.accessories.filter((existing) =>
                installation.find((installation) => {
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
    }
}
