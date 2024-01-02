import "reflect-metadata";
import axios, { AxiosResponse, AxiosRequestConfig, AxiosRequestHeaders } from "axios";
import { Service } from "typedi";
import { AuthRequest } from "../types/auth-request.interface";
import {
    AuthResponse,
    InstallationsResponse,
    Response,
    InstallationResponse,
    CameraResponse,
} from "../types/response.interface";
import { Country, CountryCode } from "../types/country.interface";
import { Logger, PlatformConfig } from "homebridge";
import { AlarmStatus } from "../types/alarm-status.enum";
import { ConfigService } from "./config.service";

@Service({ transient: true })
export class ProsegurService {
    private readonly SMART_SERVER_WS: string =
        "https://smart.prosegur.com/smart-server/ws";

    private readonly MAX_RETRIES_COUNT = 3;
    private readonly TOKEN_HEADER = "X-Smart-Token";

    private readonly COUNTRIES: Record<CountryCode, Country> = {
        CO: {
            origin: "https://smart.prosegur.com/smart-individuo",
            referer: "https://smart.prosegur.com/smart-individuo/login.html",
            webOrigin: "Web",
        },
        PT: {
            origin: "https://smart.prosegur.com/smart-individuo",
            referer: "https://smart.prosegur.com/smart-individuo/login.html",
            webOrigin: "Web",
        },
        ES: {
            origin: "https://alarmas.movistarproseguralarmas.es",
            referer: "https://alarmas.movistarproseguralarmas.es/smart-mv/login.html",
            webOrigin: "WebM",
        },
        AR: {
            origin: "https://smart.prosegur.com/smart-individuo",
            referer: "https://smart.prosegur.com/smart-individuo/login.html",
            webOrigin: "Web",
        },
    };

    private log?: Logger;

    constructor(
        private country: Country,
        private headers: AxiosRequestHeaders,
        private countryCode: string,
        private username: string,
        private password: string,
        private configService: ConfigService
    ) { }

    init(config: PlatformConfig, log: Logger): void {
        this.log = log;
        if (this.configService.validateConfig(config)) {
            this.username = config.username;
            this.password = config.password;
            this.countryCode = config.country;
            this.country = this.COUNTRIES[this.countryCode];
            this.headers = {
                Accept: "application/json, text/plain, */*",
                "Content-Type": "application/json;charset=UTF-8",
                Origin: this.country.origin,
                Referer: this.country.referer,
            };
        } else {
            this.log?.error(
                "Invalid configuration, check configuration options on " +
                "https://github.com/juanelegomezc/homebridge-prosegur#configuration"
            );
        }
    }

    async login(): Promise<void> {
        try {
            const request: AuthRequest = {
                user: this.username,
                password: this.password,
                language: "en_US",
                origin: this.country.webOrigin,
                platform: "smart2",
                provider: undefined,
            };
            this.log?.debug(
                `Login with data: ${JSON.stringify(
                    this.cleanRequestPassword(request)
                )}`
            );
            const requestConfig: AxiosRequestConfig = {
                headers: this.headers,
            };
            const response = await axios.post<AuthResponse>(
                `${this.SMART_SERVER_WS}/access/login`,
                request,
                requestConfig
            );
            this.log?.debug(`Response ${JSON.stringify(response.data)}`);

            if (response.status !== 200) {
                return Promise.reject(new Error("Could not login"));
            }
            this.headers[this.TOKEN_HEADER] = response.data.data.token;
        } catch (error) {
            this.log?.error(JSON.stringify(error));
            return Promise.reject(error);
        }
    }

    async getInstallations(): Promise<InstallationsResponse> {
        try {
            const installations = await this.request<InstallationsResponse>(
                "get",
                "/installation"
            );
            return installations;
        } catch (error) {
            return Promise.reject(error);
        }
    }

    async setStatus(
        installationId: string,
        status: AlarmStatus
    ): Promise<boolean> {
        try {
            const data = { statusCode: status };
            await this.request(
                "put",
                `/installation/${installationId}/status`,
                data
            );
            return true;
        } catch (error) {
            return false;
        }
    }

    async getStatus(installationId: string): Promise<AlarmStatus> {
        try {
            const response = await this.request<InstallationResponse>(
                "get",
                `/installation/${installationId}`
            );
            const installation = response.data;
            if (installation) {
                this.log?.debug(`Installation: ${JSON.stringify(installation)}`);
                return installation.status;
            }
            this.log?.debug("No installation found");
            return AlarmStatus.DISARMED;
        } catch (error) {
            this.log?.debug("Error fetching installation information");
            return AlarmStatus.GENERAL_ERROR;
        }
    }

    loginCameraManager(cameraId: string): Promise<CameraResponse> {
        return this.request<CameraResponse>(
            "get",
            `/video2/camera/${cameraId}/play/`
        );
    }

    private async request<T extends Response>(
        method: string,
        path: string,
        data?: Record<string, unknown>,
        retry = true
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
                this.log?.debug("No X-Smart-Token, attempting login");
                try {
                    await this.login();
                } catch (error) {
                    this.log?.error("Error login in");
                    return Promise.reject(error);
                }
            }

            const request: AxiosRequestConfig = {
                url: `${this.SMART_SERVER_WS}${path}`,
                method,
                headers: this.headers,
                validateStatus: function (status): boolean {
                    return status < 500;
                },
            };

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
                delete this.headers[this.TOKEN_HEADER];
                retryCount++;
            }

            if (!retry || retryCount > this.MAX_RETRIES_COUNT) {
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
        this.log?.debug(`Response: ${JSON.stringify(response.data)}`);
        return response.data;
    }

    private isLoggedIn(): boolean {
        return (
            Object.keys(this.headers).find(
                (el) => el === this.TOKEN_HEADER
            ) !== undefined
        );
    }

    private cleanRequestPassword(request: AuthRequest): AuthRequest {
        const newReq = { ...request };
        newReq.password = "*****";
        return newReq;
    }
}
