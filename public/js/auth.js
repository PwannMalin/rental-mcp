import {
    PublicClientApplication
} from "@azure/msal-browser";

const msalConfig = {
    auth: {
        clientId: "193e3b30-e9cd-43a8-9a03-a32b1b22cf5f",
        authority:
            "https://login.microsoftonline.com/20bd77a5-e148-4b27-bed3-93baf486481b",
        redirectUri: window.location.origin
    }
};

export const msalInstance =
    new PublicClientApplication(msalConfig);

await msalInstance.initialize();

export async function getCurrentAccount() {

    console.log("ENTERED getCurrentAccount");

    let accounts =
        window.msalInstance.getAllAccounts();

    console.log("ACCOUNTS FOUND", accounts);

    let account = accounts[0];

    if (!account) {

        console.log("ATTEMPTING LOGIN");

        const result =
            await window.msalInstance.loginPopup({
                scopes: ["User.Read"]
            });

        console.log("LOGIN RESULT", result);

        account = result.account;
    }

    return account;
}