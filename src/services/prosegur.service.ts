import "reflect-metadata";
import axios, { AxiosResponse, AxiosRequestConfig, AxiosRequestHeaders, AxiosError } from "axios";
import { Service } from "typedi";
import { ProsegurAuthRequest } from "../types/Prosegur-auth-request.interface";
import {
    ProsegurAuthResponse,
    ProsegurInstallationsResponse,
    ProsegurResponse,
    ProsegurCameraResponse,
    ProsegurPanelStatusResponse,
} from "../types/prosegur-response.interface";
import { ProsegurCountry, ProsegurCountryCode } from "../types/prosegur-country.interface";
import { Logger, PlatformConfig } from "homebridge";
import { ProsegurAlarmStatus } from "../types/prosegur-alarm-status.enum";
import { ConfigService } from "./config.service";

@Service({ transient: true })
export class ProsegurService {
    private readonly SMART_SERVER_WS: string =
        "https://api-smart.prosegur.cloud/smart-server/ws";

    private readonly MAX_RETRIES_COUNT = 3;
    private readonly TOKEN_HEADER = "X-Smart-Token";

    private readonly COUNTRIES: Record<ProsegurCountryCode, ProsegurCountry> = {
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
        PY: {
            origin: "https://smart.prosegur.com/smart-individuo",
            referer: "https://smart.prosegur.com/smart-individuo/login.html",
            webOrigin: "Web",
        },
        UY: {
            origin: "https://smart.prosegur.com/smart-individuo",
            referer: "https://smart.prosegur.com/smart-individuo/login.html",
            webOrigin: "Web",
        },
    };

    private log?: Logger;

    constructor(
        private country: ProsegurCountry,
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
            const request: ProsegurAuthRequest = {
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
            const response = await axios.post<ProsegurAuthResponse>(
                `${this.SMART_SERVER_WS}/access/login`,
                request,
                requestConfig
            );
            this.log?.debug(`Response ${JSON.stringify(response.data)}`);
            this.headers[this.TOKEN_HEADER] = response.data.data.token;
        } catch (error) {
            this.log?.error(JSON.stringify(error));
            return Promise.reject(error);
        }
    }

    async getInstallations(): Promise<ProsegurInstallationsResponse> {
        try {
            const installations = await this.request<ProsegurInstallationsResponse>(
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
        status: ProsegurAlarmStatus
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

    async getStatus(installationId: string): Promise<ProsegurAlarmStatus> {
        try {
            const response = await this.request<ProsegurPanelStatusResponse>(
                "get",
                `/installation/${installationId}/panel-status`
            );
            const data = response.data;
            if (data) {
                this.log?.debug(`Installation: ${JSON.stringify(data)}`);
                return data.status;
            }
            this.log?.debug("No installation found");
            return ProsegurAlarmStatus.GENERAL_ERROR;
        } catch (error) {
            this.log?.debug("Error fetching installation information");
            return ProsegurAlarmStatus.GENERAL_ERROR;
        }
    }

    loginCameraManager(cameraId: string): Promise<ProsegurCameraResponse> {
        return this.request<ProsegurCameraResponse>(
            "get",
            `/video2/camera/${cameraId}/play/`
        );
    }

    private async request<T extends ProsegurResponse>(
        method: string,
        path: string,
        data?: Record<string, unknown>,
        retry = true
    ): Promise<T> {
        let logInfo = `Request ${method.toUpperCase()} ${path}`;
        if (data) {
            logInfo += `, data: ${JSON.stringify(
                data
            )}`;
        }
        this.log?.debug(logInfo);
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
            };

            if (method.toLowerCase() === "post" || method.toLowerCase() === "put") {
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
                this.log?.debug(`Response: ${JSON.stringify(response.data)}`);
                return response.data;
            } catch (error) {
                if (error instanceof AxiosError) {
                    retry = true;
                    if (error.response) {
                        if (error.response.status >= 400 && error.response.status < 500) {
                            this.log?.error(
                                `Authentication failed with status ${error.response.status}: ${error.response.statusText}`
                            );
                            delete this.headers[this.TOKEN_HEADER];
                        } else {
                            this.log?.error(
                                `Connection failed with status ${error.response.status}: ${error.response.statusText}`
                            );
                            retryCount++;
                        }
                    }
                } else {
                    this.log?.error((error as Error).message);
                    return Promise.reject(error);
                }
            }

            if (!retry || retryCount > this.MAX_RETRIES_COUNT) {
                this.log?.error("Max retries exceded");
                return Promise.reject(new Error("Connection error"));
            }
        } while (retry);

        return Promise.reject(new Error("Connection error"));
    }

    private isLoggedIn(): boolean {
        return (
            Object.keys(this.headers).find(
                (el) => el === this.TOKEN_HEADER
            ) !== undefined
        );
    }

    private cleanRequestPassword(request: ProsegurAuthRequest): ProsegurAuthRequest {
        const newReq = { ...request };
        newReq.password = "*****";
        return newReq;
    }
}
