
(() => {
    "use strict";

    // API paths are relative to the base URL configured in app.js.
    const REQUESTS_ENDPOINT = "/maintenance-requests";
    const REQUEST_STATUSES_ENDPOINT = "/lookups/request_statuses";
    const REVIEW_ENDPOINT = (requestId) =>
        `/maintenance-requests/${encodeURIComponent(requestId)}/review`;

    const PER_PAGE = 10;
    const SEARCH_DELAY = 350;

    const state = {
        page: 1,
        perPage: PER_PAGE,
        total: 0,
        lastPage: 1,
        requests: [],
        statuses: [],
        search: "",
        statusId: "",
        priority: "",
        searchTimer: null,
        loading: false,
        submittingReview: false
    };

    const elements = {};

    document.addEventListener("DOMContentLoaded", initialize);

    async function initialize() {
        cacheElements();
        bindEvents();

        if (!elements.requestsTableBody) {
            console.error(
                "JobTrack Manage Requests: request table was not found."
            );
            return;
        }

        // Show a useful page while the API requests are running.
        setLoading(true);

        await Promise.allSettled([
            loadCurrentUser(),
            loadStatuses()
        ]);

        await loadRequests();
    }

    function cacheElements() {
        const ids = [
            "facilitiesOfficerName",
            "manageRequestsAlert",
            "totalRequestsCount",
            "pendingRequestsCount",
            "highPriorityRequestsCount",
            "approvedRequestsCount",
            "requestResultsLabel",
            "requestFiltersForm",
            "requestSearch",
            "statusFilter",
            "priorityFilter",
            "clearFiltersButton",
            "refreshRequestsButton",
            "requestsLoading",
            "requestsTableBody",
            "requestsEmptyState",
            "paginationInfo",
            "previousPageButton",
            "nextPageButton",
            "reviewRequestModal",
            "reviewRequestForm",
            "reviewRequestReference",
            "reviewRequestId",
            "reviewDecision",
            "reviewRemarks",
            "reviewModalError",
            "submitReviewButton",
            "logoutButton"
        ];

        ids.forEach((id) => {
            elements[id] = document.getElementById(id);
        });
    }

    function bindEvents() {
        elements.requestFiltersForm?.addEventListener(
            "submit",
            (event) => event.preventDefault()
        );

        elements.requestSearch?.addEventListener("input", () => {
            window.clearTimeout(state.searchTimer);

            state.searchTimer = window.setTimeout(() => {
                state.search = elements.requestSearch.value.trim();
                state.page = 1;
                loadRequests();
            }, SEARCH_DELAY);
        });

        elements.statusFilter?.addEventListener("change", () => {
            state.statusId = elements.statusFilter.value;
            state.page = 1;
            loadRequests();
        });

        elements.priorityFilter?.addEventListener("change", () => {
            state.priority = elements.priorityFilter.value;
            state.page = 1;
            loadRequests();
        });

        elements.clearFiltersButton?.addEventListener("click", clearFilters);

        elements.refreshRequestsButton?.addEventListener("click", () => {
            loadRequests();
        });

        elements.previousPageButton?.addEventListener("click", () => {
            if (state.page > 1) {
                state.page -= 1;
                loadRequests();
            }
        });

        elements.nextPageButton?.addEventListener("click", () => {
            if (state.page < state.lastPage) {
                state.page += 1;
                loadRequests();
            }
        });

        elements.requestsTableBody?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-action]");

            if (!button) return;

            const requestId = button.dataset.requestId;
            const action = button.dataset.action;

            if (!requestId) return;

            if (action === "view") {
                openRequestDetails(requestId);
            } else if (action === "review") {
                openReviewModal(requestId);
            }
        });

        elements.reviewRequestForm?.addEventListener(
            "submit",
            submitReview
        );

        elements.reviewDecision?.addEventListener("change", () => {
            if (elements.reviewDecision.value === "reject") {
                elements.reviewRemarks.required = true;
                elements.reviewRemarks.placeholder =
                    "Explain why this request is being rejected.";
            } else {
                elements.reviewRemarks.required = false;
                elements.reviewRemarks.placeholder =
                    "Optional remarks for this decision.";
            }
        });

        elements.logoutButton?.addEventListener("click", async (event) => {
            event.preventDefault();

            if (typeof window.apiRequest !== "function") {
                showAlert(
                    "danger",
                    "The shared API helper is unavailable. Check app.js."
                );
                return;
            }

            try {
                await window.apiRequest("/auth/logout", {
                    method: "POST"
                });
            } catch (error) {
                // Continue with local logout even if the API call fails.
                console.warn("Logout API request failed:", error);
            }

            // Use the shared app.js logout function if available.
            if (typeof window.logoutUser === "function") {
                window.logoutUser();
                return;
            }

            // Fallback: clear the standard JobTrack auth keys.
            localStorage.removeItem("jobtrack_token");
            localStorage.removeItem("jobtrack_user");
            localStorage.removeItem("auth_token");
            localStorage.removeItem("auth_user");

            window.location.assign("../../index.html");
        });
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
                user.full_name ||
                [user.first_name, user.last_name]
                    .filter(Boolean)
                    .join(" ") ||
                "Facilities Officer";
        } catch (error) {
            console.error("Unable to load current user:", error);

            elements.facilitiesOfficerName.textContent =
                "Facilities Officer";

            handleAuthenticationError(error);
        }
    }

    // ---------------------------------------------------------
    // Status lookup
    // ---------------------------------------------------------

    async function loadStatuses() {
        if (!elements.statusFilter) return;

        try {
            const response = await apiRequest(REQUEST_STATUSES_ENDPOINT);
            const statuses = Array.isArray(response?.data)
                ? response.data
                : [];

            state.statuses = statuses;

            elements.statusFilter.innerHTML =
                '<option value="">All statuses</option>';

            statuses.forEach((status) => {
                const id = status.id ?? status.status_id;
                const name = status.name ?? status.status_name;

                if (id == null || !name) return;

                const option = document.createElement("option");
                option.value = String(id);
                option.textContent = name;

                elements.statusFilter.appendChild(option);
            });
        } catch (error) {
            console.error("Unable to load request statuses:", error);

            showAlert(
                "warning",
                "Could not load status options. You can still view requests, " +
                "but status filtering may be unavailable."
            );

            handleAuthenticationError(error);
        }
    }

    // ---------------------------------------------------------
    // Request queue
    // ---------------------------------------------------------

    async function loadRequests() {
        if (state.loading) return;

        state.loading = true;
        setLoading(true);
        hideAlert();

        const query = new URLSearchParams();

        query.set("page", String(state.page));
        query.set("per_page", String(state.perPage));
        query.set("sort", "-submitted_at");

        if (state.search) {
            query.set("q", state.search);
        }

        if (state.statusId) {
            query.set("status_id", state.statusId);
        }

        if (state.priority) {
            query.set("priority", state.priority);
        }

        try {
            const response = await apiRequest(
                `${REQUESTS_ENDPOINT}?${query.toString()}`
            );

            const requests = Array.isArray(response?.data)
                ? response.data
                : [];

            const meta = response?.meta ?? {};

            state.requests = requests;
            state.total = Number(meta.total ?? requests.length);
            state.page = Number(meta.current_page ?? state.page);
            state.perPage = Number(meta.per_page ?? state.perPage);
            state.lastPage = Math.max(
                1,
                Number(
                    meta.last_page ??
                    Math.ceil(state.total / state.perPage)
                )
            );

            renderRequests();
            renderPagination();
            renderPageCounters();
        } catch (error) {
            console.error("Unable to load maintenance requests:", error);

            state.requests = [];
            state.total = 0;

            renderRequests();
            renderPagination();
            renderPageCounters();

            showAlert("danger", getErrorMessage(
                error,
                "Unable to load maintenance requests."
            ));

            handleAuthenticationError(error);
        } finally {
            state.loading = false;
            setLoading(false);
        }
    }

    function renderRequests() {
        if (!elements.requestsTableBody) return;

        elements.requestsTableBody.replaceChildren();

        if (state.requests.length === 0) {
            elements.requestsEmptyState?.classList.remove("d-none");

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 8;
            cell.className = "text-center text-muted py-3";
            cell.textContent = "No requests to display.";

            row.appendChild(cell);
            elements.requestsTableBody.appendChild(row);
        } else {
            elements.requestsEmptyState?.classList.add("d-none");

            state.requests.forEach((request) => {
                elements.requestsTableBody.appendChild(
                    createRequestRow(request)
                );
            });
        }

        if (elements.requestResultsLabel) {
            elements.requestResultsLabel.textContent =
                `${state.total} result${state.total === 1 ? "" : "s"}`;
        }
    }

    function createRequestRow(request) {
        const row = document.createElement("tr");

        const requestId = request.request_id;
        const reference = request.reference || `Request #${requestId}`;
        const requester = getRequesterName(request.requester);
        const category = request.category?.name ??
            request.category?.category_name ??
            "—";
        const location = request.location?.name ??
            request.location?.location_name ??
            "—";
        const priority = request.priority || "—";
        const status = request.status?.status_name ??
            request.status?.name ??
            "Unknown";
        const submittedAt = formatDate(request.submitted_at);

        [
            reference,
            requester,
            category,
            location
        ].forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        const priorityCell = document.createElement("td");
        priorityCell.appendChild(createBadge(
            priority,
            getPriorityBadgeClass(priority)
        ));
        row.appendChild(priorityCell);

        const statusCell = document.createElement("td");
        statusCell.appendChild(createBadge(
            status,
            getStatusBadgeClass(status)
        ));
        row.appendChild(statusCell);

        const submittedCell = document.createElement("td");
        submittedCell.textContent = submittedAt;
        row.appendChild(submittedCell);

        const actionsCell = document.createElement("td");
        actionsCell.className = "text-nowrap";

        const viewButton = document.createElement("button");
        viewButton.type = "button";
        viewButton.className = "btn btn-sm btn-outline-primary me-1";
        viewButton.textContent = "View";
        viewButton.dataset.action = "view";
        viewButton.dataset.requestId = String(requestId);
        viewButton.setAttribute(
            "aria-label",
            `View ${reference}`
        );
        actionsCell.appendChild(viewButton);

        if (status.toLowerCase() === "pending") {
            const reviewButton = document.createElement("button");
            reviewButton.type = "button";
            reviewButton.className = "btn btn-sm btn-primary";
            reviewButton.textContent = "Review";
            reviewButton.dataset.action = "review";
            reviewButton.dataset.requestId = String(requestId);
            reviewButton.setAttribute(
                "aria-label",
                `Review ${reference}`
            );
            actionsCell.appendChild(reviewButton);
        }

        row.appendChild(actionsCell);

        return row;
    }

    function renderPageCounters() {
        // These three counters describe the CURRENT PAGE, not all
        // matching records. The total counter uses API pagination metadata.
        const requests = state.requests;

        setText("totalRequestsCount", state.total);

        setText(
            "pendingRequestsCount",
            requests.filter((request) =>
                getStatusName(request).toLowerCase() === "pending"
            ).length
        );

        setText(
            "highPriorityRequestsCount",
            requests.filter((request) =>
                ["high", "urgent"].includes(
                    String(request.priority || "").toLowerCase()
                )
            ).length
        );

        setText(
            "approvedRequestsCount",
            requests.filter((request) =>
                getStatusName(request).toLowerCase() === "approved"
            ).length
        );

        // Make the scope clear rather than implying these are global totals.
        [
            "pendingRequestsCount",
            "highPriorityRequestsCount",
            "approvedRequestsCount"
        ].forEach((id) => {
            const element = document.getElementById(id);
            const label = element?.previousElementSibling;

            if (label) {
                label.textContent = label.textContent.replace(
                    /\s*\(.*\)$/,
                    ""
                ) + " (this page)";
            }
        });
    }

    function renderPagination() {
        const first = state.total === 0
            ? 0
            : (state.page - 1) * state.perPage + 1;

        const last = Math.min(
            state.page * state.perPage,
            state.total
        );

        if (elements.paginationInfo) {
            elements.paginationInfo.textContent =
                `Showing ${first}–${last} of ${state.total}`;
        }

        if (elements.previousPageButton) {
            elements.previousPageButton.disabled =
                state.loading || state.page <= 1;
        }

        if (elements.nextPageButton) {
            elements.nextPageButton.disabled =
                state.loading || state.page >= state.lastPage;
        }
    }

    // ---------------------------------------------------------
    // Review workflow
    // ---------------------------------------------------------

    function openReviewModal(requestId) {
        const request = state.requests.find(
            (item) => String(item.request_id) === String(requestId)
        );

        if (!request) {
            showAlert(
                "warning",
                "This request is no longer on the current page. Refresh the list."
            );
            return;
        }

        if (getStatusName(request).toLowerCase() !== "pending") {
            showAlert(
                "warning",
                "Only pending requests can be reviewed."
            );
            return;
        }

        if (!elements.reviewRequestModal || !window.bootstrap?.Modal) {
            showAlert(
                "danger",
                "The review dialog could not be opened. Check Bootstrap JavaScript."
            );
            return;
        }

        elements.reviewRequestForm?.reset();

        elements.reviewRequestId.value = String(request.request_id);
        elements.reviewRequestReference.textContent =
            request.reference || `Request #${request.request_id}`;

        elements.reviewRemarks.required = false;
        elements.reviewModalError?.classList.add("d-none");

        window.bootstrap.Modal
            .getOrCreateInstance(elements.reviewRequestModal)
            .show();
    }

    async function submitReview(event) {
        event.preventDefault();

        if (state.submittingReview) return;

        const requestId = elements.reviewRequestId?.value;
        const decision = elements.reviewDecision?.value;
        const remarks = elements.reviewRemarks?.value.trim() || "";

        if (!requestId) {
            showReviewError("The request ID is missing. Close this dialog and try again.");
            return;
        }

        if (!["approve", "reject"].includes(decision)) {
            showReviewError("Choose approve or reject.");
            return;
        }

        if (decision === "reject" && !remarks) {
            showReviewError("Remarks are required when rejecting a request.");
            elements.reviewRemarks?.focus();
            return;
        }

        if (remarks.length > 255) {
            showReviewError("Remarks must not exceed 255 characters.");
            return;
        }

        const payload = { decision };

        if (remarks) {
            payload.remarks = remarks;
        }

        state.submittingReview = true;

        if (elements.submitReviewButton) {
            elements.submitReviewButton.disabled = true;
            elements.submitReviewButton.textContent = "Submitting...";
        }

        try {
            await apiRequest(REVIEW_ENDPOINT(requestId), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            window.bootstrap.Modal
                .getOrCreateInstance(elements.reviewRequestModal)
                .hide();

            showAlert(
                "success",
                decision === "approve"
                    ? "The request was approved."
                    : "The request was rejected."
            );

            await loadRequests();
        } catch (error) {
            console.error("Unable to submit request review:", error);

            showReviewError(getErrorMessage(
                error,
                "The review could not be submitted."
            ));

            handleAuthenticationError(error);
        } finally {
            state.submittingReview = false;

            if (elements.submitReviewButton) {
                elements.submitReviewButton.disabled = false;
                elements.submitReviewButton.textContent = "Submit Decision";
            }
        }
    }

    function showReviewError(message) {
        if (!elements.reviewModalError) return;

        elements.reviewModalError.textContent = message;
        elements.reviewModalError.classList.remove("d-none");
    }

    // ---------------------------------------------------------
    // Navigation and filters
    // ---------------------------------------------------------

    function openRequestDetails(requestId) {
        const url = new URL(
            "request-details.html",
            window.location.href
        );

        // requestId is the numeric database identifier expected by the API.
        url.searchParams.set("requestId", requestId);

        window.location.assign(url.toString());
    }

    function clearFilters() {
        if (elements.requestSearch) {
            elements.requestSearch.value = "";
        }

        if (elements.statusFilter) {
            elements.statusFilter.value = "";
        }

        if (elements.priorityFilter) {
            elements.priorityFilter.value = "";
        }

        state.search = "";
        state.statusId = "";
        state.priority = "";
        state.page = 1;

        window.clearTimeout(state.searchTimer);
        loadRequests();
    }

    // ---------------------------------------------------------
    // UI helpers
    // ---------------------------------------------------------

    function setLoading(isLoading) {
        if (elements.requestsLoading) {
            elements.requestsLoading.classList.toggle(
                "d-none",
                !isLoading
            );
            elements.requestsLoading.textContent = isLoading
                ? "Loading maintenance requests..."
                : "";
        }

        if (elements.refreshRequestsButton) {
            elements.refreshRequestsButton.disabled = isLoading;
        }

        if (elements.clearFiltersButton) {
            elements.clearFiltersButton.disabled = isLoading;
        }

        renderPagination();
    }

    function showAlert(type, message) {
        const alert = elements.manageRequestsAlert;
        if (!alert) return;

        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        alert.classList.remove("d-none");
    }

    function hideAlert() {
        elements.manageRequestsAlert?.classList.add("d-none");
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
            case "rejected":
                return "text-bg-danger";
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

    function getRequesterName(requester) {
        if (!requester) return "—";

        const combinedName = [
            requester.first_name,
            requester.last_name
        ].filter(Boolean).join(" ");

        return requester.full_name ||
            requester.name ||
            combinedName ||
            requester.email ||
            "—";
    }

    function getStatusName(request) {
        return String(
            request?.status?.status_name ??
            request?.status?.name ??
            ""
        );
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

            if (messages.length) {
                return messages.join(" ");
            }
        }

        if (typeof error?.message === "string" && error.message.trim()) {
            return error.message;
        }

        return fallback;
    }

    function handleAuthenticationError(error) {
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
                "Your account does not have permission to perform this action."
            );
        }
    }
})();
