export interface ProsegurAuthRequest {
    user: string;
    password: string;
    language: string;
    origin: string;
    platform: string;
    provider?: string;
}
