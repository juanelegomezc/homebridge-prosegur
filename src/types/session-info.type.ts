import { SRTPCryptoSuites } from "homebridge";

export type SessionInfo = {
    address: string;
    ipv6: boolean;

    videoPort: number;
    videoReturnPort: number;
    videoCryptoSuite: SRTPCryptoSuites;
    videoSRTP: Buffer;
    videoSSRC: number;

    audioPort?: number;
    audioReturnPort?: number;
    audioCryptoSuite?: SRTPCryptoSuites;
    audioSRTP?: Buffer;
    audioSSRC?: number;
};
