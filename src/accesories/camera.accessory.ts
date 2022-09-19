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
} from "homebridge";
import Container from "typedi";

import { ProsegurPlatform } from "../platforms/prosegur.platform";
import { CameraManagerService } from "../services/camera-manager.service";
import { SessionInfo } from "../types/session-info.type";

import pickPort from "pick-port";
import pathToFfmpeg from "ffmpeg-for-homebridge";
import { FfmpegProcess } from "../types/ffmpeg-process";
import { createSocket, Socket } from "dgram";

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
            const audio = request.video;
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

    private async startStream(
        request: StartStreamRequest,
        callback: StreamRequestCallback
    ): Promise<void> {
        const sessionInfo: SessionInfo =
            this.pendingSessions[request.sessionID];

        if (sessionInfo) {
            this.platform.log.debug(JSON.stringify(sessionInfo));
            const vcodec = "libx264";
            const mtu = 1316;
            const encoderOptions = "-preset ultrafast -tune zerolatency";
            this.platform.log.debug(
                "Video stream requested: " +
                    request.video.width +
                    " x " +
                    request.video.height +
                    ", " +
                    request.video.fps +
                    " fps, " +
                    request.video.max_bit_rate +
                    " kbps",
                this.accessory.displayName
            );
            this.platform.log.info(
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
            const streamUrl = await this.cameraManager.getStreamUrl();
            let ffmpegArgs = `-i ${streamUrl[0].urls.rtsp}`;
            ffmpegArgs += // Video
                " -an -sn -dn" +
                " -codec:v " +
                vcodec +
                " -pix_fmt yuv420p" +
                " -color_range mpeg" +
                (request.video.fps > 0 ? " -r " + request.video.fps : "") +
                " -f rawvideo" +
                (encoderOptions ? " " + encoderOptions : "") +
                "" +
                (" -b:v " + request.video.max_bit_rate + "k") +
                " -payload_type " +
                request.video.pt;

            ffmpegArgs += // Video Stream
                " -ssrc " +
                sessionInfo.videoSSRC +
                " -f rtp" +
                " -srtp_out_suite AES_CM_128_HMAC_SHA1_80" +
                " -srtp_out_params " +
                sessionInfo.videoSRTP.toString("base64") +
                " srtp://" +
                sessionInfo.address +
                ":" +
                sessionInfo.videoPort +
                "?rtcpport=" +
                sessionInfo.videoPort +
                "&pkt_size=" +
                mtu;

            if (this.accessory.context.camera.playAudioSupport) {
                if (
                    request.audio.codec === AudioStreamingCodecType.OPUS ||
                    request.audio.codec === AudioStreamingCodecType.AAC_ELD
                ) {
                    ffmpegArgs += // Audio
                        " -vn -sn -dn" +
                        (request.audio.codec === AudioStreamingCodecType.OPUS
                            ? " -codec:a libopus" + " -application lowdelay"
                            : " -codec:a libfdk_aac" + " -profile:a aac_eld") +
                        " -flags +global_header" +
                        " -f null" +
                        " -ar " +
                        request.audio.sample_rate +
                        "k" +
                        " -b:a " +
                        request.audio.max_bit_rate +
                        "k" +
                        " -ac " +
                        request.audio.channel +
                        " -payload_type " +
                        request.audio.pt;

                    ffmpegArgs += // Audio Stream
                        " -ssrc " +
                        sessionInfo.audioSSRC +
                        " -f rtp" +
                        " -srtp_out_suite AES_CM_128_HMAC_SHA1_80" +
                        " -srtp_out_params " +
                        sessionInfo.audioSRTP!.toString("base64") +
                        " srtp://" +
                        sessionInfo.address +
                        ":" +
                        sessionInfo.audioPort +
                        "?rtcpport=" +
                        sessionInfo.audioPort +
                        "&pkt_size=188";
                } else {
                    this.platform.log.error(
                        "Unsupported audio codec requested: " +
                            request.audio.codec,
                        this.accessory.displayName
                    );
                }
            }
            ffmpegArgs += " -loglevel level" + "+verbose" + " -progress pipe:1";
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
                true,
                this,
                callback
            );

            const mic = false; // this.accessory.context.camera.microphoneSupport;
            if (mic) {
                const ffmpegReturnArgs =
                  "-hide_banner" +
                  " -protocol_whitelist pipe,udp,rtp,file,crypto" +
                  " -f sdp" +
                  " -c:a libfdk_aac" +
                  " -i pipe:" +
                  " " + streamUrl[0].urls.audioPushHttps +
                  " -loglevel level" + ("+verbose");

                const ipVer = sessionInfo.ipv6 ? "IP6" : "IP4";

                const sdpReturnAudio =
                  "v=0\r\n" +
                  "o=- 0 0 IN " + ipVer + " " + sessionInfo.address + "\r\n" +
                  "s=Talk\r\n" +
                  "c=IN " + ipVer + " " + sessionInfo.address + "\r\n" +
                  "t=0 0\r\n" +
                  "m=audio " + sessionInfo.audioReturnPort + " RTP/AVP 110\r\n" +
                  "b=AS:24\r\n" +
                  "a=rtpmap:110 MPEG4-GENERIC/16000/1\r\n" +
                  "a=rtcp-mux\r\n" + // FFmpeg ignores this, but might as well
                  "a=fmtp:110 " +
                    "profile-level-id=1;mode=AAC-hbr;sizelength=13;indexlength=3;indexdeltalength=3; " +
                    "config=F8F0212C00BC00\r\n" +
                  "a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:" + sessionInfo.audioSRTP!.toString("base64") + "\r\n";
                activeSession.returnProcess = new FfmpegProcess(this.accessory.displayName + "] [Two-way", request.sessionID,
                    pathToFfmpeg!, ffmpegReturnArgs, true, this);
                activeSession.returnProcess.stdin.end(sdpReturnAudio);
            }

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
