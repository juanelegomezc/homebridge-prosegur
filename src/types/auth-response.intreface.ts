interface Result {
    code: number;
    message: string;
    description: string;
}

interface Service {
    [service: string]: boolean;
}

interface SectionFlags {
    countryId: string;
    [sectionFlag: string]: string;
}

interface ExternalService {
    [externalService: string]: {
        access: boolean;
    };
}

export interface Data {
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
    services: Service;
    sectionFlags: SectionFlags;
    externalServices: ExternalService[];
    multisite: boolean;
    sessionTimeout: number;
    clientType: string;
    maxPanicButtonUsers: number;
    showOnboarding: boolean;
}

export interface AuthResponse {
    result: Result;
    data: Data;
}
