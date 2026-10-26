
/**
 * JobTrack - Inventory Staff Material Requests
 *
 * Uses the JobTrack OpenAPI v5 material-request endpoints.
 * Search and status filtering are local to the current server page.
 */

document.addEventListener("DOMContentLoaded", () => {
    const state = {
        requests: [],
        visibleRequests: [],
        page: 1,
        perPage: 10,
        total: 0,
        lastPage: 1,
        search: "",
        status: "all",
        pendingAction: null,
        busy: false
    };

    const $ = (id) => document.getElementById(id);

    const el = {
        alert: $("materialRequestsAlert"),
        sidebarName: $("inventorySidebarUserName"),
        topbarName: $("inventoryTopbarUserName"),
        unreadBadge: $("inventorySidebarUnreadCount"),
        logoutButton: $("logoutButton"),

        filterForm: $("materialRequestFilterForm"),
        search: $("materialRequestSearchInput"),
        status: $("materialRequestStatusFilter"),
        resetFilters: $("resetMaterialRequestFiltersButton"),
        perPage: $("materialRequestPerPage"),

        pageTotal: $("requestPageTotal"),
        pagePending: $("requestPagePending"),
        pageFulfilled: $("requestPageFulfilled"),

        loading: $("materialRequestsLoading"),
        empty: $("materialRequestsEmptyState"),
        tableContainer: $("materialRequestsTableContainer"),
        tableBody: $("materialRequestsTableBody"),
        paginationInfo: $("materialRequestPaginationInfo"),
        previous: $("previousMaterialRequestPageButton"),
        next: $("nextMaterialRequestPageButton"),

        detailsModal: $("materialRequestDetailsModal"),
        detailsLoading: $("materialRequestDetailsLoading"),

        confirmModal: $("confirmMaterialRequestActionModal"),
        confirmTitle: $("confirmMaterialRequestActionTitle"),
        confirmMessage: $("confirmMaterialRequestActionMessage"),
        confirmButton: $("confirmMaterialRequestActionButton")
    };

    const detailsModal = window.bootstrap
        ? bootstrap.Modal.getOrCreateInstance(el.detailsModal)
        : null;

    const confirmModal = window.bootstrap
        ? bootstrap.Modal.getOrCreateInstance(el.confirmModal)
        : null;

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

    function showAlert(message, type = "warning") {
        el.alert.textContent = message;
        el.alert.className = `alert alert-${type}`;
        el.alert.classList.remove("d-none");
    }

    function hideAlert() {
        el.alert.textContent = "";
        el.alert.classList.add("d-none");
    }

    function errorMessage(error) {
        const validationErrors =
            error?.data?.errors ??
            error?.response?.data?.errors;

        if (validationErrors && typeof validationErrors === "object") {
            return Object.values(validationErrors).flat().join(" ");
        }

        return (
            error?.data?.message ??
            error?.response?.data?.message ??
            error?.message ??
            "Please try again."
        );
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function displayName(user) {
        if (!user || typeof user !== "object") {
            return "—";
        }

        return (
            user.full_name ??
            user.name ??
            [user.first_name, user.last_name].filter(Boolean).join(" ") ??
            "—"
        ) || "—";
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return new Intl.DateTimeFormat("en-PH", {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(date);
    }

    function renderUser(user) {
        const name = displayName(user);

        el.sidebarName.textContent = name;
        el.topbarName.textContent = name;
    }

    function renderUnreadBadge(count) {
        const number = Number(count);

        if (!Number.isFinite(number) || number <= 0) {
            el.unreadBadge.classList.add("d-none");
            return;
        }

        el.unreadBadge.textContent = number > 99
            ? "99+"
            : String(number);

        el.unreadBadge.classList.remove("d-none");
    }

    async function loadHeaderData() {
        const response = await window.apiRequest("/auth/me");
        const payload = unwrapData(response);

        renderUser(payload?.user ?? payload);

        try {
            const notificationResponse = await window.apiRequest(
                "/notifications?page=1&per_page=1"
            );

            const data = unwrapData(notificationResponse);
            const meta =
                notificationResponse?.meta ??
                data?.meta;

            renderUnreadBadge(meta?.unread_count);
        } catch (error) {
            console.warn("Notification count unavailable:", error);
            renderUnreadBadge(null);
        }
    }

    function setLoading(loading) {
        state.busy = loading;

        el.loading.classList.toggle("d-none", !loading);

        el.previous.disabled = loading || state.page <= 1;
        el.next.disabled = loading || state.page >= state.lastPage;
    }

    function applyLocalFilters() {
        const query = state.search.toLowerCase();

        state.visibleRequests = state.requests.filter((request) => {
            const materialName =
                request.material?.material_name ?? "";

            const sku = request.material?.sku ?? "";
            const requester = displayName(request.requested_by);

            const matchesSearch = !query || [
                materialName,
                sku,
                requester,
                request.material_request_id
            ].some((value) =>
                String(value).toLowerCase().includes(query)
            );

            const matchesStatus =
                state.status === "all" ||
                request.status_label === state.status;

            return matchesSearch && matchesStatus;
        });
    }

    function statusBadge(status) {
        const styles = {
            Pending: "bg-warning text-dark",
            Fulfilled: "bg-success",
            Rejected: "bg-danger"
        };

        const cssClass = styles[status] ?? "bg-secondary";

        return `<span class="badge ${cssClass}">${
            escapeHtml(status || "Unknown")
        }</span>`;
    }

    function renderRequests() {
        applyLocalFilters();
        el.tableBody.replaceChildren();

        el.pageTotal.textContent = String(state.requests.length);

        el.pagePending.textContent = String(
            state.requests.filter(
                (request) => request.status_label === "Pending"
            ).length
        );

        el.pageFulfilled.textContent = String(
            state.requests.filter(
                (request) => request.status_label === "Fulfilled"
            ).length
        );

        el.tableContainer.classList.toggle(
            "d-none",
            state.visibleRequests.length === 0
        );

        el.empty.classList.toggle(
            "d-none",
            state.visibleRequests.length !== 0
        );

        if (state.visibleRequests.length === 0) {
            const heading = el.empty.querySelector("h5");
            const message = el.empty.querySelector("p");

            if (heading) {
                heading.textContent = state.requests.length
                    ? "No matching requests"
                    : "No material requests found";
            }

            if (message) {
                message.textContent = state.requests.length
                    ? "Change the search or status filter to see other requests on this page."
                    : "There are no requests on this page.";
            }
        }

        for (const request of state.visibleRequests) {
            const row = document.createElement("tr");
            const pending = request.status_label === "Pending";

            row.innerHTML = `
                <td>#${escapeHtml(request.material_request_id)}</td>
                <td>
                    <strong>${escapeHtml(
                        request.material?.material_name
                    )}</strong>
                    <div class="text-muted small">
                        SKU: ${escapeHtml(request.material?.sku ?? "—")}
                    </div>
                </td>
                <td>
                    ${escapeHtml(request.quantity_requested)}
                    ${escapeHtml(
                        request.material?.unit_of_measure ?? ""
                    )}
                </td>
                <td>${escapeHtml(displayName(request.requested_by))}</td>
                <td>${escapeHtml(formatDate(request.requested_at))}</td>
                <td>${statusBadge(request.status_label)}</td>
                <td>
                    <div class="d-flex gap-2 flex-wrap">
                        <button
                            type="button"
                            class="btn btn-outline-primary btn-sm"
                            data-action="details"
                            data-id="${escapeHtml(
                                request.material_request_id
                            )}"
                        >Details</button>

                        ${
                            pending
                                ? `
                                    <button
                                        type="button"
                                        class="btn btn-success btn-sm"
                                        data-action="fulfill"
                                        data-id="${escapeHtml(
                                            request.material_request_id
                                        )}"
                                    >Fulfill</button>

                                    <button
                                        type="button"
                                        class="btn btn-outline-danger btn-sm"
                                        data-action="reject"
                                        data-id="${escapeHtml(
                                            request.material_request_id
                                        )}"
                                    >Reject</button>
                                `
                                : ""
                        }
                    </div>
                </td>
            `;

            el.tableBody.appendChild(row);
        }

        const start = state.total === 0
            ? 0
            : ((state.page - 1) * state.perPage) + 1;

        const end = Math.min(state.page * state.perPage, state.total);

        el.paginationInfo.textContent =
            `Showing ${start}–${end} of ${state.total} requests` +
            ` · Page ${state.page} of ${state.lastPage}`;

        el.previous.disabled = state.busy || state.page <= 1;
        el.next.disabled = state.busy || state.page >= state.lastPage;
    }

    async function loadRequests() {
        hideAlert();
        setLoading(true);

        el.tableContainer.classList.add("d-none");
        el.empty.classList.add("d-none");

        const params = new URLSearchParams({
            page: String(state.page),
            per_page: String(state.perPage)
        });

        try {
            const response = await window.apiRequest(
                `/material-requests?${params.toString()}`
            );

            const payload = unwrapData(response);
            const meta = response?.meta ?? payload?.meta;

            if (!Array.isArray(payload)) {
                throw new Error(
                    "Unexpected response from the material-request endpoint."
                );
            }

            state.requests = payload;
            state.total = Number(meta?.total ?? payload.length);
            state.lastPage = Math.max(
                1,
                Number(meta?.last_page ?? 1)
            );

            if (state.page > state.lastPage) {
                state.page = state.lastPage;
                setLoading(false);
                await loadRequests();
                return;
            }

            renderRequests();
        } catch (error) {
            console.error("Unable to load material requests:", error);

            state.requests = [];
            state.visibleRequests = [];
            state.total = 0;
            state.lastPage = 1;

            renderRequests();

            showAlert(
                `Unable to load material requests. ${errorMessage(error)}`,
                "danger"
            );
        } finally {
            setLoading(false);
            renderRequests();
        }
    }

    function setText(id, value) {
        const element = $(id);

        if (element) {
            element.textContent = value ?? "—";
        }
    }

    async function showRequestDetails(requestId) {
        if (!detailsModal) {
            showAlert("Bootstrap modal is unavailable.", "danger");
            return;
        }

        el.detailsLoading.classList.remove("d-none");

        [
            "detailRequestId",
            "detailMaterialName",
            "detailMaterialSku",
            "detailRequestQuantity",
            "detailRequestedBy",
            "detailRequestedAt",
            "detailRequestStatus",
            "detailFulfilledBy",
            "detailFulfilledAt"
        ].forEach((id) => setText(id, "Loading..."));

        detailsModal.show();

        try {
            const response = await window.apiRequest(
                `/material-requests/${encodeURIComponent(requestId)}`
            );

            const request = unwrapData(response);

            setText("detailRequestId", request.material_request_id);
            setText(
                "detailMaterialName",
                request.material?.material_name
            );
            setText("detailMaterialSku", request.material?.sku);
            setText(
                "detailRequestQuantity",
                `${request.quantity_requested} ${
                    request.material?.unit_of_measure ?? ""
                }`.trim()
            );
            setText("detailRequestedBy", displayName(request.requested_by));
            setText("detailRequestedAt", formatDate(request.requested_at));
            setText("detailRequestStatus", request.status_label);
            setText("detailFulfilledBy", displayName(request.fulfilled_by));
            setText("detailFulfilledAt", formatDate(request.fulfilled_at));
        } catch (error) {
            console.error("Unable to load request details:", error);

            showAlert(
                `Unable to load request details. ${errorMessage(error)}`,
                "danger"
            );

            detailsModal.hide();
        } finally {
            el.detailsLoading.classList.add("d-none");
        }
    }

    function requestActionConfirmation(request, action) {
        if (!confirmModal) {
            showAlert("Bootstrap modal is unavailable.", "danger");
            return;
        }

        state.pendingAction = {
            requestId: request.material_request_id,
            action
        };

        const isFulfill = action === "fulfill";

        el.confirmTitle.textContent = isFulfill
            ? "Fulfill Material Request"
            : "Reject Material Request";

        el.confirmMessage.textContent = isFulfill
            ? `Fulfill request #${request.material_request_id} for ` +
              `${request.quantity_requested} ` +
              `${request.material?.unit_of_measure ?? ""} of ` +
              `${request.material?.material_name ?? "this material"}?`
            : `Reject request #${request.material_request_id} for ` +
              `${request.material?.material_name ?? "this material"}?`;

        el.confirmButton.textContent = isFulfill
            ? "Confirm Fulfillment"
            : "Confirm Rejection";

        el.confirmButton.className = isFulfill
            ? "btn btn-success"
            : "btn btn-danger";

        confirmModal.show();
    }

    async function executeConfirmedAction() {
        if (!state.pendingAction || state.busy) return;

        const { requestId, action } = state.pendingAction;
        const endpointAction = action === "fulfill"
            ? "fulfill"
            : "reject";

        el.confirmButton.disabled = true;
        el.confirmButton.textContent = "Processing...";

        try {
            await window.apiRequest(
                `/material-requests/${encodeURIComponent(
                    requestId
                )}/${endpointAction}`,
                { method: "POST" }
            );

            confirmModal?.hide();

            showAlert(
                action === "fulfill"
                    ? "Material request fulfilled successfully."
                    : "Material request rejected successfully.",
                "success"
            );

            state.pendingAction = null;
            await loadRequests();
        } catch (error) {
            console.error("Unable to process material request:", error);

            showAlert(
                `Unable to ${endpointAction} request. ${errorMessage(error)}`,
                "danger"
            );
        } finally {
            el.confirmButton.disabled = false;
            el.confirmButton.textContent = "Confirm";
        }
    }

    function handleTableClick(event) {
        const button = event.target.closest("button[data-action][data-id]");

        if (!button || !el.tableBody.contains(button)) return;

        const request = state.requests.find(
            (item) =>
                String(item.material_request_id) === button.dataset.id
        );

        if (!request) {
            showAlert(
                "The selected request is no longer available. Refresh the page.",
                "warning"
            );
            return;
        }

        const action = button.dataset.action;

        if (action === "details") {
            showRequestDetails(request.material_request_id);
        } else if (
            action === "fulfill" ||
            action === "reject"
        ) {
            if (request.status_label !== "Pending") {
                showAlert(
                    "Only pending material requests can be processed.",
                    "warning"
                );
                return;
            }

            requestActionConfirmation(request, action);
        }
    }

    function handleLogout() {
        if (typeof window.logoutUser === "function") {
            window.logoutUser();
        } else if (typeof window.redirectToLogin === "function") {
            window.redirectToLogin();
        } else {
            showAlert(
                "The shared logout function is unavailable. Check app.js.",
                "danger"
            );
        }
    }

    function bindEvents() {
        el.filterForm.addEventListener("submit", (event) => {
            event.preventDefault();

            state.search = el.search.value.trim();
            state.status = el.status.value;

            // Filtering is local to the current server page.
            renderRequests();
        });

        el.resetFilters.addEventListener("click", () => {
            el.search.value = "";
            el.status.value = "all";

            state.search = "";
            state.status = "all";

            renderRequests();
        });

        el.perPage.addEventListener("change", () => {
            state.perPage = Number(el.perPage.value) || 10;
            state.page = 1;
            loadRequests();
        });

        el.previous.addEventListener("click", () => {
            if (state.page > 1 && !state.busy) {
                state.page -= 1;
                loadRequests();
            }
        });

        el.next.addEventListener("click", () => {
            if (state.page < state.lastPage && !state.busy) {
                state.page += 1;
                loadRequests();
            }
        });

        el.tableBody.addEventListener("click", handleTableClick);
        el.confirmButton.addEventListener("click", executeConfirmedAction);
        el.logoutButton.addEventListener("click", handleLogout);
    }

    async function initialize() {
        if (
            typeof AUTH_TOKEN_KEY !== "undefined" &&
            !localStorage.getItem(AUTH_TOKEN_KEY)
        ) {
            if (typeof window.redirectToLogin === "function") {
                window.redirectToLogin();
                return;
            }
        }

        if (typeof window.apiRequest !== "function") {
            showAlert(
                "The shared API helper is unavailable. Ensure app.js loads before inventory-transactions.js.",
                "danger"
            );
            return;
        }

        bindEvents();

        try {
            await loadHeaderData();
        } catch (error) {
            console.error("Unable to load account information:", error);
            showAlert(
                "Account information could not be loaded. You may need to sign in again.",
                "warning"
            );
        }

        await loadRequests();
    }

    initialize();
});
