
/**
 * JobTrack - Facilities Officer Notifications
 *
 * API endpoints from jobtrack-openapi.yaml:
 * GET  /notifications
 * POST /notifications/{notificationId}/read
 * POST /notifications/read-all
 *
 * Requires the shared apiRequest() helper from ../../js/app.js.
 */

(() => {
    "use strict";

    const NOTIFICATIONS_ENDPOINT = "/notifications";
    const PER_PAGE = 15;

    const state = {
        notifications: [],
        page: 1,
        perPage: PER_PAGE,
        total: 0,
        lastPage: 1,
        unreadCount: 0,
        filter: "all",
        loading: false,
        busyIds: new Set(),
        markingAllRead: false
    };

    const elements = {};

    document.addEventListener("DOMContentLoaded", initializeNotificationsPage);

    function initializeNotificationsPage() {
        cacheElements();
        bindEvents();
        loadNotifications();
    }

    function cacheElements() {
        const ids = [
            "facilitiesOfficerName",
            "sidebarUnreadCount",
            "notificationsAlert",
            "unreadNotificationsCount",
            "loadedNotificationsCount",
            "markAllNotificationsReadButton",
            "refreshNotificationsButton",
            "notificationReadFilter",
            "notificationsLoading",
            "notificationsEmptyState",
            "notificationsEmptyTitle",
            "notificationsEmptyMessage",
            "notificationsList",
            "notificationsPaginationInfo",
            "previousNotificationsPageButton",
            "nextNotificationsPageButton",
            "logoutButton"
        ];

        ids.forEach((id) => {
            elements[id] = document.getElementById(id);
        });
    }

    function bindEvents() {
        elements.refreshNotificationsButton?.addEventListener(
            "click",
            () => loadNotifications()
        );

        elements.notificationReadFilter?.addEventListener(
            "change",
            (event) => {
                state.filter = event.target.value;
                state.page = 1;
                loadNotifications();
            }
        );

        elements.previousNotificationsPageButton?.addEventListener(
            "click",
            () => {
                if (state.page > 1 && !state.loading) {
                    state.page -= 1;
                    loadNotifications();
                }
            }
        );

        elements.nextNotificationsPageButton?.addEventListener(
            "click",
            () => {
                if (state.page < state.lastPage && !state.loading) {
                    state.page += 1;
                    loadNotifications();
                }
            }
        );

        elements.markAllNotificationsReadButton?.addEventListener(
            "click",
            markAllNotificationsRead
        );

        elements.notificationsList?.addEventListener(
            "click",
            handleNotificationAction
        );

        elements.logoutButton?.addEventListener("click", handleLogout);
    }

    /**
     * The shared app.js helper is expected to handle the API base URL
     * and authentication token.
     */
    async function apiGet(path) {
        if (typeof window.apiRequest !== "function") {
            throw new Error(
                "The shared apiRequest() helper was not found. Check app.js."
            );
        }

        return window.apiRequest(path);
    }

    async function apiPost(path) {
        if (typeof window.apiRequest !== "function") {
            throw new Error(
                "The shared apiRequest() helper was not found. Check app.js."
            );
        }

        return window.apiRequest(path, {
            method: "POST"
        });
    }

    function unwrapResponse(response) {
        // Supports either a parsed API body or a helper that returns
        // a response object containing the parsed body.
        let body = response;

        if (
            body &&
            typeof body.json === "function"
        ) {
            throw new Error(
                "apiRequest() returned a raw Fetch Response. " +
                "It must return parsed JSON for this page."
            );
        }

        if (
            body &&
            body.data &&
            !Array.isArray(body.data) &&
            body.data.data !== undefined
        ) {
            body = body.data;
        }

        return body;
    }

    async function loadNotifications() {
        if (state.loading) return;

        state.loading = true;
        setLoading(true);
        hideAlert();

        try {
            const params = new URLSearchParams({
                page: String(state.page),
                per_page: String(state.perPage)
            });

            if (state.filter === "unread") {
                params.set("is_read", "false");
            } else if (state.filter === "read") {
                params.set("is_read", "true");
            }

            const response = await apiGet(
                `${NOTIFICATIONS_ENDPOINT}?${params.toString()}`
            );

            const body = unwrapResponse(response);

            if (!body || !Array.isArray(body.data)) {
                throw new Error(
                    "The notifications response has an unexpected format."
                );
            }

            const meta = body.meta || {};

            state.notifications = body.data;
            state.total = Number(meta.total ?? body.data.length);
            state.page = Number(meta.current_page ?? state.page);
            state.perPage = Number(meta.per_page ?? state.perPage);
            state.lastPage = Math.max(
                1,
                Number(
                    meta.last_page ??
                    Math.ceil(state.total / state.perPage)
                )
            );

            // The API contract defines unread_count in the list metadata.
            // If absent, don't mistake a filtered page for the global count.
            if (meta.unread_count !== undefined) {
                state.unreadCount = Number(meta.unread_count);
            }

            renderNotifications();
            updateSummary();
            updatePagination();

        } catch (error) {
            console.error("Failed to load notifications:", error);

            state.notifications = [];
            renderNotifications();
            updatePagination();

            showAlert(
                getErrorMessage(error, "Unable to load notifications."),
                "danger"
            );

            if (isUnauthorized(error)) {
                showAlert(
                    "Your session may have expired. Please sign in again.",
                    "warning"
                );
            }
        } finally {
            state.loading = false;
            setLoading(false);
        }
    }

    function renderNotifications() {
        const list = elements.notificationsList;
        if (!list) return;

        list.replaceChildren();

        if (state.notifications.length === 0) {
            elements.notificationsEmptyState?.classList.remove("d-none");

            if (elements.notificationsEmptyTitle) {
                elements.notificationsEmptyTitle.textContent =
                    state.filter === "unread"
                        ? "You're all caught up"
                        : state.filter === "read"
                            ? "No read notifications"
                            : "No notifications yet";
            }

            if (elements.notificationsEmptyMessage) {
                elements.notificationsEmptyMessage.textContent =
                    state.filter === "unread"
                        ? "You have no unread notifications."
                        : state.filter === "read"
                            ? "Notifications you've read will appear here."
                            : "New activity will appear here when available.";
            }

            return;
        }

        elements.notificationsEmptyState?.classList.add("d-none");

        state.notifications.forEach((notification) => {
            list.appendChild(createNotificationElement(notification));
        });
    }

    function createNotificationElement(notification) {
        const item = document.createElement("div");

        item.className =
            "list-group-item px-2 px-md-3 py-3";

        if (!notification.is_read) {
            item.classList.add("bg-light");
        }

        const row = document.createElement("div");
        row.className = "d-flex align-items-start gap-3";

        const indicator = document.createElement("div");
        indicator.className = "pt-1";

        const dot = document.createElement("span");
        dot.className = notification.is_read
            ? "d-inline-block rounded-circle bg-secondary"
            : "d-inline-block rounded-circle bg-primary";

        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.setAttribute(
            "aria-label",
            notification.is_read ? "Read" : "Unread"
        );

        indicator.appendChild(dot);

        const content = document.createElement("div");
        content.className = "flex-grow-1";

        const heading = document.createElement("div");
        heading.className =
            "d-flex flex-wrap align-items-center gap-2 mb-1";

        const typeName =
            notification.type?.type_name || "Notification";

        const typeBadge = document.createElement("span");
        typeBadge.className = getNotificationTypeClass(typeName);
        typeBadge.textContent = typeName;

        const readBadge = document.createElement("span");
        readBadge.className = notification.is_read
            ? "badge text-bg-light border"
            : "badge text-bg-primary";

        readBadge.textContent = notification.is_read ? "Read" : "Unread";

        heading.append(typeBadge, readBadge);

        const message = document.createElement("p");
        message.className = "mb-2";
        message.textContent = notification.message || "No message provided.";

        const timestamp = document.createElement("small");
        timestamp.className = "text-muted";
        timestamp.textContent = formatDateTime(notification.created_at);

        content.append(heading, message, timestamp);

        const actions = document.createElement("div");
        actions.className =
            "d-flex flex-column align-items-end gap-2";

        const jobOrderId = notification.related_job_order_id;

        if (jobOrderId !== null && jobOrderId !== undefined) {
            const jobOrderLink = document.createElement("a");
            jobOrderLink.className = "btn btn-sm btn-outline-primary";
            jobOrderLink.href =
                `job-orders.html?jobOrderId=${encodeURIComponent(jobOrderId)}`;
            jobOrderLink.textContent = `Job Order #${jobOrderId}`;
            actions.appendChild(jobOrderLink);
        }

        if (!notification.is_read) {
            const readButton = document.createElement("button");

            readButton.type = "button";
            readButton.className = "btn btn-sm btn-outline-secondary";
            readButton.dataset.action = "mark-read";
            readButton.dataset.notificationId =
                String(notification.notification_id);
            readButton.textContent = "Mark as read";

            const isBusy = state.busyIds.has(
                String(notification.notification_id)
            );

            readButton.disabled = isBusy;
            if (isBusy) readButton.textContent = "Saving...";

            actions.appendChild(readButton);
        }

        row.append(indicator, content, actions);
        item.appendChild(row);

        return item;
    }

    function getNotificationTypeClass(typeName) {
        const name = String(typeName).toLowerCase();

        if (name.includes("urgent") || name.includes("error")) {
            return "badge text-bg-danger";
        }

        if (name.includes("job")) {
            return "badge text-bg-info";
        }

        if (name.includes("request")) {
            return "badge text-bg-primary";
        }

        return "badge text-bg-secondary";
    }

    async function handleNotificationAction(event) {
        const button = event.target.closest(
            'button[data-action="mark-read"]'
        );

        if (!button) return;

        const notificationId = button.dataset.notificationId;
        if (!notificationId || state.busyIds.has(notificationId)) return;

        state.busyIds.add(notificationId);
        button.disabled = true;
        button.textContent = "Saving...";
        hideAlert();

        try {
            await apiPost(
                `${NOTIFICATIONS_ENDPOINT}/${encodeURIComponent(notificationId)}/read`
            );

            // Reload from the API so the read status and unread count
            // reflect the server's authoritative state.
            await reloadAfterAction("Notification marked as read.");

        } catch (error) {
            console.error("Failed to mark notification as read:", error);

            showAlert(
                getErrorMessage(error, "Unable to mark this notification as read."),
                "danger"
            );
        } finally {
            state.busyIds.delete(notificationId);
        }
    }

    async function markAllNotificationsRead() {
        if (state.markingAllRead || state.unreadCount === 0) return;

        const confirmed = window.confirm(
            "Mark all your notifications as read?"
        );

        if (!confirmed) return;

        state.markingAllRead = true;
        updateActionButtons();
        hideAlert();

        try {
            await apiPost(`${NOTIFICATIONS_ENDPOINT}/read-all`);

            state.page = 1;
            state.filter = "all";

            if (elements.notificationReadFilter) {
                elements.notificationReadFilter.value = "all";
            }

            await loadNotifications();

            showAlert("All notifications have been marked as read.", "success");

        } catch (error) {
            console.error("Failed to mark all notifications as read:", error);

            showAlert(
                getErrorMessage(error, "Unable to mark all notifications as read."),
                "danger"
            );
        } finally {
            state.markingAllRead = false;
            updateActionButtons();
        }
    }

    async function reloadAfterAction(successMessage) {
        await loadNotifications();
        showAlert(successMessage, "success");
    }

    function updateSummary() {
        if (elements.unreadNotificationsCount) {
            elements.unreadNotificationsCount.textContent =
                String(state.unreadCount);
        }

        if (elements.sidebarUnreadCount) {
            elements.sidebarUnreadCount.textContent =
                String(state.unreadCount);

            elements.sidebarUnreadCount.classList.toggle(
                "d-none",
                state.unreadCount === 0
            );
        }

        if (elements.loadedNotificationsCount) {
            elements.loadedNotificationsCount.textContent =
                String(state.notifications.length);
        }

        updateActionButtons();
    }

    function updateActionButtons() {
        if (elements.markAllNotificationsReadButton) {
            elements.markAllNotificationsReadButton.disabled =
                state.loading ||
                state.markingAllRead ||
                state.unreadCount === 0;

            elements.markAllNotificationsReadButton.textContent =
                state.markingAllRead
                    ? "Marking as Read..."
                    : "Mark All as Read";
        }

        if (elements.refreshNotificationsButton) {
            elements.refreshNotificationsButton.disabled = state.loading;
            elements.refreshNotificationsButton.textContent =
                state.loading ? "Refreshing..." : "Refresh";
        }
    }

    function updatePagination() {
        const start = state.total === 0
            ? 0
            : (state.page - 1) * state.perPage + 1;

        const end = Math.min(
            state.page * state.perPage,
            state.total
        );

        if (elements.notificationsPaginationInfo) {
            elements.notificationsPaginationInfo.textContent =
                state.total === 0
                    ? "No notifications to display"
                    : `Showing ${start}–${end} of ${state.total} notifications`;
        }

        if (elements.previousNotificationsPageButton) {
            elements.previousNotificationsPageButton.disabled =
                state.loading || state.page <= 1;
        }

        if (elements.nextNotificationsPageButton) {
            elements.nextNotificationsPageButton.disabled =
                state.loading || state.page >= state.lastPage;
        }
    }

    function setLoading(isLoading) {
        if (elements.notificationsLoading) {
            elements.notificationsLoading.classList.toggle(
                "d-none",
                !isLoading
            );
        }

        updateActionButtons();
        updatePagination();
    }

    function showAlert(message, type = "info") {
        const alert = elements.notificationsAlert;
        if (!alert) return;

        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        alert.classList.remove("d-none");
    }

    function hideAlert() {
        elements.notificationsAlert?.classList.add("d-none");
    }

    function formatDateTime(value) {
        if (!value) return "Date unavailable";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(date);
    }

    function getErrorMessage(error, fallback) {
        if (error?.message) return error.message;
        return fallback;
    }

    function isUnauthorized(error) {
        return (
            error?.status === 401 ||
            error?.statusCode === 401
        );
    }

    function handleLogout(event) {
        event.preventDefault();

        // Prefer the shared authentication/logout function, if app.js
        // exposes it globally.
        if (typeof window.logoutUser === "function") {
            window.logoutUser();
            return;
        }

        if (typeof window.redirectToLogin === "function") {
            window.redirectToLogin();
            return;
        }

        // Fallback navigation only. Prefer the shared logout helper,
        // which should clear the authentication token and user data.
        window.location.assign("../../index.html");
    }
})();
