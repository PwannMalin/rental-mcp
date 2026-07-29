import {
    PublicClientApplication
} from "@azure/msal-browser";

import {
    msalConfig,
    loginRequest
} from "./msalConfig.js";

const msalInstance =
    new PublicClientApplication(msalConfig);

await msalInstance.initialize();

export async function getCurrentAccount() {

    let account =
        msalInstance.getAllAccounts()[0];

    if (!account) {
        const result =
            await msalInstance.loginPopup(
                loginRequest
            );

        account = result.account;
    }

    return account;
}