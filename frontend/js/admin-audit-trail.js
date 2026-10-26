
(() => {
    "use strict";

    const TOKEN_KEY = "jobtrack_token";
    const USER_KEY = "jobtrack_user";
    const PER_PAGE = 10;

    const form = document.getElementById("auditSearchForm");
    const jobOrderIdInput = document.getElementById("jobOrderId");
    const searchBtn = document.getElementById("searchBtn");
    const exportBtn = document.getElementById("exportBtn");
    const tableBody = document.getElementById("auditTableBody");
    const messageBox = document.getElementById("auditMessage");
    const summary = document.getElementById("auditSummary");
    const pageInfo = document.getElementById("pageInfo");
    const previousBtn = document.getElementById("previousPageBtn");
    const nextBtn = document.getElementById("nextPageBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    let currentJobOrderId = null;
    let currentPage = 1;
    let lastPage = 1;
    let currentEntries = [];
    let searchSequence = 0;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function showMessage(message, type = "info") {
        messageBox.innerHTML = `
            <div class="alert alert-${type}" role="alert">
                ${escapeHtml(message)}
            </div>
        `;
    }

    function clearMessage() {
        messageBox.innerHTML = "";
    }

    function renderEmpty(message) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    ${escapeHtml(message)}
                </td>
            </tr>
        `;
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleString();
    }

    function renderEntries(entries) {
        if (!entries.length) {
            renderEmpty("No history entries were returned for this page.");
            return;
        }

        tableBody.innerHTML = entries.map(entry => {
            const fromStatus = entry.from_status_label ?? "—";
            const toStatus = entry.to_status_label ?? "—";
            const changedBy = entry.changed_by?.full_name ?? "Unknown";
            const remarks = entry.remarks ?? "—";

            return `
                <tr>
                    <td>${escapeHtml(formatDate(entry.changed_at))}</td>
                    <td>
                        <span class="badge text-bg-secondary">
                            ${escapeHtml(entry.event ?? "Unknown")}
                        </span>
                    </td>
                    <td>${escapeHtml(fromStatus)}</td>
                    <td>${escapeHtml(toStatus)}</td>
                    <td>
                        ${escapeHtml(changedBy)}
                        ${
                            entry.changed_by?.user_id
                                ? `<div class="small text-muted">
                                     User ID: ${escapeHtml(entry.changed_by.user_id)}
                                   </div>`
                                : ""
                        }
                    </td>
                    <td>${escapeHtml(remarks)}</td>
                </tr>
            `;
        }).join("");
    }

    function updatePagination(meta = {}) {
        const page = Number(meta.current_page ?? currentPage);
        const perPage = Number(meta.per_page ?? PER_PAGE);
        const total = Number(meta.total ?? currentEntries.length);

        lastPage = Math.max(
            1,
            Number(meta.last_page ?? Math.ceil(total / perPage))
        );

        currentPage = page;

        pageInfo.textContent = `Page ${currentPage} of ${lastPage}`;
        previousBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= lastPage;

        summary.textContent =
            `Job Order #${currentJobOrderId} · ${total} recorded event(s)`;
    }

    async function loadHistory(jobOrderId, page = 1) {
        if (typeof window.apiRequest !== "function") {
            showMessage(
                "The API helper window.apiRequest was not found. Check app.js before testing this page.",
                "danger"
            );
            return;
        }

        const requestSequence = ++searchSequence;

        currentJobOrderId = jobOrderId;
        currentPage = page;

        searchBtn.disabled = true;
        previousBtn.disabled = true;
        nextBtn.disabled = true;
        exportBtn.disabled = true;

        renderEmpty("Loading audit history…");
        clearMessage();

        try {
            const query = new URLSearchParams({
                page: String(page),
                per_page: String(PER_PAGE)
            });

            const response = await window.apiRequest(
                `/job-orders/${encodeURIComponent(jobOrderId)}/history?${query.toString()}`,
                { method: "GET" }
            );

            // Ignore a stale response if the user has submitted another search.
            if (requestSequence !== searchSequence) return;

            const entries = Array.isArray(response?.data)
                ? response.data
                : [];

            const meta = response?.meta ?? {};

            currentEntries = entries;
            renderEntries(entries);
            updatePagination(meta);

            exportBtn.disabled = entries.length === 0;
        } catch (error) {
            if (requestSequence !== searchSequence) return;

            currentEntries = [];
            lastPage = 1;
            renderEmpty("Unable to load audit history.");
            summary.textContent = `Job Order #${jobOrderId}`;
            pageInfo.textContent = "Page 0 of 0";

            showMessage(
                error?.message ||
                "The request failed. Check your login, API connection, and backend response.",
                "danger"
            );
        } finally {
            if (requestSequence === searchSequence) {
                searchBtn.disabled = false;
            }
        }
    }

    form.addEventListener("submit", event => {
        event.preventDefault();

        const rawId = jobOrderIdInput.value.trim();
        const jobOrderId = Number(rawId);

        if (!rawId || !Number.isInteger(jobOrderId) || jobOrderId < 1) {
            showMessage("Enter a valid positive Job Order ID.", "warning");
            return;
        }

        loadHistory(jobOrderId, 1);
    });

    previousBtn.addEventListener("click", () => {
        if (currentJobOrderId && currentPage > 1) {
            loadHistory(currentJobOrderId, currentPage - 1);
        }
    });

    nextBtn.addEventListener("click", () => {
        if (currentJobOrderId && currentPage < lastPage) {
            loadHistory(currentJobOrderId, currentPage + 1);
        }
    });

    function csvCell(value) {
        const text = String(value ?? "");
        return `"${text.replace(/"/g, '""')}"`;
    }

    exportBtn.addEventListener("click", () => {
        if (!currentEntries.length) return;

        const headers = [
            "History ID",
            "Job Order ID",
            "Date & Time",
            "Event",
            "Previous Status",
            "New Status",
            "Changed By",
            "User ID",
            "Remarks"
        ];

        const rows = currentEntries.map(entry => [
            entry.history_id,
            entry.job_order_id,
            entry.changed_at,
            entry.event,
            entry.from_status_label ?? "",
            entry.to_status_label,
            entry.changed_by?.full_name ?? "",
            entry.changed_by?.user_id ?? "",
            entry.remarks ?? ""
        ]);

        const csv = [headers, ...rows]
            .map(row => row.map(csvCell).join(","))
            .join("\r\n");

        const blob = new Blob(["\uFEFF" + csv], {
            type: "text/csv;charset=utf-8;"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `jobtrack-audit-job-${currentJobOrderId}-page-${currentPage}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    });

    logoutBtn.addEventListener("click", async () => {
        try {
            if (typeof window.apiRequest === "function") {
                await window.apiRequest("/auth/logout", {
                    method: "POST"
                });
            }
        } catch (error) {
            // Clear the local session even if the server logout request fails.
            console.error("Logout request failed:", error);
        } finally {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            window.location.assign("../../index.html");
        }
    });

    // Use the same session keys as the other JobTrack pages.
    if (!localStorage.getItem(TOKEN_KEY)) {
        window.location.assign("../../index.html");
    }
})();
