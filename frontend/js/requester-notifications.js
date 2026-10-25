
/**
 * JobTrack - Requester Notifications
 *
 * Documented API endpoints:
 * GET  /notifications
 * POST /notifications/{notificationId}/read
 * POST /notifications/read-all
 *
 * Uses apiRequest() from ../../js/app.js.
 */

(() => {
    "use strict";

    const ENDPOINT = "/notifications";
    const PER_PAGE = 15;

    const state = {
        notifications: [],
        page: 1,
        perPage: PER_PAGE,
        total: 0,
        lastPage: 1,
        unreadCount: null,
        filter: "all",
        loading: false,
        busyIds: new Set(),
        markingAll: false
    };

    const el = {};

    document.addEventListener("DOMContentLoaded", initialize);

    function initialize() {
        cacheElements();
        bindEvents();
        loadNotifications();
    }

    function cacheElements() {
        [
            "requesterName",
            "requesterSidebarUnreadCount",
            "requesterNotificationsAlert",
            "requesterUnreadCount",
            "requesterLoadedCount",
            "markAllRequesterNotificationsReadButton",
            "refreshRequesterNotificationsButton",
            "requesterNotificationReadFilter",
            "requesterNotificationsLoading",
            "requesterNotificationsEmptyState",
            "requesterNotificationsEmptyTitle",
            "requesterNotificationsEmptyMessage",
            "requesterNotificationsList",
            "requesterNotificationsPaginationInfo",
            "previousRequesterNotificationsPageButton",
            "nextRequesterNotificationsPageButton",
            "logoutButton"
        ].forEach((id) => {
            el[id] = document.getElementById(id);
        });
    }

    function bindEvents() {
        el.refreshRequesterNotificationsButton?.addEventListener(
            "click",
            loadNotifications
        );

        el.requesterNotificationReadFilter?.addEventListener(
            "change",
            (event) => {
                state.filter = event.target.value;
                state.page = 1;
                loadNotifications();
            }
        );

        el.previousRequesterNotificationsPageButton?.addEventListener(
            "click",
            () => {
                if (!state.loading && state.page > 1) {
                    state.page--;
                    loadNotifications();
                }
            }
        );

        el.nextRequesterNotificationsPageButton?.addEventListener(
            "click",
            () => {
                if (!state.loading && state.page < state.lastPage) {
                    state.page++;
                    loadNotifications();
                }
            }
        );

        el.markAllRequesterNotificationsReadButton?.addEventListener(
            "click",
            markAllAsRead
        );

        el.requesterNotificationsList?.addEventListener(
            "click",
            handleListClick
        );

        el.logoutButton?.addEventListener("click", handleLogout);
    }

    function requireApiRequest() {
        if (typeof window.apiRequest !== "function") {
            throw new Error(
                "apiRequest() is unavailable. Check the shared app.js helper."
            );
        }
    }

    async function get(path) {
        requireApiRequest();
        return window.apiRequest(path);
    }

    async function post(path) {
        requireApiRequest();
        return window.apiRequest(path, { method: "POST" });
    }

    /**
     * Expected API response for GET /notifications:
     * {
     *   data: [...],
     *   meta: {
     *     current_page, per_page, total, last_page, unread_count
     *   }
     * }
     */
    function parseListResponse(response) {
        if (!response || typeof response !== "object") {
            throw new Error("The API returned an empty response.");
        }

        // Some shared helpers return the full response body;
        // others may return its data envelope.
        const body = response.data &&
            !Array.isArray(response.data) &&
            response.data.data !== undefined
                ? response.data
                : response;

        if (!Array.isArray(body.data) || !body.meta) {
            throw new Error(
                "Unexpected notifications response. Expected data and meta."
            );
        }

        return body;
    }

    async function loadNotifications() {
        if (state.loading) return;

        state.loading = true;
        hideAlert();
        setLoading(true);

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

            const response = await get(
                `${ENDPOINT}?${params.toString()}`
            );

            const body = parseListResponse(response);
            const meta = body.meta;

            state.notifications = body.data;
            state.page = Number(meta.current_page ?? state.page);
            state.perPage = Number(meta.per_page ?? PER_PAGE);
            state.total = Number(meta.total ?? body.data.length);
            state.lastPage = Math.max(
                1,
                Number(
                    meta.last_page ??
                    Math.ceil(state.total / state.perPage)
                )
            );

            // unread_count is defined by the API contract.
            if (meta.unread_count !== undefined) {
                state.unreadCount = Number(meta.unread_count);
            }

            renderNotifications();
            updateSummary();
            updatePagination();

        } catch (error) {
            console.error("Requester notifications error:", error);

            state.notifications = [];
            renderNotifications();
            updateSummary();
            updatePagination();

            showAlert(
                isUnauthorized(error)
                    ? "Your session may have expired. Please sign in again."
                    : getErrorMessage(
                        error,
                        "Unable to load your notifications."
                    ),
                isUnauthorized(error) ? "warning" : "danger"
            );
        } finally {
            state.loading = false;
            setLoading(false);
        }
    }

    function renderNotifications() {
        const list = el.requesterNotificationsList;
        if (!list) return;

        list.replaceChildren();

        if (state.notifications.length === 0) {
            el.requesterNotificationsEmptyState?.classList.remove("d-none");

            if (el.requesterNotificationsEmptyTitle) {
                const titles = {
                    all: "No notifications yet",
                    unread: "You're all caught up",
                    read: "No read notifications"
                };

                el.requesterNotificationsEmptyTitle.textContent =
                    titles[state.filter];
            }

            if (el.requesterNotificationsEmptyMessage) {
                const messages = {
                    all: "Updates about your maintenance requests will appear here.",
                    unread: "You have no unread notifications.",
                    read: "Notifications you've read will appear here."
                };

                el.requesterNotificationsEmptyMessage.textContent =
                    messages[state.filter];
            }

            return;
        }

        el.requesterNotificationsEmptyState?.classList.add("d-none");

        state.notifications.forEach((notification) => {
            list.appendChild(createNotificationItem(notification));
        });
    }

    function createNotificationItem(notification) {
        const item = document.createElement("div");
        item.className = "list-group-item px-2 px-md-3 py-3";

        if (!notification.is_read) {
            item.classList.add("bg-light");
        }

        const row = document.createElement("div");
        row.className = "d-flex align-items-start gap-3";

        const dot = document.createElement("span");
        dot.className = notification.is_read
            ? "rounded-circle bg-secondary flex-shrink-0 mt-2"
            : "rounded-circle bg-primary flex-shrink-0 mt-2";
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.setAttribute(
            "aria-label",
            notification.is_read ? "Read" : "Unread"
        );

        const content = document.createElement("div");
        content.className = "flex-grow-1";

        const badges = document.createElement("div");
        badges.className = "d-flex flex-wrap align-items-center gap-2 mb-2";

        const typeName =
            notification.type?.type_name || "Notification";

        const typeBadge = document.createElement("span");
        typeBadge.className = notificationTypeClass(typeName);
        typeBadge.textContent = typeName;

        const readBadge = document.createElement("span");
        readBadge.className = notification.is_read
            ? "badge text-bg-light border"
            : "badge text-bg-primary";
        readBadge.textContent = notification.is_read ? "Read" : "Unread";

        badges.append(typeBadge, readBadge);

        const message = document.createElement("p");
        message.className = "mb-2";
        message.textContent =
            notification.message || "No message provided.";

        const timestamp = document.createElement("small");
        timestamp.className = "text-muted";
        timestamp.textContent = formatDateTime(notification.created_at);

        content.append(badges, message, timestamp);

        const actions = document.createElement("div");
        actions.className =
            "d-flex flex-column align-items-end gap-2";

        // The current API schema exposes related_job_order_id,
        // but does not expose a related request ID.
        if (
            notification.related_job_order_id !== null &&
            notification.related_job_order_id !== undefined
        ) {
            const jobOrderLink = document.createElement("a");
            jobOrderLink.className = "btn btn-sm btn-outline-primary";
            jobOrderLink.href =
                `../facilities/job-orders.html?jobOrderId=${
                    encodeURIComponent(notification.related_job_order_id)
                }`;
            jobOrderLink.textContent =
                `Job Order #${notification.related_job_order_id}`;

            actions.appendChild(jobOrderLink);
        }

        if (!notification.is_read) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn btn-sm btn-outline-secondary";
            button.dataset.action = "mark-read";
            button.dataset.notificationId =
                String(notification.notification_id);

            const busy = state.busyIds.has(
                String(notification.notification_id)
            );

            button.disabled = busy;
            button.textContent = busy ? "Saving..." : "Mark as read";

            actions.appendChild(button);
        }

        row.append(dot, content, actions);
        item.appendChild(row);

        return item;
    }

    function notificationTypeClass(typeName) {
        const type = String(typeName).toLowerCase();

        if (type.includes("reject") || type.includes("urgent")) {
            return "badge text-bg-danger";
        }

        if (type.includes("complete") || type.includes("approve")) {
            return "badge text-bg-success";
        }

        if (type.includes("job")) {
            return "badge text-bg-info";
        }

        if (type.includes("request")) {
            return "badge text-bg-primary";
        }

        return "badge text-bg-secondary";
    }

    async function handleListClick(event) {
        const button = event.target.closest(
            'button[data-action="mark-read"]'
        );

        if (!button) return;

        const id = button.dataset.notificationId;
        if (!id || state.busyIds.has(id)) return;

        state.busyIds.add(id);
        button.disabled = true;
        button.textContent = "Saving...";
        hideAlert();

        try {
            await post(
                `${ENDPOINT}/${encodeURIComponent(id)}/read`
            );

            await loadNotifications();
            showAlert("Notification marked as read.", "success");

        } catch (error) {
            console.error("Mark notification read error:", error);

            showAlert(
                getErrorMessage(
                    error,
                    "Unable to mark this notification as read."
                ),
                "danger"
            );
        } finally {
            state.busyIds.delete(id);
        }
    }

    async function markAllAsRead() {
        if (
            state.markingAll ||
            state.unreadCount === 0
        ) {
            return;
        }

        if (!window.confirm("Mark all your notifications as read?")) {
            return;
        }

        state.markingAll = true;
        updateActionButtons();
        hideAlert();

        try {
            // The documented endpoint returns HTTP 204 on success.
            await post(`${ENDPOINT}/read-all`);

            state.page = 1;
            state.filter = "all";

            if (el.requesterNotificationReadFilter) {
                el.requesterNotificationReadFilter.value = "all";
            }

            await loadNotifications();
            showAlert(
                "All notifications have been marked as read.",
                "success"
            );

        } catch (error) {
            console.error("Mark all notifications read error:", error);

            showAlert(
                getErrorMessage(
                    error,
                    "Unable to mark all notifications as read."
                ),
                "danger"
            );
        } finally {
            state.markingAll = false;
            updateActionButtons();
        }
    }

    function updateSummary() {
        if (el.requesterUnreadCount) {
            el.requesterUnreadCount.textContent =
                state.unreadCount === null
                    ? "—"
                    : String(state.unreadCount);
        }

        if (el.requesterSidebarUnreadCount) {
            const count = state.unreadCount;

            el.requesterSidebarUnreadCount.textContent =
                count === null ? "" : String(count);

            el.requesterSidebarUnreadCount.classList.toggle(
                "d-none",
                count === null || count === 0
            );
        }

        if (el.requesterLoadedCount) {
            el.requesterLoadedCount.textContent =
                String(state.notifications.length);
        }

        updateActionButtons();
    }

    function updateActionButtons() {
        if (el.markAllRequesterNotificationsReadButton) {
            el.markAllRequesterNotificationsReadButton.disabled =
                state.loading ||
                state.markingAll ||
                state.unreadCount === null ||
                state.unreadCount === 0;

            el.markAllRequesterNotificationsReadButton.textContent =
                state.markingAll
                    ? "Marking as Read..."
                    : "Mark All as Read";
        }

        if (el.refreshRequesterNotificationsButton) {
            el.refreshRequesterNotificationsButton.disabled =
                state.loading;

            el.refreshRequesterNotificationsButton.textContent =
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

        if (el.requesterNotificationsPaginationInfo) {
            el.requesterNotificationsPaginationInfo.textContent =
                state.total === 0
                    ? "No notifications to display"
                    : `Showing ${start}–${end} of ${state.total} notifications`;
        }

        if (el.previousRequesterNotificationsPageButton) {
            el.previousRequesterNotificationsPageButton.disabled =
                state.loading || state.page <= 1;
        }

        if (el.nextRequesterNotificationsPageButton) {
            el.nextRequesterNotificationsPageButton.disabled =
                state.loading || state.page >= state.lastPage;
        }
    }

    function setLoading(loading) {
        el.requesterNotificationsLoading?.classList.toggle(
            "d-none",
            !loading
        );

        updateActionButtons();
        updatePagination();
    }

    function showAlert(message, type = "info") {
        const alert = el.requesterNotificationsAlert;
        if (!alert) return;

        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        alert.classList.remove("d-none");
    }

    function hideAlert() {
        el.requesterNotificationsAlert?.classList.add("d-none");
    }

    function formatDateTime(value) {
        if (!value) return "Date unavailable";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Date unavailable";

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
        return error?.status === 401 || error?.statusCode === 401;
    }

    function handleLogout(event) {
        event.preventDefault();

        if (typeof window.logoutUser === "function") {
            window.logoutUser();
            return;
        }

        if (typeof window.redirectToLogin === "function") {
            window.redirectToLogin();
            return;
        }

        // Prefer the shared logout helper so auth storage is cleared.
        window.location.assign("../../index.html");
    }
})();
