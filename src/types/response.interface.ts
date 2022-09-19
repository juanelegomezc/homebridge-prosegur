import { AlarmStatus } from "./alarm-status.enum";

export interface Camera {
    id: string;
    description: string;
    type: string;
    provider: string;
    microphoneSupport: boolean;
    speakerSupport: boolean;
    playAudioSupport: boolean;
    panTiltSupport: boolean;
    zoomSupport: boolean;
    audioDetectorSupport: boolean;
    motionDetectorSupport: boolean;
    doorbellSupport: boolean;
    analyticsSupport: boolean;
    audioStatus: boolean;
    audioDetectorStatus: boolean;
    motionDetectorStatus: boolean;
    doorbellStatus: boolean;
    analyticsStatus: boolean;
    personDetectionOnlyStatus: boolean;
    daysOfRecordings: number;
    areas: unknown[];
    cameraStatus: string;
    wifiSupport: boolean;
    modePrivateStatus: boolean;
}

interface Installation {
        installationId: string;
        description: string;
        image: number;
        installationType: string;
        pinControl: boolean;
        status: AlarmStatus;
        preboarding: boolean;
        hasDomotic: boolean;
        detectors: {
                id: string;
                description: string;
                type: string;
                streaming: boolean;
        }[];
        videoDetectors:
                Camera[];
        services: {
                type: string;
                statusCode: number;
        }[];
        partitions: unknown[];
        domoticDevices: unknown[];
        accessLevels: unknown[];
        latitude: string;
        longitude: string;
        contractId: string;
        address: string;

}

interface AuthData {
    token: string;
    username: string;
    name: string;
    surnames: string;
    email: string;
    phone: string;
    clientId: string;
    administrator: number;
    authorized: number;
    acceptedDisclaimer: boolean;
    profileImg: boolean;
    services: {
        [service: string]: boolean;
    };
    sectionFlags: {
        countryId: string;
        [sectionFlag: string]: string;
    };
    externalServices: {
        [externalService: string]: {
            access: boolean;
        };
    };
    multisite: boolean;
    sessionTimeout: number;
    clientType: string;
    maxPanicButtonUsers: number;
    showOnboarding: boolean;
}

export interface Response {
    result: {
        code: number;
        message: string;
        description: string;
    };
}

export interface CameraAuth {
    accessToken: string;
    sessionId: string;
    userId: string;
    url: string;
    code: string;
    obfuscated: boolean;
}

export interface CameraStream {
    "streamId": {
        "value": number;
    };
    "urls": {
        "rtsp": string;
        "rtspHttp": string;
        "rtspHttps": string;
        "hlsHttp": string;
        "hlsHttps": string;
        "multipartHttp": string;
        "multipartHttps": string;
        "multipartaudioHttp": string;
        "multipartaudioHttps": string;
        "mjpegHttp": string;
        "mjpegHttps": string;
        "audioPushHttp": string;
        "audioPushHttps": string;
    };
}

export interface AuthResponse extends Response{
    data: AuthData;
}

export interface InstallationsResponse extends Response {
    data: Installation[];
}

export interface InstallationResponse extends Response {
    data: Installation;
}

export interface CameraResponse extends Response {
    data: CameraAuth;
}

