/**
 * JobTrack - Administrator Notifications
 * Uses the authenticated /notifications API.
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
        unreadCount: 0,
        filter: "all",
        loading: false,
        busyIds: new Set(),
        markingAllRead: false
    };

    const elements = {};

    document.addEventListener("DOMContentLoaded", initialize);

    function initialize() {
        const ids = [
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

        ids.forEach(id => {
            elements[id] = document.getElementById(id);
        });

        elements.refreshNotificationsButton?.addEventListener(
            "click", () => loadNotifications()
        );

        elements.notificationReadFilter?.addEventListener(
            "change", event => {
                state.filter = event.target.value;
                state.page = 1;
                loadNotifications();
            }
        );

        elements.previousNotificationsPageButton?.addEventListener(
            "click", () => {
                if (state.page > 1 && !state.loading) {
                    state.page--;
                    loadNotifications();
                }
            }
        );

        elements.nextNotificationsPageButton?.addEventListener(
            "click", () => {
                if (state.page < state.lastPage && !state.loading) {
                    state.page++;
                    loadNotifications();
                }
            }
        );

        elements.markAllNotificationsReadButton?.addEventListener(
            "click", markAllRead
        );

        elements.notificationsList?.addEventListener(
            "click", handleNotificationAction
        );

        elements.logoutButton?.addEventListener("click", handleLogout);

        loadNotifications();
    }

    async function apiRequest(path, options = {}) {
        if (typeof window.apiRequest !== "function") {
            throw new Error("Shared apiRequest() helper was not found in app.js.");
        }

        return window.apiRequest(path, options);
    }

    function unwrapResponse(response) {
        if (response && typeof response.json === "function") {
            throw new Error(
                "apiRequest() returned a raw Fetch Response instead of parsed JSON."
            );
        }

        return response;
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

            const response = await apiRequest(
                `${ENDPOINT}?${params.toString()}`
            );

            const body = unwrapResponse(response);

            if (!body || !Array.isArray(body.data)) {
                throw new Error("Unexpected notifications response format.");
            }

            const meta = body.meta || {};

            state.notifications = body.data;
            state.total = Number(meta.total ?? body.data.length);
            state.page = Number(meta.current_page ?? state.page);
            state.perPage = Number(meta.per_page ?? state.perPage);
            state.lastPage = Math.max(
                1,
                Number(meta.last_page ?? Math.ceil(state.total / state.perPage))
            );
            state.unreadCount = Number(meta.unread_count ?? 0);

            renderNotifications();
            updateSummary();
            updatePagination();
        } catch (error) {
            console.error("Failed to load admin notifications:", error);
            state.notifications = [];
            renderNotifications();
            updateSummary();
            updatePagination();

            showAlert(
                error?.message || "Unable to load notifications.",
                "danger"
            );
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

        state.notifications.forEach(notification => {
            list.appendChild(createNotificationElement(notification));
        });
    }

    function createNotificationElement(notification) {
        const item = document.createElement("div");
        item.className = "list-group-item px-2 px-md-3 py-3";

        if (!notification.is_read) item.classList.add("bg-light");

        const row = document.createElement("div");
        row.className = "d-flex align-items-start gap-3";

        const dot = document.createElement("span");
        dot.className = notification.is_read
            ? "d-inline-block rounded-circle bg-secondary mt-1"
            : "d-inline-block rounded-circle bg-primary mt-1";
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.setAttribute("aria-label", notification.is_read ? "Read" : "Unread");

        const content = document.createElement("div");
        content.className = "flex-grow-1";

        const heading = document.createElement("div");
        heading.className = "d-flex flex-wrap align-items-center gap-2 mb-1";

        const type = document.createElement("span");
        type.className = getTypeClass(notification.type_label);
        type.textContent = notification.type_label || "Notification";

        const readStatus = document.createElement("span");
        readStatus.className = notification.is_read
            ? "badge text-bg-light border"
            : "badge text-bg-primary";
        readStatus.textContent = notification.is_read ? "Read" : "Unread";

        heading.append(type, readStatus);

        const message = document.createElement("p");
        message.className = "mb-2";
        message.textContent = notification.message || "No message provided.";

        const timestamp = document.createElement("small");
        timestamp.className = "text-muted";
        timestamp.textContent = formatDateTime(notification.created_at);

        content.append(heading, message, timestamp);

        const actions = document.createElement("div");
        actions.className = "d-flex flex-column align-items-end gap-2";

        if (notification.related_job_order_id != null) {
            const link = document.createElement("a");
            link.className = "btn btn-sm btn-outline-primary";
            link.href =
                `../facilities/job-orders.html?jobOrderId=${encodeURIComponent(notification.related_job_order_id)}`;
            link.textContent = `Job Order #${notification.related_job_order_id}`;
            actions.appendChild(link);
        }

        if (!notification.is_read) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn btn-sm btn-outline-secondary";
            button.dataset.action = "mark-read";
            button.dataset.notificationId = String(notification.notification_id);
            button.textContent = state.busyIds.has(button.dataset.notificationId)
                ? "Saving..."
                : "Mark as read";
            button.disabled = state.busyIds.has(button.dataset.notificationId);
            actions.appendChild(button);
        }

        row.append(dot, content, actions);
        item.appendChild(row);

        return item;
    }

    function getTypeClass(value) {
        const name = String(value || "").toLowerCase();

        if (name.includes("urgent") || name.includes("error")) {
            return "badge text-bg-danger";
        }
        if (name.includes("job")) return "badge text-bg-info";
        if (name.includes("request")) return "badge text-bg-primary";

        return "badge text-bg-secondary";
    }

    async function handleNotificationAction(event) {
        const button = event.target.closest('button[data-action="mark-read"]');
        if (!button) return;

        const id = button.dataset.notificationId;
        if (!id || state.busyIds.has(id)) return;

        state.busyIds.add(id);
        button.disabled = true;
        button.textContent = "Saving...";
        hideAlert();

        try {
            await apiRequest(
                `${ENDPOINT}/${encodeURIComponent(id)}/read`,
                { method: "POST" }
            );
            await loadNotifications();
            showAlert("Notification marked as read.", "success");
        } catch (error) {
            showAlert(error?.message || "Unable to mark notification as read.", "danger");
        } finally {
            state.busyIds.delete(id);
        }
    }

    async function markAllRead() {
        if (state.markingAllRead || state.unreadCount === 0) return;

        if (!window.confirm("Mark all your notifications as read?")) return;

        state.markingAllRead = true;
        updateActionButtons();
        hideAlert();

        try {
            await apiRequest(`${ENDPOINT}/read-all`, { method: "POST" });

            state.page = 1;
            state.filter = "all";

            if (elements.notificationReadFilter) {
                elements.notificationReadFilter.value = "all";
            }

            await loadNotifications();
            showAlert("All notifications have been marked as read.", "success");
        } catch (error) {
            showAlert(error?.message || "Unable to mark all notifications as read.", "danger");
        } finally {
            state.markingAllRead = false;
            updateActionButtons();
        }
    }

    function updateSummary() {
        if (elements.unreadNotificationsCount) {
            elements.unreadNotificationsCount.textContent = String(state.unreadCount);
        }

        if (elements.sidebarUnreadCount) {
            elements.sidebarUnreadCount.textContent = String(state.unreadCount);
            elements.sidebarUnreadCount.classList.toggle(
                "d-none", state.unreadCount === 0
            );
        }

        if (elements.loadedNotificationsCount) {
            elements.loadedNotificationsCount.textContent =
                String(state.notifications.length);
        }

        updateActionButtons();
    }

    function updatePagination() {
        const start = state.total === 0 ? 0 : (state.page - 1) * state.perPage + 1;
        const end = Math.min(state.page * state.perPage, state.total);

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

    function setLoading(value) {
        elements.notificationsLoading?.classList.toggle("d-none", !value);
        updateActionButtons();
        updatePagination();
    }

    function updateActionButtons() {
        if (elements.markAllNotificationsReadButton) {
            elements.markAllNotificationsReadButton.disabled =
                state.loading || state.markingAllRead || state.unreadCount === 0;

            elements.markAllNotificationsReadButton.textContent =
                state.markingAllRead ? "Marking as Read..." : "Mark All as Read";
        }

        if (elements.refreshNotificationsButton) {
            elements.refreshNotificationsButton.disabled = state.loading;
            elements.refreshNotificationsButton.textContent =
                state.loading ? "Refreshing..." : "Refresh";
        }
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
        if (Number.isNaN(date.getTime())) return "Date unavailable";

        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(date);
    }

    function handleLogout(event) {
        event.preventDefault();

        if (typeof window.logoutUser === "function") {
            window.logoutUser();
        } else if (typeof window.redirectToLogin === "function") {
            window.redirectToLogin();
        } else {
            window.location.assign("../../index.html");
        }
    }
})();