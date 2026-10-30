import { API_VERSION } from "@omicron/contract";

/** The instance speaks a newer contract than this app was built with, so parts of it may not load until an update. */
export const needsAppUpdate = (instanceVersion: number, appVersion = API_VERSION) => instanceVersion > appVersion;
