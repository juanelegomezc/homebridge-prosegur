import { Socket } from "dgram";
import { FfmpegProcess } from "../services/ffmpeg-process";

export type CameraActiveSession = {
    mainProcess?: FfmpegProcess;
    returnProcess?: FfmpegProcess;
    timeout?: NodeJS.Timeout;
    socket?: Socket;
};