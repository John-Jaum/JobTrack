
/**
 * JobTrack - Inventory Staff Dashboard
 *
 * Confirmed integration:
 * - GET /auth/me
 * - GET /notifications?page=1&per_page=1
 *
 * Inventory summary and material transaction endpoints are intentionally
 * not called until their API contracts are finalized.
 */

document.addEventListener("DOMContentLoaded", () => {
    const state = {
        user: null,
        unreadCount: null
    };

    const elements = {
        alert: document.getElementById("inventoryDashboardAlert"),

        sidebarUserName: document.getElementById(
            "inventorySidebarUserName"
        ),
        topbarUserName: document.getElementById(
            "inventoryTopbarUserName"
        ),
        welcomeName: document.getElementById(
            "inventoryWelcomeName"
        ),

        unreadNotifications: document.getElementById(
            "inventoryUnreadNotifications"
        ),
        sidebarUnreadCount: document.getElementById(
            "inventorySidebarUnreadCount"
        ),

        refreshButton: document.getElementById(
            "refreshInventoryDashboardButton"
        ),

        activityLoading: document.getElementById(
            "inventoryActivityLoading"
        ),
        activityEmptyState: document.getElementById(
            "inventoryActivityEmptyState"
        ),
        activityContainer: document.getElementById(
            "inventoryActivityContainer"
        ),

        logoutButton: document.getElementById("logoutButton")
    };

    /**
     * Displays a dashboard alert.
     */
    function showAlert(message, type = "warning") {
        if (!elements.alert) return;

        elements.alert.textContent = message;
        elements.alert.className = `alert alert-${type}`;
        elements.alert.classList.remove("d-none");
    }

    function hideAlert() {
        if (!elements.alert) return;

        elements.alert.textContent = "";
        elements.alert.classList.add("d-none");
    }

    /**
     * Handles either a raw API envelope or an already-unwrapped payload.
     */
    function unwrapData(response) {
        if (
            response &&
            typeof response === "object" &&
            Object.prototype.hasOwnProperty.call(response, "data")
        ) {
            return response.data;
        }

        return response;
    }

    /**
     * Extracts a display name without assuming a single user schema shape.
     */
    function getDisplayName(user) {
        if (!user || typeof user !== "object") {
            return "Inventory Staff";
        }

        const name =
            user.full_name ??
            user.name ??
            [user.first_name, user.last_name]
                .filter(Boolean)
                .join(" ");

        return String(name || "Inventory Staff");
    }

    /**
     * Updates all user-name locations.
     */
    function renderUser(user) {
        state.user = user;

        const name = getDisplayName(user);

        if (elements.sidebarUserName) {
            elements.sidebarUserName.textContent = name;
        }

        if (elements.topbarUserName) {
            elements.topbarUserName.textContent = name;
        }

        if (elements.welcomeName) {
            elements.welcomeName.textContent = name;
        }
    }

    /**
     * Renders the unread notification count.
     */
    function renderUnreadCount(count) {
        const validCount =
            Number.isFinite(Number(count)) &&
            Number(count) >= 0;

        state.unreadCount = validCount ? Number(count) : null;

        if (elements.unreadNotifications) {
            elements.unreadNotifications.textContent =
                state.unreadCount === null
                    ? "—"
                    : String(state.unreadCount);
        }

        if (elements.sidebarUnreadCount) {
            if (state.unreadCount === null || state.unreadCount === 0) {
                elements.sidebarUnreadCount.classList.add("d-none");
            } else {
                elements.sidebarUnreadCount.textContent =
                    state.unreadCount > 99
                        ? "99+"
                        : String(state.unreadCount);

                elements.sidebarUnreadCount.classList.remove("d-none");
            }
        }
    }

    /**
     * Keeps inventory activity in an honest pending state until
     * the inventory transaction endpoint and response schema are confirmed.
     */
    function renderPendingInventoryActivity() {
        if (elements.activityLoading) {
            elements.activityLoading.textContent =
                "Recent material transactions will appear when the inventory " +
                "API endpoint is available.";

            elements.activityLoading.classList.remove("d-none");
        }

        elements.activityEmptyState?.classList.add("d-none");
        elements.activityContainer?.classList.add("d-none");
    }

    /**
     * Loads the authenticated user.
     */
    async function loadCurrentUser() {
        if (typeof window.apiRequest !== "function") {
            showAlert(
                "The shared API helper is unavailable. Check that app.js " +
                "loads before inventory-dashboard.js.",
                "danger"
            );
            return;
        }

        try {
            const response = await window.apiRequest("/auth/me");
            const payload = unwrapData(response);

            // Some APIs return { user: {...} }; others return the user directly.
            const user = payload?.user ?? payload;

            if (!user || typeof user !== "object") {
                throw new Error("The current user response was invalid.");
            }

            renderUser(user);
        } catch (error) {
            console.error("Unable to load the current user:", error);

            showAlert(
                "Unable to load your account information. " +
                "Please refresh the page or sign in again.",
                "warning"
            );
        }
    }

    /**
     * Loads unread notification metadata using the existing notifications API.
     */
    async function loadUnreadNotifications() {
        if (typeof window.apiRequest !== "function") {
            renderUnreadCount(null);
            return;
        }

        try {
            const response = await window.apiRequest(
                "/notifications?page=1&per_page=1"
            );

            // Keep the envelope so pagination metadata remains accessible.
            const envelope =
                response &&
                typeof response === "object" &&
                Object.prototype.hasOwnProperty.call(response, "data")
                    ? response
                    : null;

            const payload = unwrapData(response);
            const meta = envelope?.meta ?? payload?.meta ?? null;

            if (
                meta &&
                Object.prototype.hasOwnProperty.call(meta, "unread_count")
            ) {
                renderUnreadCount(meta.unread_count);
            } else {
                // Do not invent a count by assuming the first page is complete.
                renderUnreadCount(null);
            }
        } catch (error) {
            console.error(
                "Unable to load unread notifications:",
                error
            );

            renderUnreadCount(null);
        }
    }

    /**
     * Refreshes data that is supported by the current API contract.
     */
    async function refreshDashboard() {
        hideAlert();

        if (elements.refreshButton) {
            elements.refreshButton.disabled = true;
            elements.refreshButton.textContent = "Refreshing...";
        }

        try {
            renderPendingInventoryActivity();

            await Promise.all([
                loadCurrentUser(),
                loadUnreadNotifications()
            ]);
        } finally {
            if (elements.refreshButton) {
                elements.refreshButton.disabled = false;
                elements.refreshButton.textContent = "Refresh";
            }
        }
    }

    /**
     * Uses the existing shared logout behavior.
     */
    function handleLogout() {
        if (typeof window.logoutUser === "function") {
            window.logoutUser();
            return;
        }

        if (typeof window.redirectToLogin === "function") {
            window.redirectToLogin();
            return;
        }

        showAlert(
            "The shared logout function is unavailable. " +
            "Check the logout implementation in app.js.",
            "danger"
        );
    }

    elements.refreshButton?.addEventListener(
        "click",
        refreshDashboard
    );

    elements.logoutButton?.addEventListener(
        "click",
        handleLogout
    );

    // Use the project's shared authentication guard when available.
    if (
        typeof AUTH_TOKEN_KEY !== "undefined" &&
        !localStorage.getItem(AUTH_TOKEN_KEY)
    ) {
        if (typeof window.redirectToLogin === "function") {
            window.redirectToLogin();
            return;
        }
    }

    renderUnreadCount(null);
    renderPendingInventoryActivity();
    refreshDashboard();
});
