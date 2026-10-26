
(() => {
    "use strict";

    const PAGE_SIZE = 10;

    const state = {
        page: 1,
        lastPage: 1,
        filter: "all",
        unreadCount: 0,
        notifications: [],
        loading: false
    };

    const el = {
        alert: document.getElementById("alertBox"),
        unreadCount: document.getElementById("unreadCount"),
        pageCount: document.getElementById("pageCount"),
        list: document.getElementById("notificationList"),
        loading: document.getElementById("loadingState"),
        empty: document.getElementById("emptyState"),
        error: document.getElementById("errorState"),
        filter: document.getElementById("readFilter"),
        markAll: document.getElementById("markAllReadBtn"),
        previous: document.getElementById("previousBtn"),
        next: document.getElementById("nextBtn"),
        pagination: document.getElementById("paginationInfo"),
        retry: document.getElementById("retryBtn"),
        logout: document.getElementById("logoutBtn")
    };

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function showAlert(message, type = "danger") {
        el.alert.textContent = message;
        el.alert.className = `alert alert-${type}`;
    }

    function hideAlert() {
        el.alert.textContent = "";
        el.alert.className = "alert d-none";
    }

    function unwrapResponse(response) {
        // Supports a conventional API envelope: { data: ..., meta: ... }.
        // If app.js already unwraps the response, preserve its result.
        return response;
    }

    function formatDate(value) {
        if (!value) return "Date unavailable";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Date unavailable";

        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    function notificationTypeLabel(notification) {
        return notification.type_label || "Notification";
    }

    function getReadFilterValue() {
        if (state.filter === "unread") return "false";
        if (state.filter === "read") return "true";
        return null;
    }

    function setLoading(isLoading) {
        state.loading = isLoading;
        el.loading.classList.toggle("d-none", !isLoading);

        el.previous.disabled = isLoading || state.page <= 1;
        el.next.disabled = isLoading || state.page >= state.lastPage;
        el.filter.disabled = isLoading;
        el.markAll.disabled = isLoading || state.unreadCount === 0;
    }

    function renderNotifications() {
        el.list.replaceChildren();

        state.notifications.forEach(notification => {
            const item = document.createElement("article");
            item.className =
                "list-group-item list-group-item-action p-3" +
                (notification.is_read ? "" : " bg-light");

            const type = escapeHtml(notificationTypeLabel(notification));
            const message = escapeHtml(notification.message);
            const date = escapeHtml(formatDate(notification.created_at));
            const id = Number(notification.notification_id);
            const isRead = notification.is_read === true;

            item.innerHTML = `
                <div class="d-flex flex-wrap justify-content-between
                            align-items-start gap-3">
                    <div class="flex-grow-1">
                        <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                            <span class="badge text-bg-secondary">${type}</span>
                            ${
                                isRead
                                    ? '<span class="badge text-bg-light border">Read</span>'
                                    : '<span class="badge text-bg-primary">Unread</span>'
                            }
                        </div>
                        <p class="mb-2">${message}</p>
                        <small class="text-secondary">${date}</small>
                    </div>
                    ${
                        isRead
                            ? ""
                            : `<button type="button"
                                       class="btn btn-outline-primary btn-sm mark-read-btn"
                                       data-notification-id="${id}">
                                   Mark as read
                               </button>`
                    }
                </div>
            `;

            el.list.appendChild(item);
        });

        el.pageCount.textContent = String(state.notifications.length);
        el.unreadCount.textContent = String(state.unreadCount);
        el.pagination.textContent =
            `Page ${state.page} of ${state.lastPage}`;

        el.empty.classList.toggle(
            "d-none",
            state.loading || state.notifications.length > 0
        );

        el.markAll.disabled = state.loading || state.unreadCount === 0;
        el.previous.disabled = state.loading || state.page <= 1;
        el.next.disabled = state.loading || state.page >= state.lastPage;
    }

    function updatePagination(meta) {
        const currentPage = Number(meta?.current_page);
        const lastPage = Number(meta?.last_page);
        const unreadCount = Number(meta?.unread_count);

        state.page = Number.isFinite(currentPage) && currentPage > 0
            ? currentPage
            : state.page;

        state.lastPage = Number.isFinite(lastPage) && lastPage > 0
            ? lastPage
            : 1;

        if (Number.isFinite(unreadCount) && unreadCount >= 0) {
            state.unreadCount = unreadCount;
        }
    }

    async function loadNotifications() {
        hideAlert();
        setLoading(true);
        el.error.classList.add("d-none");
        el.empty.classList.add("d-none");
        el.list.replaceChildren();

        try {
            const params = new URLSearchParams({
                page: String(state.page),
                per_page: String(PAGE_SIZE)
            });

            const readValue = getReadFilterValue();
            if (readValue !== null) {
                params.set("is_read", readValue);
            }

            const raw = await window.apiRequest(
                `/notifications?${params.toString()}`
            );
            const response = unwrapResponse(raw);

            // The v5 contract specifies { data: [...], meta: {...} }.
            // Also tolerate a helper that returns only the data array.
            const items = Array.isArray(response)
                ? response
                : response?.data;

            if (!Array.isArray(items)) {
                throw new Error(
                    "Unexpected notifications response. Check app.js response handling."
                );
            }

            state.notifications = items;

            if (!Array.isArray(response)) {
                updatePagination(response.meta);
            }

            renderNotifications();
        } catch (error) {
            console.error("Failed to load notifications:", error);
            state.notifications = [];
            el.list.replaceChildren();
            el.error.classList.remove("d-none");
            showAlert(
                error?.message || "Unable to load notifications. Please try again."
            );
        } finally {
            setLoading(false);
            renderNotifications();
        }
    }

    async function markAsRead(notificationId, button) {
        if (!Number.isInteger(notificationId) || notificationId < 1) {
            showAlert("Invalid notification ID.");
            return;
        }

        if (button) button.disabled = true;
        hideAlert();

        try {
            await window.apiRequest(
                `/notifications/${notificationId}/read`,
                { method: "POST" }
            );

            // Reload to refresh unread_count and pagination metadata.
            await loadNotifications();
            showAlert("Notification marked as read.", "success");
        } catch (error) {
            console.error("Failed to mark notification as read:", error);
            showAlert(
                error?.message || "Could not mark this notification as read."
            );
            if (button) button.disabled = false;
        }
    }

    async function markAllAsRead() {
        if (state.unreadCount === 0 || state.loading) return;

        const confirmed = window.confirm(
            "Mark all your notifications as read?"
        );

        if (!confirmed) return;

        el.markAll.disabled = true;
        hideAlert();

        try {
            // The v5 contract documents a 204 No Content response.
            await window.apiRequest("/notifications/read-all", {
                method: "POST"
            });

            state.page = 1;
            await loadNotifications();
            showAlert("All notifications marked as read.", "success");
        } catch (error) {
            console.error("Failed to mark all notifications as read:", error);
            showAlert(
                error?.message || "Could not mark all notifications as read."
            );
            el.markAll.disabled = false;
        }
    }

    el.filter.addEventListener("change", () => {
        state.filter = el.filter.value;
        state.page = 1;
        loadNotifications();
    });

    el.list.addEventListener("click", event => {
        const button = event.target.closest(".mark-read-btn");
        if (!button) return;

        const id = Number(button.dataset.notificationId);
        markAsRead(id, button);
    });

    el.markAll.addEventListener("click", markAllAsRead);
    el.retry.addEventListener("click", loadNotifications);

    el.previous.addEventListener("click", () => {
        if (state.page > 1 && !state.loading) {
            state.page -= 1;
            loadNotifications();
        }
    });

    el.next.addEventListener("click", () => {
        if (state.page < state.lastPage && !state.loading) {
            state.page += 1;
            loadNotifications();
        }
    });

    el.logout.addEventListener("click", () => {
        if (typeof window.logoutUser === "function") {
            window.logoutUser();
            return;
        }

        showAlert(
            "Connect this button to the logout function provided by js/app.js."
        );
    });

    if (typeof window.apiRequest !== "function") {
        setLoading(false);
        el.loading.classList.add("d-none");
        el.error.classList.remove("d-none");
        showAlert(
            "The shared API helper was not found. Check that ../../js/app.js loads correctly."
        );
    } else {
        loadNotifications();
    }
})();
