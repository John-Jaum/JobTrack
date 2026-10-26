
(() => {
    "use strict";

    const TOKEN_KEY = "jobtrack_token";
    const PAGE_SIZE = 15;
    const $ = id => document.getElementById(id);

    const el = {
        alert: $("reportsAlert"),
        topbarName: $("adminTopbarUserName"),
        logout: $("logoutButton"),

        filterForm: $("reportFilterForm"),
        dateFrom: $("dateFrom"),
        dateTo: $("dateTo"),
        clearDates: $("clearDatesButton"),

        activityForm: $("activityReportForm"),
        groupBy: $("groupBy"),
        activityGenerate: $("generateActivityButton"),
        activityRetry: $("retryActivityButton"),
        activityLoading: $("activityLoading"),
        activityEmpty: $("activityEmpty"),
        activityError: $("activityError"),
        activityContainer: $("activityTableContainer"),
        activityBody: $("activityTableBody"),
        activityRequests: $("activityTotalRequests"),
        activityOrders: $("activityTotalJobOrders"),
        activityCompleted: $("activityTotalCompleted"),
        activityHours: $("activityTotalHours"),
        activityExport: $("exportActivityButton"),

        recurringForm: $("recurringReportForm"),
        minCount: $("minCount"),
        recurringGenerate: $("generateRecurringButton"),
        recurringRetry: $("retryRecurringButton"),
        recurringLoading: $("recurringLoading"),
        recurringEmpty: $("recurringEmpty"),
        recurringError: $("recurringError"),
        recurringContainer: $("recurringTableContainer"),
        recurringBody: $("recurringTableBody"),
        recurringTotal: $("recurringTotalIssues"),
        recurringRequests: $("recurringPageRequests"),
        recurringPagination: $("recurringPaginationInfo"),
        recurringPrevious: $("previousRecurringPage"),
        recurringNext: $("nextRecurringPage"),
        recurringExport: $("exportRecurringButton")
    };

    const state = {
        activityRows: [],
        recurringRows: [],
        recurringPage: 1,
        recurringLastPage: 1,
        recurringTotal: 0,
        activityLoaded: false,
        recurringLoaded: false,
        activityLoading: false,
        recurringLoading: false
    };

    function showAlert(message, type = "danger") {
        el.alert.textContent = message;
        el.alert.className = `alert alert-${type}`;
    }

    function hideAlert() {
        el.alert.textContent = "";
        el.alert.className = "alert d-none";
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function number(value, decimals = 0) {
        const n = Number(value);
        if (!Number.isFinite(n)) return "—";

        return n.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals
        });
    }

    function formatDate(value) {
        if (!value) return "—";
        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? "—"
            : date.toLocaleString();
    }

    async function api(path, options) {
        if (typeof window.apiRequest !== "function") {
            throw new Error(
                "The shared API helper is unavailable. Check ../../js/app.js."
            );
        }

        return window.apiRequest(path, options);
    }

    function dataOf(response) {
        return response?.data;
    }

    async function loadCurrentUser() {
        const response = await api("/auth/me");
        const user = dataOf(response);

        if (!user) {
            throw new Error("Could not identify the current user.");
        }

        if (el.topbarName) {
            el.topbarName.textContent = user.full_name || "Administrator";
        }

        const roleName = user.role?.role_name;
        if (!["Administrator", "Facilities Officer"].includes(roleName)) {
            throw new Error(
                "You are not authorized to access reports. " +
                "The backend must enforce this restriction as well."
            );
        }
    }

    function getDateParams() {
        const from = el.dateFrom.value;
        const to = el.dateTo.value;

        if (from && to && from > to) {
            throw new Error("Date From must not be later than Date To.");
        }

        const params = new URLSearchParams();

        if (from) params.set("date_from", from);
        if (to) params.set("date_to", to);

        return params;
    }

    function setActivityLoading(loading) {
        state.activityLoading = loading;
        el.activityGenerate.disabled = loading;
        el.activityGenerate.textContent = loading
            ? "Generating..."
            : "Generate Report";
        el.activityRetry.disabled = loading;
    }

    function setRecurringLoading(loading) {
        state.recurringLoading = loading;
        el.recurringGenerate.disabled = loading;
        el.recurringGenerate.textContent = loading
            ? "Generating..."
            : "Generate Report";
        el.recurringRetry.disabled = loading;
        el.recurringPrevious.disabled =
            loading || state.recurringPage <= 1;
        el.recurringNext.disabled =
            loading || state.recurringPage >= state.recurringLastPage;
    }

    function renderActivity(report) {
        const rows = report.rows;

        state.activityRows = rows;
        state.activityLoaded = true;

        const totals = rows.reduce((sum, row) => {
            sum.requests += Number(row.requests) || 0;
            sum.jobOrders += Number(row.job_orders) || 0;
            sum.completed += Number(row.completed) || 0;
            sum.hours += Number(row.total_hours) || 0;
            return sum;
        }, {
            requests: 0,
            jobOrders: 0,
            completed: 0,
            hours: 0
        });

        el.activityRequests.textContent = number(totals.requests);
        el.activityOrders.textContent = number(totals.jobOrders);
        el.activityCompleted.textContent = number(totals.completed);
        el.activityHours.textContent = number(totals.hours, 2);

        el.activityBody.replaceChildren();

        rows.forEach(row => {
            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>${escapeHtml(row.label)}</td>
                <td>${number(row.requests)}</td>
                <td>${number(row.job_orders)}</td>
                <td>${number(row.completed)}</td>
                <td>${number(row.total_hours, 2)}</td>
                <td>${
                    row.avg_resolution_hours === null ||
                    row.avg_resolution_hours === undefined
                        ? "—"
                        : number(row.avg_resolution_hours, 2)
                }</td>
            `;

            el.activityBody.appendChild(tr);
        });

        el.activityContainer.classList.toggle("d-none", rows.length === 0);
        el.activityEmpty.classList.toggle("d-none", rows.length > 0);
        el.activityExport.disabled = rows.length === 0;
    }

    async function loadActivityReport() {
        hideAlert();

        let params;
        try {
            params = getDateParams();
        } catch (error) {
            showAlert(error.message);
            return;
        }

        params.set("group_by", el.groupBy.value);

        setActivityLoading(true);
        el.activityError.classList.add("d-none");
        el.activityEmpty.classList.add("d-none");
        el.activityContainer.classList.add("d-none");
        el.activityLoading.classList.remove("d-none");
        el.activityLoading.textContent = "Generating maintenance activity report...";

        try {
            const response = await api(
                `/reports/maintenance-activity?${params.toString()}`
            );

            // v5 defines this as a report object, not a paginated list.
            // Tolerate either a direct object or a conventional {data: ...} wrapper.
            const report = response?.rows
                ? response
                : response?.data;

            if (!report || !Array.isArray(report.rows)) {
                throw new Error("Unexpected maintenance activity report response.");
            }

            renderActivity(report);
            el.activityLoading.classList.add("d-none");
        } catch (error) {
            console.error("Maintenance activity report failed:", error);
            el.activityLoading.classList.add("d-none");
            el.activityError.classList.remove("d-none");
            showAlert(
                error.message || "Could not load maintenance activity report."
            );
        } finally {
            setActivityLoading(false);
        }
    }

    function renderRecurring(response) {
        const rows = dataOf(response);
        const meta = response?.meta;

        if (!Array.isArray(rows) || !meta) {
            throw new Error("Unexpected recurring issues report response.");
        }

        state.recurringRows = rows;
        state.recurringLoaded = true;
        state.recurringTotal = Number(meta.total) || 0;
        state.recurringPage = Number(meta.current_page) || 1;
        state.recurringLastPage = Number(meta.last_page) || 1;

        el.recurringTotal.textContent = number(state.recurringTotal);

        const pageRequestCount = rows.reduce(
            (total, row) => total + (Number(row.request_count) || 0),
            0
        );
        el.recurringRequests.textContent = number(pageRequestCount);

        el.recurringBody.replaceChildren();

        rows.forEach(row => {
            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>${escapeHtml(row.location?.location_name || "—")}</td>
                <td>${escapeHtml(row.category?.category_name || "—")}</td>
                <td>
                    <span class="badge bg-warning text-dark">
                        ${number(row.request_count)}
                    </span>
                </td>
                <td>${escapeHtml(formatDate(row.last_submitted_at))}</td>
            `;

            el.recurringBody.appendChild(tr);
        });

        const hasRows = rows.length > 0;
        el.recurringContainer.classList.toggle("d-none", !hasRows);
        el.recurringEmpty.classList.toggle("d-none", hasRows);
        el.recurringExport.disabled = !hasRows;

        el.recurringPagination.textContent =
            `Page ${state.recurringPage} of ${state.recurringLastPage} · ` +
            `${state.recurringTotal} combinations`;

        el.recurringPrevious.disabled =
            state.recurringLoading || state.recurringPage <= 1;
        el.recurringNext.disabled =
            state.recurringLoading ||
            state.recurringPage >= state.recurringLastPage;
    }

    async function loadRecurringReport() {
        hideAlert();

        let params;
        try {
            params = getDateParams();
        } catch (error) {
            showAlert(error.message);
            return;
        }

        const minCount = Number(el.minCount.value);
        if (!Number.isInteger(minCount) || minCount < 2) {
            showAlert("Minimum request count must be a whole number of at least 2.");
            return;
        }

        params.set("min_count", String(minCount));
        params.set("page", String(state.recurringPage));
        params.set("per_page", String(PAGE_SIZE));

        setRecurringLoading(true);
        el.recurringError.classList.add("d-none");
        el.recurringEmpty.classList.add("d-none");
        el.recurringContainer.classList.add("d-none");
        el.recurringLoading.classList.remove("d-none");
        el.recurringLoading.textContent = "Generating recurring issues report...";

        try {
            const response = await api(
                `/reports/recurring-issues?${params.toString()}`
            );

            renderRecurring(response);
            el.recurringLoading.classList.add("d-none");
        } catch (error) {
            console.error("Recurring issues report failed:", error);
            el.recurringLoading.classList.add("d-none");
            el.recurringError.classList.remove("d-none");
            showAlert(
                error.message || "Could not load recurring issues report."
            );
        } finally {
            setRecurringLoading(false);
        }
    }

    function downloadCsv(filename, headers, rows) {
        if (!rows.length) {
            showAlert("There is no report data to export.", "warning");
            return;
        }

        const quote = value =>
            `"${String(value ?? "").replace(/"/g, '""')}"`;

        const csv = [
            headers.map(quote).join(","),
            ...rows.map(row => row.map(quote).join(","))
        ].join("\r\n");

        const blob = new Blob(["\uFEFF", csv], {
            type: "text/csv;charset=utf-8;"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function exportActivity() {
        downloadCsv(
            "jobtrack-maintenance-activity.csv",
            [
                "Group",
                "Requests",
                "Job Orders",
                "Completed",
                "Total Hours",
                "Average Resolution Hours"
            ],
            state.activityRows.map(row => [
                row.label,
                row.requests,
                row.job_orders,
                row.completed,
                row.total_hours ?? "",
                row.avg_resolution_hours ?? ""
            ])
        );
    }

    function exportRecurring() {
        downloadCsv(
            "jobtrack-recurring-issues-current-page.csv",
            [
                "Location",
                "Category",
                "Request Count",
                "Last Submitted"
            ],
            state.recurringRows.map(row => [
                row.location?.location_name || "",
                row.category?.category_name || "",
                row.request_count,
                row.last_submitted_at || ""
            ])
        );
    }

    async function logout() {
        el.logout.disabled = true;

        try {
            await api("/auth/logout", { method: "POST" });
        } catch (error) {
            console.error("Logout request failed:", error);
        } finally {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem("jobtrack_user");
            window.location.assign("../../index.html");
        }
    }

    el.filterForm.addEventListener("submit", event => {
        event.preventDefault();
        state.recurringPage = 1;

        if (state.activityLoaded) loadActivityReport();
        if (state.recurringLoaded) loadRecurringReport();
    });

    el.clearDates.addEventListener("click", () => {
        el.dateFrom.value = "";
        el.dateTo.value = "";
        state.recurringPage = 1;

        if (state.activityLoaded) loadActivityReport();
        if (state.recurringLoaded) loadRecurringReport();
    });

    el.activityForm.addEventListener("submit", event => {
        event.preventDefault();
        loadActivityReport();
    });

    el.recurringForm.addEventListener("submit", event => {
        event.preventDefault();
        state.recurringPage = 1;
        loadRecurringReport();
    });

    el.activityRetry.addEventListener("click", loadActivityReport);
    el.recurringRetry.addEventListener("click", loadRecurringReport);
    el.activityExport.addEventListener("click", exportActivity);
    el.recurringExport.addEventListener("click", exportRecurring);
    el.logout.addEventListener("click", logout);

    el.recurringPrevious.addEventListener("click", () => {
        if (state.recurringPage > 1 && !state.recurringLoading) {
            state.recurringPage--;
            loadRecurringReport();
        }
    });

    el.recurringNext.addEventListener("click", () => {
        if (
            state.recurringPage < state.recurringLastPage &&
            !state.recurringLoading
        ) {
            state.recurringPage++;
            loadRecurringReport();
        }
    });

    async function initialize() {
        if (!localStorage.getItem(TOKEN_KEY)) {
            window.location.assign("../../index.html");
            return;
        }

        try {
            await loadCurrentUser();
        } catch (error) {
            console.error("Report page initialization failed:", error);
            showAlert(error.message || "Unable to initialize reports.");
            return;
        }

        // Reports are generated on demand, avoiding unnecessary requests
        // until the user chooses a report.
    }

    initialize();
})();
