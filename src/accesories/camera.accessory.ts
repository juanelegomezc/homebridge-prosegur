import { ChildProcessWithoutNullStreams } from "child_process";
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
    StreamSessionIdentifier,
    PrepareStreamResponse,
    StreamRequestTypes,
    StartStreamRequest,
    AudioStreamingCodecType,
    ReconfiguredVideoInfo,
} from "homebridge";
import Container from "typedi";

import { ProsegurPlatform } from "../platforms/prosegur.platform";
import { CameraManagerService } from "../services/camera-manager.service";
import { SessionInfo } from "../types/session-info.type";

import pickPort from "pick-port";
import pathToFfmpeg from "ffmpeg-for-homebridge";
import { FfmpegProcess } from "../services/ffmpeg-process";
import { createSocket, Socket } from "dgram";
import { ResolutionInfo } from "../types/resolution-info.type";

type ActiveSession = {
    mainProcess?: FfmpegProcess;
    returnProcess?: FfmpegProcess;
    timeout?: NodeJS.Timeout;
    socket?: Socket;
};

export class CameraAccesory implements CameraStreamingDelegate {
    public controller?: CameraController;
    private cameraManager: CameraManagerService =
        Container.get(CameraManagerService);

    private pendingSessions: StreamSessionIdentifier[] = [];
    private ongoingSessions: ChildProcessWithoutNullStreams[] = [];

    constructor(
        public readonly platform: ProsegurPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        this.cameraManager.init(
            accessory.context.camera.id,
            this.platform.prosegurService,
            this.platform.log
        );
        this.accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
            this.platform.log.debug("%s identified!", accessory.displayName);
        });
        const options: CameraControllerOptions = {
            cameraStreamCount: 2,
            delegate: this,

            streamingOptions: {
                supportedCryptoSuites: [
                    this.platform.api.hap.SRTPCryptoSuites
                        .AES_CM_128_HMAC_SHA1_80,
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
                        [320, 180, 30],
                        [320, 240, 15], // Apple Watch requires this configuration
                        [320, 240, 30],
                        [480, 270, 30],
                        [480, 360, 30],
                        [640, 360, 30],
                        [640, 480, 30],
                        [1280, 720, 30],
                        [1280, 960, 30],
                        [1920, 1080, 30],
                        [1600, 1200, 30],
                    ],
                },
                audio: accessory.context.camera.playAudioSupport
                    ? {
                        twoWayAudio:
                              accessory.context.camera.microphoneSupport,
                        codecs: [
                            {
                                type: this.platform.api.hap
                                    .AudioStreamingCodecType.AAC_ELD,
                                samplerate:
                                      this.platform.api.hap
                                          .AudioStreamingSamplerate.KHZ_16,
                            },
                        ],
                    }
                    : undefined,
            },
        };
        this.controller = new this.platform.api.hap.CameraController(options);
        this.accessory.configureController(this.controller);
    }

    handleSnapshotRequest(
        request: SnapshotRequest,
        callback: SnapshotRequestCallback
    ): void {
        this.cameraManager
            .getSnapshot(request.width, request.height)
            .then((buffer) => {
                this.platform.log.debug(
                    "Snapshot received: " + buffer.byteLength + " bytes total"
                );
                return callback(undefined, buffer);
            })
            .catch((error) => {
                this.platform.log.error("Error receiving snapshot");
                this.platform.log.error(error);
                return callback(error, undefined);
            });
    }

    async prepareStream(
        request: PrepareStreamRequest,
        callback: PrepareStreamCallback
    ): Promise<void> {
        const sessionId: StreamSessionIdentifier = request.sessionID;
        const targetAddress = request.targetAddress;

        const video = request.video;
        const videoPort = video.port;
        const ipv6 = request.addressVersion === "ipv6";
        const videoReturnPort = await pickPort({
            type: "udp",
            ip: ipv6 ? "::" : "0.0.0.0",
            reserveTimeout: 15,
        });

        const videoCryptoSuite = video.srtpCryptoSuite;
        const videoSrtpKey = video.srtp_key;
        const videoSrtpSalt = video.srtp_salt;

        const videoSSRC =
            this.platform.api.hap.CameraController.generateSynchronisationSource();

        const sessionInfo: SessionInfo = {
            address: targetAddress,
            ipv6,
            videoPort,
            videoReturnPort,
            videoCryptoSuite,
            videoSRTP: Buffer.concat([videoSrtpKey, videoSrtpSalt]),
            videoSSRC,
        };

        const response: PrepareStreamResponse = {
            video: {
                port: videoReturnPort,
                ssrc: videoSSRC,

                srtp_key: videoSrtpKey,
                srtp_salt: videoSrtpSalt,
            },
        };

        if (this.accessory.context.camera.playAudioSupport) {
            const audio = request.audio;
            const audioPort = audio.port;
            const audioReturnPort = await pickPort({
                type: "udp",
                ip: ipv6 ? "::" : "0.0.0.0",
                reserveTimeout: 15,
            });

            const audioCryptoSuite = audio.srtpCryptoSuite;
            const audioSrtpKey = audio.srtp_key;
            const audioSrtpSalt = audio.srtp_salt;

            const audioSSRC =
                this.platform.api.hap.CameraController.generateSynchronisationSource();

            sessionInfo.audioPort = audioPort;
            sessionInfo.audioReturnPort = audioReturnPort;
            sessionInfo.audioCryptoSuite = audioCryptoSuite;
            sessionInfo.audioSRTP = Buffer.concat([
                audioSrtpKey,
                audioSrtpSalt,
            ]);
            sessionInfo.audioSSRC = audioSSRC;
            response.audio = {
                port: audioReturnPort,
                ssrc: audioSSRC,

                srtp_key: audioSrtpKey,
                srtp_salt: audioSrtpSalt,
            };
        }

        this.pendingSessions[sessionId] = sessionInfo;
        callback(undefined, response);
    }

    private determineResolution(request: ReconfiguredVideoInfo): ResolutionInfo {
        const resInfo: ResolutionInfo = {
            width: request.width,
            height: request.height,
        };

        const filters: Array<string> = [];
        const noneFilter = filters.indexOf("none");
        if (noneFilter >= 0) {
            filters.splice(noneFilter, 1);
        }
        resInfo.snapFilter = filters.join(",");
        if ((noneFilter < 0) && (resInfo.width > 0 || resInfo.height > 0)) {
            resInfo.resizeFilter = "scale=" + (resInfo.width > 0 ? "'min(" + resInfo.width + ",iw)'" : "iw") + ":" +
          (resInfo.height > 0 ? "'min(" + resInfo.height + ",ih)'" : "ih") +
          ":force_original_aspect_ratio=decrease";
            filters.push(resInfo.resizeFilter);
            filters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2"); // Force to fit encoder restrictions
        }

        if (filters.length > 0) {
            resInfo.videoFilter = filters.join(",");
        }

        return resInfo;
    }

    private async startStream(
        request: StartStreamRequest,
        callback: StreamRequestCallback
    ): Promise<void> {
        const sessionInfo: SessionInfo =
            this.pendingSessions[request.sessionID];

        if (sessionInfo) {
            this.platform.log.debug(JSON.stringify(sessionInfo));
            const vcodec = "libx264";
            const encoderOptions = [
                "-preset ultrafast",
                "-tune zerolatency",
            ];
            const mtu = 1316;

            this.platform.log.debug(
                "Starting video stream: " +
                    request.video.width +
                    " x " +
                    request.video.height +
                    ", " +
                    request.video.fps +
                    " fps, " +
                    request.video.max_bit_rate +
                    " kbps" +
                    (this.accessory.context.camera.playAudioSupport
                        ? " (" + request.audio.codec + ")"
                        : ""),
                this.accessory.displayName
            );
            const resolutionInfo = this.determineResolution(request.video);
            const streamUrl = await this.cameraManager.getStreamUrl();
            let ffmpegArgs: string[] = [];
            ffmpegArgs.push(`-i ${streamUrl[0].urls.rtsp}`);
            ffmpegArgs.push("-an"); // Skip inclusion of Audio
            ffmpegArgs.push("-sn"); // Skip inclusion of Subtitles
            ffmpegArgs.push("-dn"); // Skip inclusion of Data
            ffmpegArgs.push(`-codec:v ${vcodec}`); // Encode the video to H.264
            ffmpegArgs.push("-pix_fmt yuv420p"); // Sets the pixel format
            ffmpegArgs.push("-color_range mpeg"); // Color range from the source video
            ffmpegArgs.push("-rtsp_transport udp"); // Set rtsp transport as UDP
            if(request.video.fps > 0) {
                ffmpegArgs.push(`-r ${request.video.fps}`); // Force the frame rate to the requested fps
            }
            ffmpegArgs.push("-f rawvideo"); // Force input format
            ffmpegArgs = ffmpegArgs.concat(encoderOptions);     // https://trac.ffmpeg.org/wiki/Encode/H.264#a2.Chooseapresetandtune

            if(resolutionInfo.videoFilter) {
                ffmpegArgs.push(`-filter:v ${resolutionInfo.videoFilter}`); // Resize video
            }

            ffmpegArgs.push(`-b:v ${request.video.max_bit_rate}k`); // Set bitrate
            ffmpegArgs.push(`-payload_type ${request.video.pt}`); // Set the payload type

            // Video Stream
            ffmpegArgs.push(`-ssrc ${sessionInfo.videoSSRC}`); // Video syncronization source
            ffmpegArgs.push("-f rtp"); // Force video output format rtp
            ffmpegArgs.push("-srtp_out_suite AES_CM_128_HMAC_SHA1_80"); // secure rtp
            ffmpegArgs.push(`-srtp_out_params ${sessionInfo.videoSRTP.toString("base64")}`); // srtp key and salt
            ffmpegArgs.push(`srtp://${sessionInfo.address}:${sessionInfo.videoPort}?rtcpport=${sessionInfo.videoPort}&pkt_size=${mtu}`); // video Output url

            if (sessionInfo.audioSSRC) {
                if (
                    request.audio.codec === AudioStreamingCodecType.OPUS ||
                    request.audio.codec === AudioStreamingCodecType.AAC_ELD
                ) {
                    ffmpegArgs.push("-vn"); // Skip inclusion of video
                    ffmpegArgs.push("-sn"); // Skip the inclusion of subtitles
                    ffmpegArgs.push("-dn"); // Skip the inclusion of data

                    // Sets the codec based on requested values
                    if(request.audio.codec === AudioStreamingCodecType.OPUS) {
                        ffmpegArgs.push("-codec:a libopus");
                        ffmpegArgs.push("-application lowdelay");
                    } else {
                        ffmpegArgs.push("-codec:a libfdk_aac");
                        ffmpegArgs.push(" -profile:a aac_eld");
                    }

                    ffmpegArgs.push("-flags +global_header"); // Places a global header
                    ffmpegArgs.push(`-ar ${request.audio.sample_rate}k`); // Set output audio sample rate
                    ffmpegArgs.push(`-b:a ${request.audio.max_bit_rate}k`); // Set output audio max bit rate
                    ffmpegArgs.push(`-ac ${request.audio.channel}`); // Set output audio channels
                    ffmpegArgs.push(`-payload_type ${request.audio.pt}`); // Set output audio payload type

                    // Audio Stream
                    ffmpegArgs.push(`-ssrc ${sessionInfo.audioSSRC}`); // Audio syncronization source
                    ffmpegArgs.push("-f rtp"); // Force audio output to rtp
                    ffmpegArgs.push("-srtp_out_suite AES_CM_128_HMAC_SHA1_80"); // Secure rtp
                    ffmpegArgs.push(`-srtp_out_params ${sessionInfo.audioSRTP!.toString("base64")}`); // srtp key and salt
                    ffmpegArgs.push(`srtp://${sessionInfo.address}:${sessionInfo.audioPort}?rtcpport=${sessionInfo.audioPort}&pkt_size=188`); // Audio output URL
                } else {
                    this.platform.log.error(
                        "Unsupported audio codec requested: " +
                            request.audio.codec,
                        this.accessory.displayName
                    );
                }
            }
            ffmpegArgs.push("-loglevel level+verbose");
            ffmpegArgs.push("-progress pipe:1");
            const activeSession: ActiveSession = {};

            activeSession.socket = createSocket(
                sessionInfo.ipv6 ? "udp6" : "udp4"
            );
            activeSession.socket.on("error", (err: Error) => {
                this.platform.log.error(
                    "Socket error: " + err.message,
                    this.accessory.displayName
                );
                this.stopStream(request.sessionID);
            });
            activeSession.socket.on("message", () => {
                if (activeSession.timeout) {
                    clearTimeout(activeSession.timeout);
                }
                activeSession.timeout = setTimeout(() => {
                    this.platform.log.info(
                        "Device appears to be inactive. Stopping stream.",
                        this.accessory.displayName
                    );
                    this.controller!.forceStopStreamingSession(
                        request.sessionID
                    );
                    this.stopStream(request.sessionID);
                }, request.video.rtcp_interval * 5 * 1000);
            });
            activeSession.socket.bind(sessionInfo.videoReturnPort);

            activeSession.mainProcess = new FfmpegProcess(
                this.accessory.displayName,
                request.sessionID,
                pathToFfmpeg!,
                ffmpegArgs,
                this,
                callback
            );

            this.ongoingSessions[request.sessionID] = activeSession;
            delete this.pendingSessions[request.sessionID];
        } else {
            this.platform.log.error("Error finding session information.", this.accessory.displayName);
            callback(new Error("Error finding session information"));
        }
    }

    async handleStreamRequest(
        request: StreamingRequest,
        callback: StreamRequestCallback
    ): Promise<void> {
        switch (request.type) {
            case StreamRequestTypes.START: {
                this.startStream(request, callback);
                break;
            }
            case StreamRequestTypes.RECONFIGURE:
                this.platform.log.debug(
                    "Received (unsupported) request to reconfigure to: " +
                        JSON.stringify(request.video)
                );
                callback();
                break;
            case StreamRequestTypes.STOP: {
                this.stopStream(request.sessionID);
                callback();
                break;
            }
        }
    }

    stopStream(sessionId: string): void {
        const session = this.ongoingSessions[sessionId];
        if (session) {
            if (session.timeout) {
                clearTimeout(session.timeout);
            }
            try {
                session.socket?.close();
            } catch (err) {
                this.platform.log.error(
                    "Error occurred closing socket: " + err,
                    this.accessory.displayName
                );
            }
            try {
                session.mainProcess?.stop();
            } catch (err) {
                this.platform.log.error(
                    "Error occurred terminating main FFmpeg process: " + err,
                    this.accessory.displayName
                );
            }
            try {
                session.returnProcess?.stop();
            } catch (err) {
                this.platform.log.error(
                    "Error occurred terminating two-way FFmpeg process: " + err,
                    this.accessory.displayName
                );
            }
        }
        delete this.ongoingSessions[sessionId];
        this.platform.log.info(
            "Stopped video stream.",
            this.accessory.displayName
        );
    }
}
