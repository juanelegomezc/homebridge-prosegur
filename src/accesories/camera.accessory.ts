import {
    PlatformAccessory,
    CameraStreamingDelegate,
    PrepareStreamCallback,
    PrepareStreamRequest,
    SnapshotRequest,
    SnapshotRequestCallback,
    StreamingRequest,
    StreamRequestCallback,
    PlatformAccessoryEvent,
    CameraControllerOptions,
    CameraController,
} from "homebridge";
import Container from "typedi";

import { ProsegurPlatform } from "../platforms/prosegur.platform";
import { CameraManagerService } from "../services/camera-manager.service";

export class CameraAccesory implements CameraStreamingDelegate {

    private controller?: CameraController;
    private cameraManager: CameraManagerService = Container.get(CameraManagerService);

    constructor(
        private readonly platform: ProsegurPlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        this.cameraManager.init(accessory.context.camera.id, this.platform.prosegurService, this.platform.log);
        this.accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
            this.platform.log.debug("%s identified!", accessory.displayName);
        });
        const options: CameraControllerOptions = {
            cameraStreamCount: 2, // HomeKit requires at least 2 streams, but 1 is also just fine
            delegate: this,

            streamingOptions: {
                supportedCryptoSuites: [
                    this.platform.api.hap.SRTPCryptoSuites.NONE,
                    this.platform.api.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
                ],
                video: {
                    codec: {
                        profiles: [
                            this.platform.api.hap.H264Profile.BASELINE,
                            this.platform.api.hap.H264Profile.MAIN,
                            this.platform.api.hap.H264Profile.HIGH,
                        ],
                        levels: [
                            this.platform.api.hap.H264Level.LEVEL3_1,
                            this.platform.api.hap.H264Level.LEVEL3_2,
                            this.platform.api.hap.H264Level.LEVEL4_0,
                        ],
                    },
                    resolutions: [
                        [1920, 1080, 30],
                        [1280, 960, 30],
                        [1280, 720, 30],
                        [1024, 768, 30],
                        [640, 480, 30],
                        [640, 360, 30],
                        [480, 360, 30],
                        [480, 270, 30],
                        [320, 240, 30],
                        [320, 240, 15],
                        [320, 180, 30],
                    ],
                },
                /* audio option is omitted, as it is not supported in this example; HAP-NodeJS will fake an appropriate audio codec
              audio: {
                  comfort_noise: false, // optional, default false
                  codecs: [
                      {
                          type: AudioStreamingCodecType.OPUS,
                          audioChannels: 1, // optional, default 1
                          samplerate: [AudioStreamingSamplerate.KHZ_16, AudioStreamingSamplerate.KHZ_24],
                          // 16 and 24 must be present for AAC-ELD or OPUS
                      },
                  ],
              },
              // */
            },
        };
        const cameraController = new this.platform.api.hap.CameraController(options);
        this.controller = cameraController;
        this.accessory.configureController(cameraController);
    }

    handleSnapshotRequest(
        request: SnapshotRequest,
        callback: SnapshotRequestCallback,
    ): void {
        this.cameraManager.getSnapshot(request.width, request.height)
            .then(buffer => {
                this.platform.log.debug("Snapshot received " + buffer.byteLength + " bytes");
                return callback(undefined, buffer);
            })
            .catch(error => {
                this.platform.log.error("Error receiving snapshot");
                this.platform.log.error(error);
                return callback(error, undefined);
            });
    }

    prepareStream(
        request: PrepareStreamRequest,
        callback: PrepareStreamCallback,
    ): void {
        callback(new Error("Not implemented"), undefined);
    }

    handleStreamRequest(
        request: StreamingRequest,
        callback: StreamRequestCallback,
    ): void {
        callback(new Error("Not implemented"));
    }
}
