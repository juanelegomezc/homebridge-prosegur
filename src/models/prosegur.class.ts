import { Axios, AxiosRequestConfig, AxiosRequestHeaders } from "axios";
import { Service } from "typedi";
import { AuthRequest } from "../types/auth-request.interface";
import { AuthResponse } from "../types/auth-response.intreface";
import { Country, CountryCode } from "../types/country.interface";

@Service()
export class Prosegur {
    private readonly SMART_SERVER_WS: string =
        "https://smart.prosegur.com/smart-server/ws";

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
            referer:
                "https://alarmas.movistarproseguralarmas.es/smart-mv/login.html",
            webOrigin: "WebM",
        },
    };

    private country: Country;
    private headers: AxiosRequestHeaders;

    constructor(
        private username: string,
        private password: string,
        private countryCode: CountryCode,
    ) {
        this.country = this.COUNTRIES[this.countryCode];
        this.headers = {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
            Origin: this.country.origin,
            Referer: this.country.referer,
        };
    }

    async login(): Promise<void> {
        try {
            const request: AuthRequest = {
                user: this.username,
                password: this.password,
                language: "en_US",
                origin: this.country.origin,
                platform: "smart2",
                provider: undefined,
            };
            const axios = new Axios();
            const requestConfig: AxiosRequestConfig = {
                headers: this.headers,
            };
            const response = await axios.post(
                `${this.SMART_SERVER_WS}/access/login`,
                request,
                requestConfig,
            );

            if (response.status !== 200) {
                Promise.reject("Could not login");
            }

            const result: AuthResponse = response.data;

            this.headers["X-Smart-Token"] = result.data.token;
        } catch (error) {
            Promise.reject(error);
        }
    }
}
