import { Socket } from "dgram";
import { FfmpegProcess } from "../services/ffmpeg-process";

export type ActiveSession = {
    mainProcess?: FfmpegProcess;
    returnProcess?: FfmpegProcess;
    timeout?: NodeJS.Timeout;
    socket?: Socket;
};