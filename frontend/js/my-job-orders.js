
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    const alertBox = $("myJobOrdersAlert");
    const refreshButton = $("refreshMyJobOrdersButton");
    const filtersForm = $("myJobOrdersFiltersForm");

    const state = {
        page: 1,
        perPage: 10,
        lastPage: 1,
        jobs: [],
        total: 0,
        loading: false
    };

    function showAlert(message, type = "danger") {
        alertBox.textContent = message;
        alertBox.className = `alert alert-${type}`;
    }

    function hideAlert() {
        alertBox.textContent = "";
        alertBox.className = "alert d-none";
    }

    async function apiRequest(path, options) {
        if (typeof window.apiRequest !== "function") {
            throw new Error(
                "Shared API helper not found. Check ../../js/app.js."
            );
        }

        // Preserve the full response envelope, including pagination metadata.
        return await window.apiRequest(path, options);
    }

    function unwrapData(response) {
        return response && Object.prototype.hasOwnProperty.call(response, "data")
            ? response.data
            : response;
    }

    function getStatus(job) {
        return job.status_label ??
            job.status?.status_name ??
            "Unknown";
    }

    function getCategory(job) {
        return job.category_label ??
            job.category?.category_name ??
            "—";
    }

    function getLocation(job) {
        return job.location_label ??
            job.location?.location_name ??
            job.location ??
            "—";
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function makeCell(value) {
        const cell = document.createElement("td");
        cell.textContent = value == null || value === "" ? "—" : String(value);
        return cell;
    }

    function makeBadge(value, type) {
        const badge = document.createElement("span");
        const normalized = String(value || "").toLowerCase();

        const statusClasses = {
            pending: "bg-secondary",
            approved: "bg-secondary",
            assigned: "bg-primary",
            "in progress": "bg-info text-dark",
            "on hold": "bg-warning text-dark",
            completed: "bg-success",
            closed: "bg-dark"
        };

        const priorityClasses = {
            urgent: "bg-danger",
            high: "bg-warning text-dark",
            medium: "bg-info text-dark",
            low: "bg-secondary"
        };

        const classes = type === "priority"
            ? priorityClasses
            : statusClasses;

        badge.className = `badge ${classes[normalized] || "bg-secondary"}`;
        badge.textContent = value || "Unknown";

        return badge;
    }

    function matchesLocalFilters(job) {
        const search = $("jobOrderSearch").value.trim().toLowerCase();
        const selectedStatus = $("jobOrderStatusFilter").value;

        const haystack = [
            job.job_order_id,
            job.request_id,
            job.request_reference,
            getCategory(job),
            getLocation(job),
            job.priority,
            getStatus(job)
        ].filter(Boolean).join(" ").toLowerCase();

        const matchesSearch = !search || haystack.includes(search);
        const matchesStatus =
            !selectedStatus || getStatus(job) === selectedStatus;

        return matchesSearch && matchesStatus;
    }

    function renderSummary(jobs) {
        $("pageJobOrdersCount").textContent = jobs.length.toLocaleString();

        $("pageInProgressCount").textContent = jobs.filter(
            (job) => getStatus(job) === "In Progress"
        ).length.toLocaleString();

        // This counts job orders with status "Assigned", not assignment
        // responses. Assignment status is a separate field in the API.
        $("awaitingAcceptanceCount").textContent = jobs.filter(
            (job) => getStatus(job) === "Assigned"
        ).length.toLocaleString();
    }

    function renderJobs() {
        const tbody = $("myJobOrdersTableBody");
        const emptyState = $("myJobOrdersEmptyState");
        const tableWrapper = $("myJobOrdersTableWrapper");

        tbody.replaceChildren();

        const filteredJobs = state.jobs.filter(matchesLocalFilters);

        renderSummary(state.jobs);

        $("myJobOrdersResultLabel").textContent =
            `${filteredJobs.length} shown on this page`;

        if (filteredJobs.length === 0) {
            tableWrapper.classList.add("d-none");
            emptyState.classList.remove("d-none");

            $("myJobOrdersEmptyTitle").textContent =
                state.jobs.length === 0
                    ? "No assigned job orders"
                    : "No matching job orders";

            $("myJobOrdersEmptyMessage").textContent =
                state.jobs.length === 0
                    ? "Your assigned maintenance jobs will appear here."
                    : "Try changing your search or filters.";

            return;
        }

        emptyState.classList.add("d-none");
        tableWrapper.classList.remove("d-none");

        filteredJobs.forEach((job) => {
            const row = document.createElement("tr");

            const reference = job.request_reference ||
                `JO-${job.job_order_id}`;

            row.appendChild(makeCell(reference));
            row.appendChild(makeCell(getCategory(job)));
            row.appendChild(makeCell(getLocation(job)));

            const priorityCell = document.createElement("td");
            priorityCell.appendChild(makeBadge(job.priority, "priority"));
            row.appendChild(priorityCell);

            const statusCell = document.createElement("td");
            statusCell.appendChild(makeBadge(getStatus(job), "status"));
            row.appendChild(statusCell);

            row.appendChild(makeCell(formatDate(job.created_at)));

            const actionCell = document.createElement("td");
            const viewButton = document.createElement("a");

            viewButton.className = "btn btn-sm btn-outline-primary";
            viewButton.textContent = "View Details";
            viewButton.href =
                `job-order-details.html?jobOrderId=${encodeURIComponent(
                    job.job_order_id
                )}`;

            actionCell.appendChild(viewButton);
            row.appendChild(actionCell);

            tbody.appendChild(row);
        });
    }

    function updatePagination(meta) {
        state.lastPage = Math.max(
            1,
            Number(meta?.last_page) || 1
        );

        state.total = Number(meta?.total) || 0;

        const currentPage = Number(meta?.current_page) || state.page;
        const perPage = Number(meta?.per_page) || state.perPage;

        state.page = currentPage;
        state.perPage = perPage;

        $("myJobOrdersPaginationInfo").textContent =
            state.total === 0
                ? "No job orders"
                : `Page ${currentPage} of ${state.lastPage} · ${state.total} total`;

        $("previousMyJobOrdersPageButton").disabled =
            currentPage <= 1 || state.loading;

        $("nextMyJobOrdersPageButton").disabled =
            currentPage >= state.lastPage || state.loading;
    }

    async function loadCurrentUser() {
        const response = await apiRequest("/auth/me");
        const user = unwrapData(response);

        $("technicianName").textContent =
            user?.full_name || "Technician";
    }

    async function loadJobOrders() {
        if (state.loading) return;

        state.loading = true;
        hideAlert();

        $("myJobOrdersLoading").classList.remove("d-none");
        $("myJobOrdersEmptyState").classList.add("d-none");
        $("myJobOrdersTableWrapper").classList.add("d-none");

        refreshButton.disabled = true;
        refreshButton.textContent = "Refreshing...";

        $("previousMyJobOrdersPageButton").disabled = true;
        $("nextMyJobOrdersPageButton").disabled = true;

        try {
            const params = new URLSearchParams({
                mine: "true",
                sort: "-created_at",
                page: String(state.page),
                per_page: String(state.perPage)
            });

            const priority = $("jobOrderPriorityFilter").value;

            if (priority) {
                params.set("priority", priority);
            }

            const response = await apiRequest(
                `/job-orders?${params.toString()}`
            );

            const payload = unwrapData(response);

            // Standard paginated response: { data: [...], meta: {...} }.
            // unwrapData(response) yields the array, so read meta from
            // the original response envelope.
            state.jobs = Array.isArray(payload)
                ? payload
                : [];

            const meta = response?.meta ??
                response?.data?.meta ??
                {};

            // Some API helpers may wrap the response differently.
            // If no metadata is available, display the returned page only.
            if (!meta.current_page) {
                meta.current_page = state.page;
            }

            if (!meta.per_page) {
                meta.per_page = state.perPage;
            }

            if (!meta.last_page) {
                meta.last_page = state.jobs.length < state.perPage
                    ? state.page
                    : state.page + 1;
            }

            if (meta.total == null) {
                meta.total = state.jobs.length;
            }

            updatePagination(meta);
            renderJobs();
        } catch (error) {
            console.error("Failed to load technician job orders:", error);

            state.jobs = [];
            $("myJobOrdersTableBody").replaceChildren();

            $("myJobOrdersLoading").classList.add("d-none");
            $("myJobOrdersTableWrapper").classList.add("d-none");
            $("myJobOrdersEmptyState").classList.remove("d-none");

            $("myJobOrdersEmptyTitle").textContent =
                "Unable to load job orders";

            $("myJobOrdersEmptyMessage").textContent =
                "Check your connection and try again.";

            $("myJobOrdersResultLabel").textContent =
                "Could not load job orders";

            showAlert(
                "Unable to retrieve your job orders. The backend may still " +
                "be under development, or the request may have failed. " +
                "Please refresh and check the browser console if the issue persists."
            );
        } finally {
            state.loading = false;

            $("myJobOrdersLoading").classList.add("d-none");

            refreshButton.disabled = false;
            refreshButton.textContent = "Refresh";

            updatePagination({
                current_page: state.page,
                per_page: state.perPage,
                last_page: state.lastPage,
                total: state.total
            });
        }
    }

    function resetToFirstPage() {
        state.page = 1;
        loadJobOrders();
    }

    $("jobOrderSearch").addEventListener("input", renderJobs);

    $("jobOrderStatusFilter").addEventListener(
        "change",
        renderJobs
    );

    $("jobOrderPriorityFilter").addEventListener(
        "change",
        resetToFirstPage
    );

    filtersForm.addEventListener("submit", (event) => {
        event.preventDefault();
        renderJobs();
    });

    $("clearMyJobOrderFiltersButton").addEventListener("click", () => {
        $("jobOrderSearch").value = "";
        $("jobOrderStatusFilter").value = "";
        $("jobOrderPriorityFilter").value = "";
        state.page = 1;
        loadJobOrders();
    });

    refreshButton.addEventListener("click", async () => {
        try {
            await loadCurrentUser();
        } catch (error) {
            console.error("Unable to refresh technician profile:", error);
        }

        await loadJobOrders();
    });

    $("previousMyJobOrdersPageButton").addEventListener("click", () => {
        if (!state.loading && state.page > 1) {
            state.page -= 1;
            loadJobOrders();
        }
    });

    $("nextMyJobOrdersPageButton").addEventListener("click", () => {
        if (!state.loading && state.page < state.lastPage) {
            state.page += 1;
            loadJobOrders();
        }
    });

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

        await loadJobOrders();
    }

    initializePage();
});
