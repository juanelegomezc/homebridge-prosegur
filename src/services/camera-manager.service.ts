import axios, { AxiosRequestConfig, AxiosResponse, ResponseType } from "axios";
import { Logger } from "homebridge";
import { Service } from "typedi";
import { CameraStream } from "../types/response.interface";
import { ProsegurService } from "./prosegur.service";

@Service({ transient: true })
export class CameraManagerService {
    private readonly CAMERA_MANAGER_WS: string =
        "https://rest.cameramanager.com/rest/v2.0";

    private readonly MAX_RETRY_COUNT = 3;

    private log?: Logger;

    constructor(
        private prosegur: ProsegurService,
        private prosegurCameraId: string,
        private token: string | undefined,
        private cameraId: string,
        private snapshotPromise: Promise<Buffer> | undefined,
        private streamPromise: Promise<CameraStream[]> | undefined
    ) {}

    init(
        prosegurCameraId: string,
        prosegur: ProsegurService,
        log: Logger
    ): void {
        this.prosegurCameraId = prosegurCameraId;
        this.prosegur = prosegur;
        this.log = log;
        this.login();
    }

    async login(): Promise<void> {
        try {
            const response = await this.prosegur.loginCameraManager(
                this.prosegurCameraId!
            );
            this.token = response.data.accessToken;
            this.cameraId = response.data.code;
        } catch (error) {
            this.log?.error(JSON.stringify(error));
            return Promise.reject(error);
        }
    }

    getSnapshot(width: number, height: number): Promise<Buffer> {
        if (this.snapshotPromise) {
            return this.snapshotPromise;
        }
        this.snapshotPromise = new Promise<Buffer>((resolve, reject) => {
            this.request<ArrayBuffer>(
                "get",
                `/cameras/${this.cameraId}/snapshot`,
                {
                    resolution: `${width}x${height}`,
                },
                true,
                "arraybuffer"
            )
                .then((response) => {
                    return resolve(Buffer.from(response));
                })
                .catch((error) => reject(error));
            setTimeout(() => {
                this.snapshotPromise = undefined;
            }, 180 * 1000); // Expire cached snapshot after 180 seconds
        });
        return this.snapshotPromise;
    }

    getStreamUrl(): Promise<CameraStream[]> {
        if (this.streamPromise) {
            return this.streamPromise;
        }
        return new Promise((resolve, reject) => {
            this.request<CameraStream[]>(
                "get",
                `/cameras/${this.cameraId}/streams`
            )
                .then((response) =>
                    resolve(
                        response.map((stream) => {
                            for (const k in stream.urls) {
                                stream.urls[k] =
                                    stream.urls[k] +
                                    "&access_token=" +
                                    encodeURI(this.token!);
                            }
                            return stream;
                        })
                    )
                )
                .catch((error) => reject(error));
            setTimeout(() => {
                this.streamPromise = undefined;
            }, 10 * 1000); // Expire cached snapshot after 10 seconds
        });
    }

    private isLoggedIn(): boolean {
        return this.token !== undefined;
    }

    private async request<T>(
        method: string,
        path: string,
        data?: Record<string, unknown>,
        retry = true,
        responseType?: ResponseType | undefined
    ): Promise<T> {
        this.log?.debug(
            `Requesting ${path}, method: ${method.toUpperCase()}, data: ${JSON.stringify(
                data
            )}`
        );
        let retryCount = 0;
        let response: AxiosResponse<T>;
        do {
            if (!this.isLoggedIn()) {
                this.log?.debug("No token, attempting login");
                try {
                    await this.login();
                } catch (error) {
                    this.log?.error("Error login in");
                    return Promise.reject(error);
                }
            }

            const request: AxiosRequestConfig = {
                url: `${this.CAMERA_MANAGER_WS}${path}?access_token=${this.token}`,
                method,
            };

            if (responseType) {
                request.responseType = responseType;
            }

            if (method === "post" || method === "put") {
                if (!data) {
                    this.log?.debug("No data ");
                    return Promise.reject(
                        new Error(
                            `No data for ${method.toUpperCase()}  method call`
                        )
                    );
                }
                request.data = data;
            } else if (method === "get") {
                if (data) {
                    let params = "";
                    Object.keys(data).forEach((value) => {
                        params = params + `&${value}=${data[value]}`;
                    });
                    request.url = request.url! + params;
                }
            }

            try {
                response = await axios.request<T>(request);
            } catch (error) {
                this.log?.error((error as Error).message);
                return Promise.reject(error);
            }

            if (response.status >= 500 && response.status < 600) {
                this.log?.error(
                    `Connection failed with status ${response.status}: ${response.statusText}`
                );
                retryCount++;
            } else if (response.status >= 400 && response.status < 500) {
                this.log?.error(
                    `Authentication failed with status ${response.status}: ${response.statusText}`
                );
                this.token = undefined;
                retryCount++;
            }
            if (!retry || retryCount > this.MAX_RETRY_COUNT) {
                this.log?.error("Max retries exceded");
                return Promise.reject(new Error("Connection error"));
            }

            if (response.status !== 200) {
                this.log?.error(
                    `Call to API failed with status ${response.status}: ${response.statusText}`
                );
                return Promise.reject(
                    new Error(
                        `Call to API failed with status: ${response.status}`
                    )
                );
            }
            retry = response.status !== 200;
        } while (retry);
        if (!responseType) {
            this.log?.debug(`Response: ${JSON.stringify(response.data)}`);
        }
        return response.data;
    }
}
