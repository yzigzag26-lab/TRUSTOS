"use strict";

// Public frontend configuration only. Backend RPC credentials stay server-side.
window.TRUSTOS_CONFIG = Object.freeze({
    API_BASE_URL: "https://backend-production-7763.up.railway.app",
});

// Adapt the backend's normalized verification response for the existing UI.
const frontendFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
    const response = await frontendFetch(...args);
    const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url;
    if (!requestUrl || !requestUrl.endsWith("/api/verify")) {
        return response;
    }

    const payload = await response.clone().json();
    if (!payload || !payload.transaction || !payload.network) {
        return response;
    }

    const transaction = payload.transaction;
    const network = payload.network;
    const valueWei = transaction.valueWei;
    let amount = "-";
    if (typeof valueWei === "string" && /^\d+$/.test(valueWei)) {
        const wei = BigInt(valueWei);
        const whole = wei / 10n ** 18n;
        const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
        amount = `${fraction ? `${whole}.${fraction}` : whole} BNB`;
    }

    const adaptedPayload = {
        ...payload,
        network: `${network.name} (Chain ID ${network.chainId})`,
        transaction: {
            ...transaction,
            status: payload.receipt?.status === "success" ? "Confirmed" : payload.state,
            network: `${network.name} (Chain ID ${network.chainId})`,
            amount,
        },
    };

    return new Response(JSON.stringify(adaptedPayload), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
};
