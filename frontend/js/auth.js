/*
 * JobTrack authentication
 * Contract source: jobtrack-openapi.yaml
 * POST https://jobtrack-fk7m.onrender.com/api/v1/auth/login
 *
 * Expected success response:
 * {
 *   "data": {
 *     "token": "...",
 *     "token_type": "Bearer",
 *     "user": {
 *       "user_id": 1,
 *       "full_name": "...",
 *       "email": "...",
 *       "role": { "role_name": "Requester" }
 *     }
 *   }
 * }
 */

(() => {
    "use strict";

    const API_BASE_URL = "https://jobtrack-fk7m.onrender.com/api/v1";
    const AUTH_TOKEN_KEY = "jobtrack_token";
    const AUTH_USER_KEY = "jobtrack_user";

    // Only the requester destination is confirmed by the supplied frontend files.
    // Add the other role destinations here once their actual page paths are known.
    const ROLE_DASHBOARD_PATHS = {
        "Administrator": "pages/admin/admin-dashboard.html",
        "Facilities Officer": "pages/facilities/facilities-dashboard.html",
        "Facilities Staff": "pages/facilities/facilities-dashboard.html",
        "Inventory Staff": "pages/inventory/inventory-dashboard.html",
        "Inventory Officer": "pages/inventory/inventory-dashboard.html",
        "Requester": "pages/requester/requester-dashboard.html",
        "Technician": "pages/technician/technician-dashboard.html"
    };

    const form = document.getElementById("loginForm");
    if (!form) return;

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const messageElement = document.getElementById("loginMessage");
    const submitButton = document.getElementById("loginButton");
    const buttonText = document.getElementById("loginButtonText");
    const spinner = document.getElementById("loginSpinner");

    function showMessage(message) {
        messageElement.textContent = message;
        messageElement.classList.remove("d-none");
    }

    function clearMessage() {
        messageElement.textContent = "";
        messageElement.classList.add("d-none");
    }

    function setLoading(isLoading) {
        submitButton.disabled = isLoading;
        emailInput.disabled = isLoading;
        passwordInput.disabled = isLoading;
        spinner.classList.toggle("d-none", !isLoading);
        buttonText.textContent = isLoading ? "Signing in..." : "Sign in";
    }

    function validateForm() {
        let valid = true;

        emailInput.classList.remove("is-invalid");
        passwordInput.classList.remove("is-invalid");

        if (!emailInput.value.trim() || !emailInput.validity.valid) {
            emailInput.classList.add("is-invalid");
            valid = false;
        }

        if (!passwordInput.value) {
            passwordInput.classList.add("is-invalid");
            valid = false;
        }

        return valid;
    }

    async function readErrorMessage(response) {
        let body = null;

        try {
            body = await response.json();
        } catch {
            // The API may return a non-JSON error response.
        }

        if (response.status === 422) {
            const errors = body?.errors;
            if (errors && typeof errors === "object") {
                const firstFieldError = Object.values(errors)
                    .flat()
                    .find(value => typeof value === "string");

                if (firstFieldError) return firstFieldError;
            }

            return body?.message || "The email or password is invalid, or this account is inactive.";
        }

        if (response.status === 429) {
            return "Too many login attempts. Please wait a moment and try again.";
        }

        if (response.status >= 500) {
            return "The JobTrack server encountered a problem. Please try again later.";
        }

        return body?.message || `Unable to sign in (HTTP ${response.status}).`;
    }

    async function login(email, password) {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password,
                device_name: "web"
            })
        });

        if (!response.ok) {
            throw new Error(await readErrorMessage(response));
        }

        const payload = await response.json();
        const authData = payload?.data;
        const token = authData?.access_token;
        const user = authData?.user;
        const roleName = user?.role?.role_name;

        if (!token || !user || !roleName) {
            throw new Error("The server returned an unexpected login response. Please contact your administrator.");
        }

        const dashboardPath = ROLE_DASHBOARD_PATHS[roleName];

        // Do not persist a token if this frontend has no configured destination
        // for the authenticated role yet.
        if (!dashboardPath) {
            throw new Error(
                `Your account was authenticated, but the ${roleName} dashboard path has not been configured in the frontend yet. Please contact your project team.`
            );
        }

        localStorage.setItem(AUTH_TOKEN_KEY, token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));

        window.location.assign(dashboardPath);
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        clearMessage();

        if (!validateForm()) {
            showMessage("Please correct the highlighted fields.");
            return;
        }

        setLoading(true);

        try {
            await login(emailInput.value.trim(), passwordInput.value);
        } catch (error) {
            console.error("JobTrack login error:", error);

            const isNetworkError =
                error instanceof TypeError && error.message === "Failed to fetch";

            showMessage(
                isNetworkError
                    ? "Could not connect to the JobTrack API. Check that the Laravel server is available at https://jobtrack-fk7m.onrender.com and that CORS is configured."
                    : (error.message || "Unable to sign in. Please try again.")
            );
        } finally {
            setLoading(false);
        }
    });

    // Keep validation feedback responsive after the user edits a field.
    emailInput.addEventListener("input", () => {
        emailInput.classList.remove("is-invalid");
        clearMessage();
    });

    passwordInput.addEventListener("input", () => {
        passwordInput.classList.remove("is-invalid");
        clearMessage();
    });
})();
