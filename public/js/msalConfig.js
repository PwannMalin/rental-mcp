export const msalConfig = {
    auth: {
        clientId: "193e3b30-e9cd-43a8-9a03-a32b1b22cf5f",
        authority:
            "https://login.microsoftonline.com/20bd77a5-e148-4b27-bed3-93baf486481b",
        redirectUri: window.location.origin
    }
};

export const loginRequest = {
    scopes: ["User.Read"]
};
