
(() => {
    "use strict";

    const JOB_ORDERS_ENDPOINT = "/job-orders";
    const JOB_ORDER_DETAIL_ENDPOINT = (id) =>
        `/job-orders/${encodeURIComponent(id)}`;

    const PER_PAGE = 10;
    const SEARCH_DELAY = 350;

    const state = {
        page: 1,
        perPage: PER_PAGE,
        total: 0,
        lastPage: 1,
        jobOrders: [],
        search: "",
        status: "",
        priority: "",
        searchTimer: null,
        loading: false,
        detailsLoading: false
    };

    const elements = {};

    document.addEventListener("DOMContentLoaded", initialize);

    async function initialize() {
        cacheElements();
        bindEvents();

        if (!elements.jobOrdersTableBody) {
            console.error(
                "JobTrack Job Orders: table body was not found."
            );
            return;
        }

        setLoading(true);

        await loadCurrentUser();
        await loadJobOrders();
    }

    function cacheElements() {
        [
            "facilitiesOfficerName",
            "jobOrdersAlert",
            "totalJobOrdersCount",
            "awaitingAssignmentCount",
            "inProgressCount",
            "completedJobOrdersCount",
            "refreshJobOrdersButton",
            "jobOrderFiltersForm",
            "jobOrderSearch",
            "jobOrderStatusFilter",
            "jobOrderPriorityFilter",
            "clearJobOrderFiltersButton",
            "jobOrdersLoading",
            "jobOrdersTableBody",
            "jobOrdersEmptyState",
            "jobOrdersPaginationInfo",
            "previousJobOrdersPageButton",
            "nextJobOrdersPageButton",
            "jobOrderDetailsModal",
            "jobOrderDetailsLoading",
            "jobOrderDetailsContent",
            "detailJobOrderId",
            "detailRequestReference",
            "detailLocation",
            "detailCategory",
            "detailPriority",
            "detailStatus",
            "detailCreatedAt",
            "detailCreatedBy",
            "detailTechniciansList",
            "jobOrderDetailsError",
            "logoutButton"
        ].forEach((id) => {
            elements[id] = document.getElementById(id);
        });
    }

    function bindEvents() {
        elements.jobOrderFiltersForm?.addEventListener(
            "submit",
            (event) => event.preventDefault()
        );

        elements.jobOrderSearch?.addEventListener("input", () => {
            window.clearTimeout(state.searchTimer);

            state.searchTimer = window.setTimeout(() => {
                state.search = elements.jobOrderSearch.value.trim();
                state.page = 1;
                loadJobOrders();
            }, SEARCH_DELAY);
        });

        elements.jobOrderStatusFilter?.addEventListener("change", () => {
            state.status = elements.jobOrderStatusFilter.value;
            state.page = 1;
            loadJobOrders();
        });

        elements.jobOrderPriorityFilter?.addEventListener("change", () => {
            state.priority = elements.jobOrderPriorityFilter.value;
            state.page = 1;
            loadJobOrders();
        });

        elements.clearJobOrderFiltersButton?.addEventListener(
            "click",
            clearFilters
        );

        elements.refreshJobOrdersButton?.addEventListener(
            "click",
            () => loadJobOrders()
        );

        elements.previousJobOrdersPageButton?.addEventListener(
            "click",
            () => {
                if (state.page > 1) {
                    state.page -= 1;
                    loadJobOrders();
                }
            }
        );

        elements.nextJobOrdersPageButton?.addEventListener(
            "click",
            () => {
                if (state.page < state.lastPage) {
                    state.page += 1;
                    loadJobOrders();
                }
            }
        );

        elements.jobOrdersTableBody?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-action='details']");

            if (!button) return;

            const jobOrderId = button.dataset.jobOrderId;

            if (jobOrderId) {
                openJobOrderDetails(jobOrderId);
            }
        });

        elements.logoutButton?.addEventListener("click", logout);
    }

    // ---------------------------------------------------------
    // Current user
    // ---------------------------------------------------------

    async function loadCurrentUser() {
        if (!elements.facilitiesOfficerName) return;

        try {
            const response = await apiRequest("/auth/me");
            const user = response?.data ?? {};

            elements.facilitiesOfficerName.textContent =
                user.full_name || "Facilities Officer";
        } catch (error) {
            console.error("Unable to load current user:", error);
            elements.facilitiesOfficerName.textContent =
                "Facilities Officer";

            handleApiError(error);
        }
    }

    // ---------------------------------------------------------
    // Job-order list
    // ---------------------------------------------------------

    async function loadJobOrders() {
        if (state.loading) return;

        state.loading = true;
        setLoading(true);
        hideAlert();

        const query = new URLSearchParams();

        query.set("page", String(state.page));
        query.set("per_page", String(state.perPage));
        query.set("sort", "-created_at");

        if (state.priority) {
            query.set("priority", state.priority);
        }

        /*
         * The API contract filters by status_id, not status name.
         * Until a job-order status lookup is confirmed, apply the
         * selected status to the returned records on this page.
         * This is a display filter, not a server-side status filter.
         */
        try {
            const response = await apiRequest(
                `${JOB_ORDERS_ENDPOINT}?${query.toString()}`
            );

            const records = Array.isArray(response?.data)
                ? response.data
                : [];

            const meta = response?.meta ?? {};

            state.jobOrders = records;
            state.total = Number(meta.total ?? records.length);
            state.page = Number(meta.current_page ?? state.page);
            state.perPage = Number(meta.per_page ?? state.perPage);
            state.lastPage = Math.max(
                1,
                Number(
                    meta.last_page ??
                    Math.ceil(state.total / state.perPage)
                )
            );

            renderJobOrders();
            renderPagination();
            renderCounters();
        } catch (error) {
            console.error("Unable to load job orders:", error);

            state.jobOrders = [];
            state.total = 0;

            renderJobOrders();
            renderPagination();
            renderCounters();

            showAlert(
                "danger",
                getErrorMessage(error, "Unable to load job orders.")
            );

            handleApiError(error);
        } finally {
            state.loading = false;
            setLoading(false);
        }
    }

    function getVisibleJobOrders() {
        if (!state.status) {
            return state.jobOrders;
        }

        return state.jobOrders.filter((jobOrder) =>
            getStatusName(jobOrder).toLowerCase() ===
            state.status.toLowerCase()
        );
    }

    function renderJobOrders() {
        const tbody = elements.jobOrdersTableBody;

        if (!tbody) return;

        tbody.replaceChildren();

        const records = getVisibleJobOrders();

        if (records.length === 0) {
            elements.jobOrdersEmptyState?.classList.remove("d-none");

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 9;
            cell.className = "text-center py-4 text-muted";
            cell.textContent = state.jobOrders.length
                ? "No job orders match the selected status on this page."
                : "No job orders found.";

            row.appendChild(cell);
            tbody.appendChild(row);
            return;
        }

        elements.jobOrdersEmptyState?.classList.add("d-none");

        records.forEach((jobOrder) => {
            tbody.appendChild(createJobOrderRow(jobOrder));
        });
    }

    function createJobOrderRow(jobOrder) {
        const row = document.createElement("tr");

        const id = jobOrder.job_order_id;
        const requestReference =
            jobOrder.request_reference || `Request #${jobOrder.request_id}`;
        const location = jobOrder.location?.location_name ??
            jobOrder.location?.name ??
            "—";
        const category = jobOrder.category?.category_name ??
            jobOrder.category?.name ??
            "—";
        const technicians = Array.isArray(jobOrder.technicians)
            ? jobOrder.technicians
                .map((technician) => technician.full_name)
                .filter(Boolean)
                .join(", ")
            : "";

        const values = [
            id == null ? "—" : `JO-${id}`,
            requestReference,
            location,
            category,
            technicians || "Unassigned"
        ];

        values.forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = String(value);
            row.appendChild(cell);
        });

        const priorityCell = document.createElement("td");
        priorityCell.appendChild(createBadge(
            jobOrder.priority || "Unknown",
            getPriorityBadgeClass(jobOrder.priority)
        ));
        row.appendChild(priorityCell);

        const statusCell = document.createElement("td");
        statusCell.appendChild(createBadge(
            getStatusName(jobOrder) || "Unknown",
            getStatusBadgeClass(getStatusName(jobOrder))
        ));
        row.appendChild(statusCell);

        const createdCell = document.createElement("td");
        createdCell.textContent = formatDate(jobOrder.created_at);
        row.appendChild(createdCell);

        const actionsCell = document.createElement("td");
        const detailsButton = document.createElement("button");

        detailsButton.type = "button";
        detailsButton.className = "btn btn-sm btn-outline-primary";
        detailsButton.textContent = "Details";
        detailsButton.dataset.action = "details";
        detailsButton.dataset.jobOrderId = String(id ?? "");
        detailsButton.disabled = id == null;

        actionsCell.appendChild(detailsButton);
        row.appendChild(actionsCell);

        return row;
    }

    // ---------------------------------------------------------
    // Summary counters
    // ---------------------------------------------------------

    function renderCounters() {
        /*
         * These counters reflect only the currently fetched page.
         * A future summary endpoint or complete aggregation is needed
         * for accurate system-wide counts.
         */
        const records = state.jobOrders;

        setText("totalJobOrdersCount", state.total);

        setText(
            "awaitingAssignmentCount",
            records.filter((item) =>
                ["approved", "pending"].includes(
                    getStatusName(item).toLowerCase()
                ) &&
                (!Array.isArray(item.technicians) ||
                    item.technicians.length === 0)
            ).length
        );

        setText(
            "inProgressCount",
            records.filter((item) =>
                getStatusName(item).toLowerCase() === "in progress"
            ).length
        );

        setText(
            "completedJobOrdersCount",
            records.filter((item) =>
                ["completed", "closed"].includes(
                    getStatusName(item).toLowerCase()
                )
            ).length
        );

        setCounterLabel(
            "awaitingAssignmentCount",
            "Awaiting Assignment (this page)"
        );
        setCounterLabel("inProgressCount", "In Progress (this page)");
        setCounterLabel(
            "completedJobOrdersCount",
            "Completed (this page)"
        );
    }

    function setCounterLabel(id, labelText) {
        const counter = document.getElementById(id);
        const label = counter?.previousElementSibling;

        if (label) {
            label.textContent = labelText;
        }
    }

    // ---------------------------------------------------------
    // Job-order details
    // ---------------------------------------------------------

    async function openJobOrderDetails(jobOrderId) {
        if (!window.bootstrap?.Modal || !elements.jobOrderDetailsModal) {
            showAlert(
                "danger",
                "The details dialog could not be opened. Check Bootstrap JavaScript."
            );
            return;
        }

        const modal = window.bootstrap.Modal.getOrCreateInstance(
            elements.jobOrderDetailsModal
        );

        elements.jobOrderDetailsLoading.textContent =
            "Loading job-order details...";
        elements.jobOrderDetailsLoading.classList.remove("d-none");
        elements.jobOrderDetailsContent?.classList.add("d-none");
        elements.jobOrderDetailsError?.classList.add("d-none");

        modal.show();

        if (state.detailsLoading) return;
        state.detailsLoading = true;

        try {
            const response = await apiRequest(
                JOB_ORDER_DETAIL_ENDPOINT(jobOrderId)
            );

            const jobOrder = response?.data;

            if (!jobOrder) {
                throw new Error("The API returned no job-order details.");
            }

            renderJobOrderDetails(jobOrder);

            elements.jobOrderDetailsLoading.classList.add("d-none");
            elements.jobOrderDetailsContent.classList.remove("d-none");
        } catch (error) {
            console.error("Unable to load job-order details:", error);

            elements.jobOrderDetailsLoading.textContent =
                getErrorMessage(error, "Unable to load job-order details.");

            showDetailsError(
                getErrorMessage(error, "Unable to load job-order details.")
            );

            handleApiError(error);
        } finally {
            state.detailsLoading = false;
        }
    }

    function renderJobOrderDetails(jobOrder) {
        setText(
            "detailJobOrderId",
            jobOrder.job_order_id == null
                ? "—"
                : `JO-${jobOrder.job_order_id}`
        );

        setText(
            "detailRequestReference",
            jobOrder.request_reference ||
                jobOrder.request?.reference ||
                (jobOrder.request_id != null
                    ? `Request #${jobOrder.request_id}`
                    : "—")
        );

        setText(
            "detailLocation",
            jobOrder.location?.location_name ??
                jobOrder.location?.name ??
                jobOrder.request?.location?.location_name ??
                jobOrder.request?.location?.name ??
                "—"
        );

        setText(
            "detailCategory",
            jobOrder.category?.category_name ??
                jobOrder.category?.name ??
                jobOrder.request?.category?.category_name ??
                jobOrder.request?.category?.name ??
                "—"
        );

        setText("detailPriority", jobOrder.priority || "—");
        setText("detailStatus", getStatusName(jobOrder) || "—");
        setText("detailCreatedAt", formatDate(jobOrder.created_at));
        setText(
            "detailCreatedBy",
            jobOrder.created_by?.full_name || "—"
        );

        renderTechnicians(jobOrder);
    }

    function renderTechnicians(jobOrder) {
        const list = elements.detailTechniciansList;

        if (!list) return;

        list.replaceChildren();

        let technicians = [];

        if (Array.isArray(jobOrder.assignments)) {
            technicians = jobOrder.assignments
                .map((assignment) => ({
                    name: assignment.technician?.full_name,
                    role: assignment.assignment_role,
                    status: assignment.status
                }))
                .filter((technician) => technician.name);
        } else if (Array.isArray(jobOrder.technicians)) {
            technicians = jobOrder.technicians.map((technician) => ({
                name: technician.full_name,
                role: "",
                status: ""
            }));
        }

        if (technicians.length === 0) {
            const item = document.createElement("li");
            item.className = "list-group-item text-muted";
            item.textContent = "No technicians assigned.";
            list.appendChild(item);
            return;
        }

        technicians.forEach((technician) => {
            const item = document.createElement("li");
            item.className =
                "list-group-item d-flex justify-content-between gap-3";

            const name = document.createElement("span");
            name.textContent = technician.name;

            const metadata = [
                technician.role,
                technician.status
            ].filter(Boolean).join(" · ");

            const detail = document.createElement("small");
            detail.className = "text-muted";
            detail.textContent = metadata;

            item.appendChild(name);

            if (metadata) {
                item.appendChild(detail);
            }

            list.appendChild(item);
        });
    }

    function showDetailsError(message) {
        if (!elements.jobOrderDetailsError) return;

        elements.jobOrderDetailsError.textContent = message;
        elements.jobOrderDetailsError.classList.remove("d-none");
    }

    // ---------------------------------------------------------
    // Filters and pagination
    // ---------------------------------------------------------

    function clearFilters() {
        if (elements.jobOrderSearch) {
            elements.jobOrderSearch.value = "";
        }

        if (elements.jobOrderStatusFilter) {
            elements.jobOrderStatusFilter.value = "";
        }

        if (elements.jobOrderPriorityFilter) {
            elements.jobOrderPriorityFilter.value = "";
        }

        window.clearTimeout(state.searchTimer);

        state.search = "";
        state.status = "";
        state.priority = "";
        state.page = 1;

        loadJobOrders();
    }

    function renderPagination() {
        const first = state.total === 0
            ? 0
            : (state.page - 1) * state.perPage + 1;

        const last = Math.min(
            state.page * state.perPage,
            state.total
        );

        if (elements.jobOrdersPaginationInfo) {
            elements.jobOrdersPaginationInfo.textContent =
                `Showing ${first}–${last} of ${state.total}`;
        }

        if (elements.previousJobOrdersPageButton) {
            elements.previousJobOrdersPageButton.disabled =
                state.loading || state.page <= 1;
        }

        if (elements.nextJobOrdersPageButton) {
            elements.nextJobOrdersPageButton.disabled =
                state.loading || state.page >= state.lastPage;
        }
    }

    // ---------------------------------------------------------
    // Logout
    // ---------------------------------------------------------

    async function logout(event) {
        event.preventDefault();

        try {
            await apiRequest("/auth/logout", { method: "POST" });
        } catch (error) {
            console.warn("Logout request failed:", error);
        }

        /*
         * Prefer your shared logout function when available, so this
         * page uses the same token keys and redirect behavior as app.js.
         */
        if (typeof window.logoutUser === "function") {
            window.logoutUser();
            return;
        }

        showAlert(
            "warning",
            "Logout API was called. If you remain signed in, use the shared logout function from app.js."
        );
    }

    // ---------------------------------------------------------
    // Shared helpers
    // ---------------------------------------------------------

    function setLoading(isLoading) {
        if (elements.jobOrdersLoading) {
            elements.jobOrdersLoading.classList.toggle(
                "d-none",
                !isLoading
            );

            elements.jobOrdersLoading.textContent = isLoading
                ? "Loading job orders..."
                : "";
        }

        if (elements.refreshJobOrdersButton) {
            elements.refreshJobOrdersButton.disabled = isLoading;
        }

        if (elements.clearJobOrderFiltersButton) {
            elements.clearJobOrderFiltersButton.disabled = isLoading;
        }

        renderPagination();
    }

    function showAlert(type, message) {
        if (!elements.jobOrdersAlert) return;

        elements.jobOrdersAlert.className = `alert alert-${type}`;
        elements.jobOrdersAlert.textContent = message;
        elements.jobOrdersAlert.classList.remove("d-none");
    }

    function hideAlert() {
        elements.jobOrdersAlert?.classList.add("d-none");
    }

    function setText(id, value) {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = String(value);
        }
    }

    function createBadge(text, className) {
        const badge = document.createElement("span");
        badge.className = `badge ${className}`;
        badge.textContent = text;
        return badge;
    }

    function getStatusName(jobOrder) {
        return String(
            jobOrder?.status?.status_name ??
            jobOrder?.status?.name ??
            ""
        );
    }

    function getPriorityBadgeClass(priority) {
        switch (String(priority).toLowerCase()) {
            case "urgent":
                return "text-bg-danger";
            case "high":
                return "text-bg-warning";
            case "medium":
                return "text-bg-info";
            case "low":
                return "text-bg-secondary";
            default:
                return "text-bg-light";
        }
    }

    function getStatusBadgeClass(status) {
        switch (String(status).toLowerCase()) {
            case "pending":
                return "text-bg-warning";
            case "approved":
                return "text-bg-primary";
            case "assigned":
                return "text-bg-info";
            case "in progress":
                return "text-bg-info";
            case "on hold":
                return "text-bg-secondary";
            case "completed":
                return "text-bg-success";
            case "closed":
                return "text-bg-dark";
            default:
                return "text-bg-light";
        }
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        }).format(date);
    }

    function getErrorMessage(error, fallback) {
        if (error?.errors && typeof error.errors === "object") {
            const messages = Object.values(error.errors).flat();

            if (messages.length > 0) {
                return messages.join(" ");
            }
        }

        if (typeof error?.message === "string" && error.message.trim()) {
            return error.message;
        }

        return fallback;
    }

    function handleApiError(error) {
        const status = error?.status ??
            error?.statusCode ??
            error?.response?.status;

        if (status === 401) {
            showAlert(
                "warning",
                "Your session may have expired. Please log in again."
            );
        } else if (status === 403) {
            showAlert(
                "danger",
                "Your account does not have permission to access this resource."
            );
        }
    }
})();
