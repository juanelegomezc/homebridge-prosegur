export interface AuthRequest {
    user: string;
    password: string;
    language: string;
    origin: string;
    platform: string;
    provider?: string;
}
