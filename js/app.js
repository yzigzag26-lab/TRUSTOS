"use strict";

const CONFIG = {
    API_BASE_URL: window.TRUSTOS_CONFIG.API_BASE_URL,
    ENDPOINTS: { VERIFY: "/api/verify" },
    NETWORK: { NAME: "BNB Smart Chain", CHAIN_ID: 56 },
    UI: { TOAST_DURATION: 3500, RESULT_SCROLL_OFFSET: 100 },
};

const elements = {
    verificationForm: document.getElementById("verification-form"),
    transactionInput: document.getElementById("transaction-input"),
    clearInput: document.getElementById("clear-input"),
    exampleButton: document.getElementById("example-button"),
    inputError: document.getElementById("input-error"),
    verifyButton: document.getElementById("verify-button"),
    verifyButtonLoading: document.getElementById("verify-button-loading"),
    verificationResult: document.getElementById("verification-result"),
    verificationError: document.getElementById("verification-error"),
    resultStatus: document.getElementById("result-status"),
    resultNetwork: document.getElementById("result-network"),
    resultAsset: document.getElementById("result-asset"),
    resultAmount: document.getElementById("result-amount"),
    resultBlock: document.getElementById("result-block"),
    resultHash: document.getElementById("result-hash"),
    resultFrom: document.getElementById("result-from"),
    resultTo: document.getElementById("result-to"),
    resultTimestamp: document.getElementById("result-timestamp"),
    resultContract: document.getElementById("result-contract"),
    verifyAnother: document.getElementById("verify-another"),
    dismissError: document.getElementById("dismiss-error"),
    errorTitle: document.getElementById("error-title"),
    errorMessage: document.getElementById("error-message"),
    toast: document.getElementById("toast"),
    toastMessage: document.getElementById("toast-message"),
};

const state = { isVerifying: false, lastVerification: null };
const HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const EXAMPLE_HASH = "0x9836a9954e5e1564cb9f84cf7a254ad1cd98ed3c7765c02037f5b7860828ec6a";
const STATE_COPY = {
    confirmed: "Transaction independently verified.",
    pending: "Transaction found, but it has not been confirmed on-chain yet.",
    failed: "Transaction found, but execution failed on-chain.",
    "not-found": "Transaction was not found on BNB Smart Chain.",
    "invalid-input": "Enter a valid BNB Smart Chain transaction hash.",
    "network-mismatch": "The transaction is associated with a different network.",
    "service-unavailable": "TRUSTOS could not complete blockchain verification right now.",
};
const STATE_LABELS = {
    confirmed: "Confirmed",
    pending: "Pending",
    failed: "Failed",
    "not-found": "Not found",
    "invalid-input": "Invalid input",
    "network-mismatch": "Network mismatch",
};

function initializeTrustOS() {
    bindEvents();
    resetInterface();
    refreshLucideIcons();
}

function bindEvents() {
    elements.verificationForm?.addEventListener("submit", handleVerificationSubmit);
    elements.transactionInput?.addEventListener("input", handleInputChange);
    elements.transactionInput?.addEventListener("keydown", handleInputKeydown);
    elements.clearInput?.addEventListener("click", clearTransactionInput);
    elements.exampleButton?.addEventListener("click", useExampleTransaction);
    elements.verifyAnother?.addEventListener("click", resetForAnotherVerification);
    elements.dismissError?.addEventListener("click", hideVerificationError);
    document.querySelectorAll("[data-copy-target]").forEach((button) => button.addEventListener("click", handleCopyButton));
}

function handleInputChange() {
    clearInputError();
    if (elements.clearInput) elements.clearInput.hidden = !elements.transactionInput.value.trim();
}

function handleInputKeydown(event) {
    if (event.key === "Escape") clearTransactionInput();
}

function validateTransactionHash(hash) {
    if (!hash) return { valid: false, message: "Enter a BNB Smart Chain transaction hash." };
    if (!HASH_PATTERN.test(hash)) return { valid: false, message: "Invalid transaction hash. A BSC transaction hash must contain 0x followed by 64 hexadecimal characters." };
    return { valid: true };
}

async function handleVerificationSubmit(event) {
    event.preventDefault();
    if (state.isVerifying) return;
    const hash = elements.transactionInput.value.trim();
    const validation = validateTransactionHash(hash);
    if (!validation.valid) {
        showInputError(validation.message);
        elements.transactionInput.focus();
        return;
    }
    clearInputError();
    hideVerificationResult();
    hideVerificationError();
    await verifyTransaction(hash);
}

async function verifyTransaction(hash) {
    state.isVerifying = true;
    setLoadingState(true);
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.ENDPOINTS.VERIFY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ hash }),
        });
        let data = null;
        try {
            data = await response.json();
        } catch {
            throw new Error("The verification server returned an invalid response.");
        }
        if (!data || !data.state) throw new Error("The verification server returned an invalid response.");
        if (!response.ok && data.state !== "invalid-input") {
            if (data.state === "service-unavailable") throw new Error(data.error?.message || STATE_COPY["service-unavailable"]);
            throw new Error(data.error?.message || "The verification request was invalid.");
        }
        const transaction = normalizeVerificationResponse(data, hash);
        state.lastVerification = transaction;
        if (transaction.state === "service-unavailable") {
            showVerificationError("Blockchain service unavailable", STATE_COPY[transaction.state]);
        } else {
            displayVerificationResult(transaction);
            showToast(transaction.state === "confirmed" ? "success" : "info", STATE_COPY[transaction.state]);
        }
    } catch (error) {
        handleVerificationError(error);
    } finally {
        state.isVerifying = false;
        setLoadingState(false);
    }
}

function normalizeVerificationResponse(data, fallbackHash) {
    const transaction = data.transaction || {};
    const transfers = Array.isArray(data.assetTransfers) ? data.assetTransfers : [];
    const transfer = transfers[0] || null;
    const network = data.network && typeof data.network === "object"
        ? `${data.network.name} (Chain ID ${data.network.chainId})`
        : data.network || CONFIG.NETWORK.NAME;
    const amount = transfer?.type === "NATIVE_BNB"
        ? formatUnits(transfer.rawAmount, 18)
        : transfer?.rawAmount
            ? formatUnits(transfer.rawAmount, transfer.decimals || 0)
            : null;
    return {
        state: data.state,
        verified: data.verified === true,
        status: STATE_LABELS[data.state] || data.state,
        network,
        asset: transfer?.symbol || (transfer?.type === "BEP20_TRANSFER" ? "BEP-20" : "BNB"),
        amount,
        block: transaction.blockNumber || data.receipt?.blockNumber || null,
        hash: transaction.hash || fallbackHash,
        from: transaction.from || transfer?.from || null,
        to: transaction.to || transfer?.to || null,
        timestamp: transaction.timestamp || null,
        contract: transfer?.contract || null,
    };
}

function displayVerificationResult(transaction) {
    hideVerificationError();
    setText(elements.resultStatus, transaction.status);
    setText(elements.resultNetwork, transaction.network);
    setText(elements.resultAsset, transaction.asset);
    setText(elements.resultAmount, formatAmount(transaction.amount, transaction.asset));
    setText(elements.resultBlock, formatBlockNumber(transaction.block));
    setText(elements.resultHash, transaction.hash);
    setText(elements.resultFrom, transaction.from);
    setText(elements.resultTo, transaction.to);
    setText(elements.resultTimestamp, formatTimestamp(transaction.timestamp));
    setText(elements.resultContract, formatContract(transaction.contract));
    updateResultStatusVisual(transaction);
    elements.verificationResult.hidden = false;
    requestAnimationFrame(() => scrollToElement(elements.verificationResult));
}

function updateResultStatusVisual(transaction) {
    if (!elements.resultStatus) return;
    elements.resultStatus.classList.remove("status-success", "status-warning", "status-danger");
    if (transaction.state === "confirmed") elements.resultStatus.classList.add("status-success");
    else if (transaction.state === "failed" || transaction.state === "network-mismatch") elements.resultStatus.classList.add("status-danger");
    else elements.resultStatus.classList.add("status-warning");
}

function handleVerificationError(error) {
    hideVerificationResult();
    const message = error instanceof TypeError
        ? "TRUSTOS could not reach the verification server right now."
        : error?.message || STATE_COPY["service-unavailable"];
    showVerificationError("Blockchain service unavailable", message);
}

function showVerificationError(title, message) {
    setText(elements.errorTitle, title);
    setText(elements.errorMessage, message);
    elements.verificationError.hidden = false;
    requestAnimationFrame(() => scrollToElement(elements.verificationError));
}

function hideVerificationError() {
    if (elements.verificationError) elements.verificationError.hidden = true;
}

function showInputError(message) {
    setText(elements.inputError, message);
    elements.inputError.hidden = false;
    elements.transactionInput.setAttribute("aria-invalid", "true");
}

function clearInputError() {
    if (elements.inputError) elements.inputError.hidden = true;
    elements.transactionInput?.setAttribute("aria-invalid", "false");
}

function setLoadingState(isLoading) {
    if (elements.verifyButton) elements.verifyButton.disabled = isLoading;
    if (elements.verifyButtonLoading) elements.verifyButtonLoading.hidden = !isLoading;
    const content = document.querySelector(".verify-button-content");
    if (content) content.hidden = isLoading;
}

function clearTransactionInput() {
    if (elements.transactionInput) elements.transactionInput.value = "";
    handleInputChange();
    elements.transactionInput?.focus();
}

function resetForAnotherVerification() {
    resetInterface();
    elements.transactionInput?.focus();
    document.getElementById("verify")?.scrollIntoView({ behavior: "smooth" });
}

function resetInterface() {
    clearInputError();
    hideVerificationResult();
    hideVerificationError();
    state.lastVerification = null;
    if (elements.transactionInput) elements.transactionInput.value = "";
    if (elements.clearInput) elements.clearInput.hidden = true;
    setLoadingState(false);
}

function useExampleTransaction() {
    elements.transactionInput.value = EXAMPLE_HASH;
    handleInputChange();
    clearInputError();
}

async function handleCopyButton(event) {
    const target = document.querySelector(event.currentTarget.dataset.copyTarget);
    if (!target) return;
    try {
        await navigator.clipboard.writeText(target.textContent.trim());
        showToast("info", "Copied to clipboard.");
    } catch {
        showToast("info", "Copy is unavailable in this browser.");
    }
}

function showToast(type, message) {
    if (!elements.toast || !elements.toastMessage) return;
    elements.toast.className = `toast toast-${type}`;
    setText(elements.toastMessage, message);
    elements.toast.hidden = false;
    window.setTimeout(() => { elements.toast.hidden = true; }, CONFIG.UI.TOAST_DURATION);
}

function formatUnits(value, decimals) {
    if (value === null || value === undefined) return null;
    const raw = BigInt(value);
    if (!decimals) return raw.toString();
    const divisor = 10n ** BigInt(decimals);
    const fraction = (raw % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
    return fraction ? `${raw / divisor}.${fraction}` : (raw / divisor).toString();
}

function formatAmount(amount, asset) {
    return amount === null || amount === undefined ? "-" : asset ? `${amount} ${asset}` : String(amount);
}

function formatBlockNumber(block) {
    return block === null || block === undefined ? "-" : Number(block).toLocaleString();
}

function formatContract(contract) {
    return contract || "Native BNB";
}

function formatTimestamp(timestamp) {
    if (timestamp === null || timestamp === undefined) return "-";
    const numeric = Number(timestamp);
    const date = Number.isFinite(numeric) ? new Date(numeric < 10000000000 ? numeric * 1000 : numeric) : new Date(timestamp);
    return Number.isNaN(date.getTime()) ? String(timestamp) : date.toLocaleString();
}

function setText(element, value) {
    if (element) element.textContent = value === null || value === undefined || value === "" ? "-" : String(value);
}

function hideVerificationResult() {
    if (elements.verificationResult) elements.verificationResult.hidden = true;
}

function scrollToElement(element) {
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function refreshLucideIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", initializeTrustOS);
