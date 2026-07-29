export const msalConfig = {
    auth: {
        clientId: "20bd77a5-e148-4b27-bed3-93baf486481b",
        authority:
            "https://login.microsoftonline.com/20bd77a5-e148-4b27-bed3-93baf486481b",
        redirectUri: window.location.origin
    }
};

export const loginRequest = {
    scopes: ["User.Read"]
};
