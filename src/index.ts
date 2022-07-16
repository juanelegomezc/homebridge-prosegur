import "reflect-metadata";
import { API } from "homebridge";

import { PLATFORM_NAME } from "./settings";
import { ProsegurPlatform } from "./platforms/prosegur.platform";

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
    api.registerPlatform(PLATFORM_NAME, ProsegurPlatform);
};
