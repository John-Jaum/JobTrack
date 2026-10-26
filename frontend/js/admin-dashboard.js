
(() => {
    "use strict";

    const AUTH_TOKEN_KEY = "jobtrack_token";
    const PAGE_SIZE = 1;

    const el = {
        alert: document.getElementById("adminDashboardAlert"),
        topbarName: document.getElementById("adminTopbarUserName"),
        welcomeName: document.getElementById("adminWelcomeName"),

        totalUsers: document.getElementById("adminTotalUsers"),
        totalJobOrders: document.getElementById("adminTotalJobOrders"),
        totalMaterials: document.getElementById("adminTotalMaterials"),
        unreadNotifications: document.getElementById(
            "adminUnreadNotifications"
        ),

        sidebarUnreadCount: document.getElementById(
            "adminSidebarUnreadCount"
        ),

        refresh: document.getElementById(
            "refreshAdminDashboardButton"
        ),
        logout: document.getElementById("logoutButton"),

        activityLoading: document.getElementById("adminActivityLoading"),
        activityEmpty: document.getElementById("adminActivityEmptyState"),
        activityContainer: document.getElementById(
            "adminActivityContainer"
        ),
        activityTableBody: document.getElementById(
            "adminActivityTableBody"
        )
    };

    let isLoading = false;

    function showAlert(message, type = "danger") {
        if (!el.alert) return;

        el.alert.textContent = message;
        el.alert.className = `alert alert-${type}`;
    }

    function hideAlert() {
        if (!el.alert) return;

        el.alert.textContent = "";
        el.alert.className = "alert d-none";
    }

    function setMetric(element, value) {
        if (!element) return;

        element.textContent =
            Number.isFinite(value) && value >= 0
                ? value.toLocaleString()
                : "—";
    }

    function getPayload(response) {
        // app.js returns response.json(), so the API envelope
        // is expected to remain intact.
        return response?.data;
    }

    function getListMeta(response) {
        return response?.meta;
    }

    async function requestJson(path) {
        if (typeof window.apiRequest !== "function") {
            throw new Error(
                "The shared API helper is unavailable. Check js/app.js."
            );
        }

        return window.apiRequest(path);
    }

    async function loadCurrentUser() {
        const response = await requestJson("/auth/me");
        const user = getPayload(response);

        if (!user) {
            throw new Error("The current-user response was invalid.");
        }

        const fullName = user.full_name || "Administrator";
        const roleName = user.role?.role_name;

        if (el.topbarName) {
            el.topbarName.textContent = fullName;
        }

        if (el.welcomeName) {
            el.welcomeName.textContent = fullName;
        }

        if (roleName && roleName !== "Administrator") {
            showAlert(
                "This account is not identified as an Administrator. " +
                "The backend must enforce administrator-only access.",
                "warning"
            );
        }

        return user;
    }

    async function loadUserCount() {
        const response = await requestJson(
            `/users?per_page=${PAGE_SIZE}&page=1`
        );

        const meta = getListMeta(response);
        const total = Number(meta?.total);

        if (!Number.isFinite(total) || total < 0) {
            throw new Error("The users response did not contain meta.total.");
        }

        setMetric(el.totalUsers, total);
    }

    async function loadJobOrderCount() {
        const response = await requestJson(
            `/job-orders?per_page=${PAGE_SIZE}&page=1`
        );

        const meta = getListMeta(response);
        const total = Number(meta?.total);

        if (!Number.isFinite(total) || total < 0) {
            throw new Error(
                "The job-orders response did not contain meta.total."
            );
        }

        setMetric(el.totalJobOrders, total);
    }

    async function loadMaterialCount() {
        const response = await requestJson(
            `/materials?per_page=${PAGE_SIZE}&page=1`
        );

        const meta = getListMeta(response);
        const total = Number(meta?.total);

        if (!Number.isFinite(total) || total < 0) {
            throw new Error(
                "The materials response did not contain meta.total."
            );
        }

        setMetric(el.totalMaterials, total);
    }

    async function loadUnreadNotifications() {
        const response = await requestJson(
            `/notifications?per_page=${PAGE_SIZE}&page=1`
        );

        const meta = getListMeta(response);
        const unreadCount = Number(meta?.unread_count);

        if (!Number.isFinite(unreadCount) || unreadCount < 0) {
            throw new Error(
                "The notifications response did not contain " +
                "meta.unread_count."
            );
        }

        setMetric(el.unreadNotifications, unreadCount);

        if (el.sidebarUnreadCount) {
            el.sidebarUnreadCount.textContent = String(unreadCount);
            el.sidebarUnreadCount.classList.toggle(
                "d-none",
                unreadCount === 0
            );
        }
    }

    async function loadDashboardSummary() {
        const response = await requestJson("/dashboard/summary");
        const summary = getPayload(response);

        if (!summary) {
            throw new Error("The dashboard summary response was invalid.");
        }

        // The v5 schema only defines role-relevant summary blocks.
        // The Administrator block is not explicitly defined.
        // Do not use another role's metrics as administrator totals.
        return summary;
    }

    function showActivityNotAvailable() {
        if (el.activityTableBody) {
            el.activityTableBody.replaceChildren();
        }

        if (el.activityContainer) {
            el.activityContainer.classList.add("d-none");
        }

        if (el.activityEmpty) {
            el.activityEmpty.classList.add("d-none");
        }

        if (el.activityLoading) {
            el.activityLoading.textContent =
                "A global audit-trail or recent-activity endpoint " +
                "is not defined in API contract v5. No activity data " +
                "has been loaded.";
            el.activityLoading.classList.remove("d-none");
        }
    }

    async function runTask(label, task, errors) {
        try {
            await task();
        } catch (error) {
            console.error(`${label} failed:`, error);
            errors.push(label);
        }
    }

    async function loadDashboard() {
        if (isLoading) return;

        isLoading = true;
        hideAlert();

        if (el.refresh) {
            el.refresh.disabled = true;
            el.refresh.textContent = "Refreshing...";
        }

        const errors = [];

        // Keep the activity panel honest: v5 has no global audit feed.
        showActivityNotAvailable();

        try {
            // Load independently so one unavailable endpoint does not
            // prevent other dashboard cards from updating.
            const results = await Promise.all([
                runTask("Current user", loadCurrentUser, errors),
                runTask("Registered users", loadUserCount, errors),
                runTask("Job orders", loadJobOrderCount, errors),
                runTask("Inventory materials", loadMaterialCount, errors),
                runTask(
                    "Unread notifications",
                    loadUnreadNotifications,
                    errors
                ),
                runTask(
                    "Dashboard summary",
                    loadDashboardSummary,
                    errors
                )
            ]);

            void results;

            if (errors.length > 0) {
                showAlert(
                    "Some dashboard data could not be loaded: " +
                    errors.join(", ") +
                    ". Check the API implementation, authentication, " +
                    "and browser console.",
                    "warning"
                );
            } else {
                showAlert("Dashboard data refreshed.", "success");
            }
        } catch (error) {
            console.error("Dashboard loading failed:", error);
            showAlert(
                error?.message || "Unable to load dashboard data."
            );
        } finally {
            isLoading = false;

            if (el.refresh) {
                el.refresh.disabled = false;
                el.refresh.textContent = "Refresh";
            }
        }
    }

    async function logout() {
        if (el.logout) {
            el.logout.disabled = true;
        }

        try {
            if (typeof window.apiRequest === "function" &&
                localStorage.getItem(AUTH_TOKEN_KEY)) {
                await window.apiRequest("/auth/logout", {
                    method: "POST"
                });
            }
        } catch (error) {
            // Clear the local session even if the server logout request
            // fails, for example when the token has expired.
            console.error("Logout request failed:", error);
        } finally {
            localStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem("jobtrack_user");

            window.location.assign("../../index.html");
        }
    }

    if (el.refresh) {
        el.refresh.addEventListener("click", loadDashboard);
    }

    if (el.logout) {
        el.logout.addEventListener("click", logout);
    }

    if (!localStorage.getItem(AUTH_TOKEN_KEY)) {
        window.location.assign("../../index.html");
        return;
    }

    loadDashboard();
})();
