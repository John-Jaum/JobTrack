
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    const state = {
        page: 1,
        perPage: 10,
        lastPage: 1,
        total: 0,
        unreadCount: 0,
        notifications: [],
        loading: false,
        updatingIds: new Set(),
        markingAllRead: false
    };

    const alertBox = $("technicianNotificationsAlert");
    const refreshButton = $("refreshTechnicianNotificationsButton");
    const markAllButton = $(
        "markAllTechnicianNotificationsReadButton"
    );

    function showAlert(message, type = "danger") {
        alertBox.textContent = message;
        alertBox.className = `alert alert-${type}`;
    }

    function hideAlert() {
        alertBox.textContent = "";
        alertBox.className = "alert d-none";
    }

    function unwrapData(response) {
        if (
            response &&
            Object.prototype.hasOwnProperty.call(response, "data")
        ) {
            return response.data;
        }

        return response;
    }

    async function apiRequest(path, options) {
        if (typeof window.apiRequest !== "function") {
            throw new Error(
                "The shared API helper was not found. Check ../../js/app.js."
            );
        }

        return window.apiRequest(path, options);
    }

    function formatDate(value) {
        if (!value) return "Date unavailable";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    function isRead(notification) {
        return notification.is_read === true ||
            notification.is_read === 1 ||
            notification.is_read === "1";
    }

    function getNotificationType(notification) {
        if (typeof notification.type === "string") {
            return notification.type;
        }

        return notification.type?.type_name || "Notification";
    }

    function updateUnreadIndicators() {
        const count = Math.max(0, Number(state.unreadCount) || 0);

        $("technicianUnreadNotificationsCount").textContent =
            count.toLocaleString();

        const sidebarBadge = $("technicianSidebarUnreadCount");
        sidebarBadge.textContent = String(count);
        sidebarBadge.classList.toggle("d-none", count === 0);

        markAllButton.disabled =
            state.loading ||
            state.markingAllRead ||
            count === 0;
    }

    function updatePagination(meta = {}) {
        state.page = Math.max(
            1,
            Number(meta.current_page) || state.page
        );

        state.perPage = Math.max(
            1,
            Number(meta.per_page) || state.perPage
        );

        state.total = Math.max(
            0,
            Number(meta.total) || 0
        );

        state.lastPage = Math.max(
            1,
            Number(meta.last_page) || 1
        );

        $("technicianNotificationsPaginationInfo").textContent =
            state.total === 0
                ? "No notifications"
                : `Page ${state.page} of ${state.lastPage} · ${state.total} total`;

        $("previousTechnicianNotificationsPageButton").disabled =
            state.loading || state.page <= 1;

        $("nextTechnicianNotificationsPageButton").disabled =
            state.loading || state.page >= state.lastPage;
    }

    function getRelatedJobOrderUrl(notification) {
        const relatedId = notification.related_job_order_id;

        if (
            relatedId === null ||
            relatedId === undefined ||
            !/^\d+$/.test(String(relatedId))
        ) {
            return null;
        }

        return `job-order-details.html?jobOrderId=${encodeURIComponent(relatedId)}`;
    }

    function createNotificationItem(notification) {
        const read = isRead(notification);

        const item = document.createElement("div");
        item.className = "list-group-item py-3";

        if (!read) {
            item.classList.add("border-start", "border-primary", "border-3");
        }

        const topRow = document.createElement("div");
        topRow.className =
            "d-flex justify-content-between align-items-start gap-3";

        const main = document.createElement("div");
        main.className = "flex-grow-1";

        const titleRow = document.createElement("div");
        titleRow.className =
            "d-flex flex-wrap align-items-center gap-2 mb-2";

        const typeLabel = document.createElement("span");
        typeLabel.className = "badge bg-light text-dark border";
        typeLabel.textContent = getNotificationType(notification);
        titleRow.appendChild(typeLabel);

        const readLabel = document.createElement("span");
        readLabel.className = read
            ? "badge bg-secondary"
            : "badge bg-primary";
        readLabel.textContent = read ? "Read" : "Unread";
        titleRow.appendChild(readLabel);

        const message = document.createElement("p");
        message.className = "mb-2";
        message.textContent = notification.message || "No message provided.";

        const timestamp = document.createElement("small");
        timestamp.className = "text-muted";
        timestamp.textContent = formatDate(notification.created_at);

        main.appendChild(titleRow);
        main.appendChild(message);
        main.appendChild(timestamp);

        const actions = document.createElement("div");
        actions.className =
            "d-flex flex-column flex-sm-row gap-2 flex-shrink-0";

        const jobUrl = getRelatedJobOrderUrl(notification);

        if (jobUrl) {
            const viewJobLink = document.createElement("a");
            viewJobLink.className = "btn btn-sm btn-outline-primary";
            viewJobLink.href = jobUrl;
            viewJobLink.textContent = "View Job";
            actions.appendChild(viewJobLink);
        }

        if (!read) {
            const markReadButton = document.createElement("button");

            markReadButton.type = "button";
            markReadButton.className =
                "btn btn-sm btn-outline-secondary";

            markReadButton.textContent =
                state.updatingIds.has(notification.notification_id)
                    ? "Updating..."
                    : "Mark as Read";

            markReadButton.disabled =
                state.updatingIds.has(notification.notification_id) ||
                state.markingAllRead;

            markReadButton.addEventListener("click", () => {
                markNotificationRead(notification.notification_id);
            });

            actions.appendChild(markReadButton);
        }

        topRow.appendChild(main);
        topRow.appendChild(actions);
        item.appendChild(topRow);

        return item;
    }

    function renderNotifications() {
        const list = $("technicianNotificationsList");
        const emptyState = $("technicianNotificationsEmptyState");

        list.replaceChildren();

        $("technicianLoadedNotificationsCount").textContent =
            state.notifications.length.toLocaleString();

        $("technicianNotificationsResultLabel").textContent =
            `${state.total.toLocaleString()} notification(s)`;

        if (state.notifications.length === 0) {
            list.classList.add("d-none");
            emptyState.classList.remove("d-none");

            const filter = $("technicianNotificationReadFilter").value;

            $("technicianNotificationsEmptyTitle").textContent =
                filter === "unread"
                    ? "You're all caught up!"
                    : filter === "read"
                        ? "No read notifications"
                        : "No notifications yet";

            $("technicianNotificationsEmptyMessage").textContent =
                filter === "unread"
                    ? "You have no unread notifications on this page."
                    : filter === "read"
                        ? "Notifications you have read will appear here."
                        : "New job assignment and status updates will appear here.";

            return;
        }

        emptyState.classList.add("d-none");
        list.classList.remove("d-none");

        state.notifications.forEach((notification) => {
            list.appendChild(createNotificationItem(notification));
        });
    }

    async function loadCurrentUser() {
        const response = await apiRequest("/auth/me");
        const user = unwrapData(response);

        $("technicianName").textContent =
            user?.full_name || "Technician";
    }

    async function loadNotifications() {
        if (state.loading) return;

        state.loading = true;
        hideAlert();

        $("technicianNotificationsLoading").classList.remove("d-none");
        $("technicianNotificationsEmptyState").classList.add("d-none");
        $("technicianNotificationsList").classList.add("d-none");

        refreshButton.disabled = true;
        refreshButton.textContent = "Refreshing...";

        $("previousTechnicianNotificationsPageButton").disabled = true;
        $("nextTechnicianNotificationsPageButton").disabled = true;
        markAllButton.disabled = true;

        try {
            const params = new URLSearchParams({
                page: String(state.page),
                per_page: String(state.perPage)
            });

            const filter = $("technicianNotificationReadFilter").value;

            if (filter === "unread") {
                params.set("is_read", "false");
            } else if (filter === "read") {
                params.set("is_read", "true");
            }

            const response = await apiRequest(
                `/notifications?${params.toString()}`
            );

            /*
             * Expected API response:
             * {
             *   data: [...],
             *   meta: {
             *     current_page, per_page, total, last_page, unread_count
             *   }
             * }
             *
             * Keep the envelope so we can read meta as well as data.
             */
            const payload = unwrapData(response);

            state.notifications = Array.isArray(payload)
                ? payload
                : [];

            const meta = response?.meta || {};

            state.unreadCount = Number(meta.unread_count) || 0;

            updatePagination({
                current_page: meta.current_page || state.page,
                per_page: meta.per_page || state.perPage,
                total: meta.total ?? state.notifications.length,
                last_page: meta.last_page || state.page
            });

            updateUnreadIndicators();
            renderNotifications();
        } catch (error) {
            console.error("Failed to load technician notifications:", error);

            state.notifications = [];
            $("technicianNotificationsList").replaceChildren();
            $("technicianNotificationsList").classList.add("d-none");

            $("technicianNotificationsEmptyState").classList.remove("d-none");
            $("technicianNotificationsEmptyTitle").textContent =
                "Unable to load notifications";
            $("technicianNotificationsEmptyMessage").textContent =
                "Check your connection and try refreshing.";

            $("technicianNotificationsResultLabel").textContent =
                "Unable to load notifications";

            showAlert(
                "Unable to retrieve notifications. The backend may still " +
                "be under development, or the request may have failed. " +
                "Check the browser console for details."
            );
        } finally {
            state.loading = false;

            $("technicianNotificationsLoading").classList.add("d-none");

            refreshButton.disabled = false;
            refreshButton.textContent = "Refresh";

            updateUnreadIndicators();
            updatePagination({
                current_page: state.page,
                per_page: state.perPage,
                total: state.total,
                last_page: state.lastPage
            });
        }
    }

    async function markNotificationRead(notificationId) {
        if (
            state.loading ||
            state.markingAllRead ||
            state.updatingIds.has(notificationId)
        ) {
            return;
        }

        state.updatingIds.add(notificationId);
        hideAlert();
        renderNotifications();

        try {
            await apiRequest(
                `/notifications/${encodeURIComponent(notificationId)}/read`,
                { method: "POST" }
            );

            showAlert("Notification marked as read.", "success");
            await loadNotifications();
        } catch (error) {
            console.error("Failed to mark notification as read:", error);

            showAlert(
                error.message ||
                "Unable to mark this notification as read."
            );
        } finally {
            state.updatingIds.delete(notificationId);
            renderNotifications();
        }
    }

    async function markAllNotificationsRead() {
        if (
            state.loading ||
            state.markingAllRead ||
            state.unreadCount === 0
        ) {
            return;
        }

        state.markingAllRead = true;
        markAllButton.disabled = true;
        markAllButton.textContent = "Updating...";
        hideAlert();

        try {
            // Contract specifies a 204 No Content response.
            await apiRequest("/notifications/read-all", {
                method: "POST"
            });

            showAlert(
                "All notifications have been marked as read.",
                "success"
            );

            state.page = 1;
            await loadNotifications();
        } catch (error) {
            console.error("Failed to mark all notifications as read:", error);

            showAlert(
                error.message ||
                "Unable to mark all notifications as read."
            );
        } finally {
            state.markingAllRead = false;
            markAllButton.textContent = "Mark All as Read";
            updateUnreadIndicators();
        }
    }

    refreshButton.addEventListener("click", async () => {
        try {
            await loadCurrentUser();
        } catch (error) {
            console.error("Unable to refresh technician profile:", error);
        }

        await loadNotifications();
    });

    markAllButton.addEventListener(
        "click",
        markAllNotificationsRead
    );

    $("technicianNotificationReadFilter").addEventListener(
        "change",
        () => {
            state.page = 1;
            loadNotifications();
        }
    );

    $("clearTechnicianNotificationFilterButton").addEventListener(
        "click",
        () => {
            $("technicianNotificationReadFilter").value = "all";
            state.page = 1;
            loadNotifications();
        }
    );

    $("previousTechnicianNotificationsPageButton").addEventListener(
        "click",
        () => {
            if (!state.loading && state.page > 1) {
                state.page -= 1;
                loadNotifications();
            }
        }
    );

    $("nextTechnicianNotificationsPageButton").addEventListener(
        "click",
        () => {
            if (!state.loading && state.page < state.lastPage) {
                state.page += 1;
                loadNotifications();
            }
        }
    );

    $("logoutButton").addEventListener("click", () => {
        if (typeof window.logoutUser === "function") {
            window.logoutUser();
        } else if (typeof window.redirectToLogin === "function") {
            window.redirectToLogin();
        } else {
            showAlert(
                "The shared logout function was not found in js/app.js."
            );
        }
    });

    async function initializePage() {
        try {
            await loadCurrentUser();
        } catch (error) {
            console.error("Unable to load technician profile:", error);
        }

        await loadNotifications();
    }

    initializePage();
});
