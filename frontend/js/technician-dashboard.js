
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const alertBox = document.getElementById("technicianDashboardAlert");
    const refreshButton = document.getElementById(
        "refreshTechnicianDashboardButton"
    );

    const elements = {
        technicianName: document.getElementById("technicianName"),
        assignedJobs: document.getElementById("assignedJobsCount"),
        awaitingAcceptance: document.getElementById("awaitingAcceptanceCount"),
        inProgress: document.getElementById("inProgressJobsCount"),
        completedThisMonth: document.getElementById(
            "completedThisMonthCount"
        ),
        unreadSidebar: document.getElementById(
            "technicianSidebarUnreadCount"
        ),
        unreadQuickAction: document.getElementById(
            "technicianQuickActionUnreadCount"
        ),
        jobsLoading: document.getElementById(
            "technicianRecentJobsLoading"
        ),
        jobsEmpty: document.getElementById("technicianRecentJobsEmpty"),
        jobsTableWrapper: document.getElementById(
            "technicianRecentJobsTableWrapper"
        ),
        jobsTableBody: document.getElementById(
            "technicianRecentJobsTableBody"
        )
    };

    function showAlert(message, type = "danger") {
        alertBox.textContent = message;
        alertBox.className = `alert alert-${type}`;
    }

    function hideAlert() {
        alertBox.textContent = "";
        alertBox.className = "alert d-none";
    }

    /*
     * The API helper should return parsed JSON.
     * Accept both { data: ... } and a direct object where appropriate.
     */
    async function getApiData(path) {
        if (typeof window.apiRequest !== "function") {
            throw new Error(
                "The shared API helper was not found. Check js/app.js."
            );
        }

        const response = await window.apiRequest(path);
        return response?.data ?? response;
    }

    function setCount(element, value) {
        element.textContent =
            Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "0";
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function createCell(text) {
        const cell = document.createElement("td");
        cell.textContent = text ?? "—";
        return cell;
    }

    function createStatusBadge(status) {
        const badge = document.createElement("span");
        const normalized = String(status || "").toLowerCase();

        const colorClasses = {
            approved: "bg-secondary",
            assigned: "bg-primary",
            "in progress": "bg-info text-dark",
            "on hold": "bg-warning text-dark",
            completed: "bg-success",
            closed: "bg-dark",
            pending: "bg-secondary"
        };

        badge.className = `badge ${colorClasses[normalized] || "bg-secondary"}`;
        badge.textContent = status || "Unknown";
        return badge;
    }

    function createPriorityBadge(priority) {
        const badge = document.createElement("span");
        const normalized = String(priority || "").toLowerCase();

        const colorClasses = {
            urgent: "bg-danger",
            high: "bg-warning text-dark",
            medium: "bg-info text-dark",
            low: "bg-secondary"
        };

        badge.className = `badge ${colorClasses[normalized] || "bg-secondary"}`;
        badge.textContent = priority || "—";
        return badge;
    }

    function updateUnreadCount(count) {
        const unreadCount = Math.max(0, Number(count) || 0);

        [
            elements.unreadSidebar,
            elements.unreadQuickAction
        ].forEach((element) => {
            element.textContent = String(unreadCount);
            element.classList.toggle("d-none", unreadCount === 0);
        });
    }

    async function loadCurrentUser() {
        const user = await getApiData("/auth/me");

        if (user?.role?.role_name &&
            user.role.role_name !== "Technician") {
            showAlert(
                "Your account does not have the Technician role. " +
                "Please sign in with a technician account."
            );
            return;
        }

        elements.technicianName.textContent =
            user?.full_name || "Technician";
    }

    async function loadDashboardSummary() {
        const summary = await getApiData("/dashboard/summary");
        const technician = summary?.technician;

        if (!technician) {
            throw new Error(
                "The API response did not include the technician dashboard summary."
            );
        }

        setCount(elements.assignedJobs, technician.assigned_jobs);
        setCount(elements.awaitingAcceptance, technician.awaiting_acceptance);
        setCount(elements.inProgress, technician.in_progress_jobs);
        setCount(elements.completedThisMonth, technician.completed_this_month);
    }

    async function loadUnreadNotifications() {
        const result = await getApiData(
            "/notifications?page=1&per_page=1"
        );

        updateUnreadCount(result?.meta?.unread_count ?? 0);
    }

    async function loadRecentJobOrders() {
        elements.jobsLoading.classList.remove("d-none");
        elements.jobsEmpty.classList.add("d-none");
        elements.jobsTableWrapper.classList.add("d-none");
        elements.jobsTableBody.replaceChildren();

        try {
            const result = await getApiData(
                "/job-orders?mine=true&sort=-created_at&page=1&per_page=5"
            );

            const jobs = Array.isArray(result?.data)
                ? result.data
                : Array.isArray(result)
                    ? result
                    : [];

            elements.jobsLoading.classList.add("d-none");

            if (jobs.length === 0) {
                elements.jobsEmpty.classList.remove("d-none");
                return;
            }

            jobs.forEach((job) => {
                const row = document.createElement("tr");

                row.appendChild(
                    createCell(job.request_reference || `JO-${job.job_order_id}`)
                );
                row.appendChild(createCell(job.category_label || "—"));

                const priorityCell = document.createElement("td");
                priorityCell.appendChild(createPriorityBadge(job.priority));
                row.appendChild(priorityCell);

                const statusCell = document.createElement("td");
                statusCell.appendChild(createStatusBadge(job.status_label));
                row.appendChild(statusCell);

                const technicians = Array.isArray(job.technicians)
                    ? job.technicians
                        .map((technician) => technician.full_name)
                        .filter(Boolean)
                        .join(", ")
                    : "";

                row.appendChild(createCell(technicians || "—"));
                row.appendChild(createCell(formatDate(job.created_at)));

                const actionCell = document.createElement("td");
                const link = document.createElement("a");

                link.className = "btn btn-sm btn-outline-primary";
                link.href =
                    `job-order-details.html?jobOrderId=${encodeURIComponent(
                        job.job_order_id
                    )}`;
                link.textContent = "View";

                actionCell.appendChild(link);
                row.appendChild(actionCell);

                elements.jobsTableBody.appendChild(row);
            });

            elements.jobsTableWrapper.classList.remove("d-none");
        } catch (error) {
            elements.jobsLoading.classList.add("d-none");
            throw error;
        }
    }

    async function loadDashboard() {
        hideAlert();
        refreshButton.disabled = true;
        refreshButton.textContent = "Refreshing...";

        const results = await Promise.allSettled([
            loadCurrentUser(),
            loadDashboardSummary(),
            loadRecentJobOrders(),
            loadUnreadNotifications()
        ]);

        const failedTasks = results.filter(
            (result) => result.status === "rejected"
        );

        if (failedTasks.length > 0) {
            console.error(
                "Technician dashboard loading errors:",
                failedTasks.map((result) => result.reason)
            );

            showAlert(
                "Some dashboard information could not be loaded. " +
                "Check the backend/API connection and try refreshing."
            );
        }

        refreshButton.disabled = false;
        refreshButton.textContent = "Refresh Dashboard";
    }

    refreshButton.addEventListener("click", loadDashboard);

    const logoutButton = document.getElementById("logoutButton");

    logoutButton.addEventListener("click", () => {
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

    loadDashboard();
});
