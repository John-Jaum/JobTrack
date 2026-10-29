/*
 * JobTrack — My Requests page
 * Uses the finalized OpenAPI contract:
 *   GET /api/v1/maintenance-requests
 *   GET /api/v1/lookups/request_statuses
 *
 * This page intentionally does not load app.js because its existing
 * My Requests implementation reads localStorage mock request records.
 */

(() => {
    "use strict";

    const API_BASE_URL = "https://jobtrack-fk7m.onrender.com/api/v1";
    const AUTH_TOKEN_KEY = "jobtrack_token";
    const AUTH_USER_KEY = "jobtrack_user";
    const PAGE_SIZE = 15;

    const tableBody = document.getElementById("requestsTableBody");
    if (!tableBody) return;

    const form = document.getElementById("requestFiltersForm");
    const searchInput = document.getElementById("requestSearch");
    const statusFilter = document.getElementById("statusFilter");
    const priorityFilter = document.getElementById("priorityFilter");
    const countElement = document.getElementById("requestCount");
    const loadingElement = document.getElementById("requestsLoading");
    const errorElement = document.getElementById("requestsError");
    const paginationElement = document.getElementById("requestsPagination");
    const paginationSummary = document.getElementById("paginationSummary");
    const userNameElement = document.getElementById("currentUserName");
    const logoutLink = document.getElementById("logoutLink");

    let currentPage = 1;
    let lastPage = 1;
    let currentRequestController = null;

    function getToken() {
        return localStorage.getItem(AUTH_TOKEN_KEY);
    }

    /*
    function redirectToLogin() {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
        window.location.assign("../../index.html");
    }
    */

    async function apiRequest(path, options = {}) {
        const token = getToken();

        if (!token) {
            redirectToLogin();
            throw new Error("Your session is missing. Please sign in again.");
        }

        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...options.headers,
                Authorization: `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            redirectToLogin();
            throw new Error("Your session has expired. Please sign in again.");
        }

        let payload = null;
        if (response.status !== 204) {
            try {
                payload = await response.json();
            } catch {
                // The error below will remain useful if the server didn't return JSON.
            }
        }

        if (!response.ok) {
            const validationMessage = payload?.errors
                ? Object.values(payload.errors).flat().find(value => typeof value === "string")
                : null;

            throw new Error(
                validationMessage ||
                payload?.message ||
                `The request failed (HTTP ${response.status}).`
            );
        }

        return payload;
    }

    function showError(message) {
        errorElement.textContent = message;
        errorElement.classList.remove("d-none");
    }

    function clearError() {
        errorElement.textContent = "";
        errorElement.classList.add("d-none");
    }

    function setLoading(isLoading) {
        loadingElement.classList.toggle("d-none", !isLoading);
        if (isLoading) {
            tableBody.replaceChildren();
            paginationElement.replaceChildren();
            paginationSummary.textContent = "";
        }
    }

    function formatDate(dateTime) {
        if (!dateTime) return "—";

        const date = new Date(dateTime);
        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function makeCell(text) {
        const cell = document.createElement("td");
        cell.textContent = text == null || text === "" ? "—" : String(text);
        return cell;
    }

    function statusClass(statusName) {
        const classes = {
            "Pending": "text-bg-warning",
            "Approved": "text-bg-info",
            "Rejected": "text-bg-danger",
            "In Progress": "text-bg-primary",
            "On Hold": "text-bg-secondary",
            "Completed": "text-bg-success",
            "Closed": "text-bg-dark"
        };
        return classes[statusName] || "text-bg-secondary";
    }

    function renderRequests(requests) {
        tableBody.replaceChildren();

        if (!requests.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 7;
            cell.className = "text-center text-muted py-4";
            cell.textContent = "No maintenance requests match your filters.";
            row.appendChild(cell);
            tableBody.appendChild(row);
            return;
        }

        requests.forEach(request => {
            const row = document.createElement("tr");
            const reference = request.reference ||
                `MR-${String(request.request_id ?? "").padStart(4, "0")}`;

            const idCell = document.createElement("td");
            const link = document.createElement("a");
            link.className = "text-decoration-none fw-semibold";
            // The contract's path parameter is request_id, not the MR display reference.
            link.href = `request-details.html?id=${encodeURIComponent(request.request_id)}`;
            link.textContent = reference;
            idCell.appendChild(link);

            const categoryCell = makeCell(request.category_label ?? "—");
            const locationCell = makeCell(request.location_label ?? "—");
            const priorityCell = makeCell(request.priority);

            const statusCell = document.createElement("td");
            const statusName = request.status_label || "Unknown";
            const badge = document.createElement("span");
            badge.className = `badge ${statusClass(statusName)}`;
            badge.textContent = statusName;
            statusCell.appendChild(badge);

            const dateCell = makeCell(formatDate(request.submitted_at));
            const attachmentsCell = makeCell(request.attachments_count ?? 0);

            row.append(
                idCell,
                categoryCell,
                locationCell,
                priorityCell,
                statusCell,
                dateCell,
                attachmentsCell
            );
            tableBody.appendChild(row);
        });
    }

    function renderPagination(meta) {
        paginationElement.replaceChildren();

        currentPage = Number(meta.current_page) || 1;
        lastPage = Math.max(1, Number(meta.last_page) || 1);

        const addPageButton = (label, page, disabled, active = false, ariaLabel = label) => {
            const item = document.createElement("li");
            item.className = `page-item${disabled ? " disabled" : ""}${active ? " active" : ""}`;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "page-link";
            button.textContent = label;
            button.setAttribute("aria-label", ariaLabel);
            if (active) button.setAttribute("aria-current", "page");
            button.disabled = disabled;
            button.addEventListener("click", () => loadRequests(page));

            item.appendChild(button);
            paginationElement.appendChild(item);
        };

        addPageButton("Previous", currentPage - 1, currentPage <= 1, false, "Previous page");

        // Keep the pagination control compact when there are many pages.
        const start = Math.max(1, currentPage - 2);
        const end = Math.min(lastPage, currentPage + 2);

        if (start > 1) {
            addPageButton("1", 1, false, currentPage === 1, "Page 1");
            if (start > 2) {
                const ellipsis = document.createElement("li");
                ellipsis.className = "page-item disabled";
                ellipsis.innerHTML = '<span class="page-link">…</span>';
                paginationElement.appendChild(ellipsis);
            }
        }

        for (let page = start; page <= end; page++) {
            addPageButton(String(page), page, false, page === currentPage, `Page ${page}`);
        }

        if (end < lastPage) {
            if (end < lastPage - 1) {
                const ellipsis = document.createElement("li");
                ellipsis.className = "page-item disabled";
                ellipsis.innerHTML = '<span class="page-link">…</span>';
                paginationElement.appendChild(ellipsis);
            }
            addPageButton(String(lastPage), lastPage, false, currentPage === lastPage, `Page ${lastPage}`);
        }

        addPageButton("Next", currentPage + 1, currentPage >= lastPage, false, "Next page");

        const total = Number(meta.total) || 0;
        const perPage = Number(meta.per_page) || PAGE_SIZE;
        const first = total === 0 ? 0 : ((currentPage - 1) * perPage) + 1;
        const last = Math.min(currentPage * perPage, total);
        paginationSummary.textContent = total
            ? `Showing ${first}–${last} of ${total} requests`
            : "No requests to display";

        countElement.textContent = `${total} ${total === 1 ? "request" : "requests"}`;
    }

    async function loadStatusOptions() {
        try {
            const response = await apiRequest("/statuses");
            const statuses = Array.isArray(response?.data) ? response.data : [];

            statuses.forEach(status => {
                const id = status.id ?? status.status_id;
                const name = status.label ?? status.name ?? status.status_name;
                if (id == null || !name) return;

                const option = document.createElement("option");
                option.value = String(id);
                option.textContent = name;
                statusFilter.appendChild(option);
            });
        } catch (error) {
            // Filters are optional. Keep the page usable if lookup loading fails.
            console.warn("Could not load request status filters:", error);
        }
    }


    async function loadCurrentUserName() {
        // This page may not contain a currentUserName element.
        // If it doesn't, there is nothing to update.
        if (!userNameElement) return;

        const cachedUser = localStorage.getItem(AUTH_USER_KEY);

        if (cachedUser) {
            try {
                const user = JSON.parse(cachedUser);

                if (user.full_name) {
                    userNameElement.textContent = user.full_name;
                    return;
                }
            } catch {
                localStorage.removeItem(AUTH_USER_KEY);
            }
        }

        // Optional profile refresh; a failure shouldn't block the request list.
        try {
            const response = await apiRequest("/auth/me");
            const user = response?.data;

            if (user?.full_name) {
                userNameElement.textContent = user.full_name;
            }
        } catch (error) {
            console.warn("Could not load current user profile:", error);
        }
    }


    async function loadRequests(page = 1) {
        if (currentRequestController) {
            currentRequestController.abort();
        }
        currentRequestController = new AbortController();

        clearError();
        setLoading(true);

        const params = new URLSearchParams({
            page: String(page),
            per_page: String(PAGE_SIZE),
            sort: "-submitted_at"
        });

        const q = searchInput.value.trim();
        const statusId = statusFilter.value;
        const priority = priorityFilter.value;

        if (q) params.set("q", q);
        if (statusId) params.set("status_id", statusId);
        if (priority) params.set("priority", priority);

        try {
            const response = await apiRequest(
                `/maintenance-requests?${params.toString()}`,
                { signal: currentRequestController.signal }
            );

            if (!Array.isArray(response?.data) || !response?.meta) {
                throw new Error("The API response does not match the finalized maintenance-requests contract.");
            }

            renderRequests(response.data);
            renderPagination(response.meta);
        } catch (error) {
            if (error.name === "AbortError") return;

            console.error("My Requests API error:", error);
            showError(error.message || "Unable to load your maintenance requests.");
            tableBody.replaceChildren();

            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 7;
            cell.className = "text-center text-muted py-4";
            cell.textContent = "Unable to load your requests.";
            row.appendChild(cell);
            tableBody.appendChild(row);

            countElement.textContent = "Requests unavailable";
            paginationElement.replaceChildren();
            paginationSummary.textContent = "";
        } finally {
            if (!currentRequestController?.signal.aborted) {
                setLoading(false);
            }
        }
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        loadRequests(1);
    });

    logoutLink.addEventListener("click", async event => {
        event.preventDefault();

        const token = getToken();
        if (token) {
            try {
                await fetch(`${API_BASE_URL}/auth/logout`, {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        Authorization: `Bearer ${token}`
                    }
                });
            } catch (error) {
                console.warn("Logout API request could not complete:", error);
            }
        }

        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
        window.location.assign("../../index.html");
    });

    // Start the page. Backend connectivity can be tested once Laravel is ready.
    loadStatusOptions();
    loadCurrentUserName();
    loadRequests(1);
})();
