import { ProsegurAlarmStatus } from "./prosegur-alarm-status.enum";

export interface ProsegurCamera {
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

export interface ProsegurInstallation {
    installationId: string;
    description: string;
    image: number;
    installationType: string;
    pinControl: boolean;
    status: ProsegurAlarmStatus;
    preboarding: boolean;
    hasDomotic: boolean;
    detectors: {
        id: string;
        description: string;
        type: string;
        streaming: boolean;
    }[];
    videoDetectors: ProsegurCamera[];
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

interface ProsegurAuthData {
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

export interface ProsegurResponse {
    result: {
        code: number;
        message: string;
        description: string;
    };
}

export interface ProsegurCameraAuth {
    accessToken: string;
    sessionId: string;
    userId: string;
    url: string;
    code: string;
    obfuscated: boolean;
}

export interface ProsegurCameraStream {
    streamId: {
        value: number;
    };
    urls: {
        rtsp: string;
        rtspHttp: string;
        rtspHttps: string;
        hlsHttp: string;
        hlsHttps: string;
        multipartHttp: string;
        multipartHttps: string;
        multipartaudioHttp: string;
        multipartaudioHttps: string;
        mjpegHttp: string;
        mjpegHttps: string;
        audioPushHttp: string;
        audioPushHttps: string;
    };
}

export interface ProsegurAuthResponse extends ProsegurResponse {
    data: ProsegurAuthData;
}

export interface ProsegurInstallationsResponse extends ProsegurResponse {
    data: ProsegurInstallation[];
}

export interface ProsegurInstallationResponse extends ProsegurResponse {
    data: ProsegurInstallation;
}

export interface ProsegurCameraResponse extends ProsegurResponse {
    data: ProsegurCameraAuth;
}
