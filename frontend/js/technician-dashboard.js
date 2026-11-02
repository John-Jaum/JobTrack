
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
        jobsEmpty: document.getElementById(
            "technicianRecentJobsEmpty"
        ),
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

    async function getApiData(path) {
        if (typeof window.apiRequest !== "function") {
            throw new Error(
                "Shared API helper not found. Check js/app.js."
            );
        }

        // Return the complete response, including pagination metadata.
        return await window.apiRequest(path);
    }

    function setCount(element, value) {
        if (!element) return;

        const number = Number(value);
        element.textContent = Number.isFinite(number)
            ? number.toLocaleString()
            : "0";
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

    function createCell(value) {
        const cell = document.createElement("td");
        cell.textContent = value ?? "—";
        return cell;
    }

    function createBadge(value, classes) {
        const badge = document.createElement("span");
        const normalized = String(value || "").toLowerCase();

        badge.className =
            `badge ${classes[normalized] || "bg-secondary"}`;

        badge.textContent = value || "Unknown";

        return badge;
    }

    function createStatusBadge(status) {
        return createBadge(status, {
            approved: "bg-secondary",
            assigned: "bg-primary",
            "in progress": "bg-info text-dark",
            "on hold": "bg-warning text-dark",
            completed: "bg-success",
            closed: "bg-dark",
            pending: "bg-secondary"
        });
    }

    function createPriorityBadge(priority) {
        return createBadge(priority, {
            urgent: "bg-danger",
            high: "bg-warning text-dark",
            medium: "bg-info text-dark",
            low: "bg-secondary"
        });
    }

    function updateUnreadCount(count) {
        const unreadCount = Math.max(0, Number(count) || 0);

        [
            elements.unreadSidebar,
            elements.unreadQuickAction
        ].forEach(element => {
            if (!element) return;

            element.textContent = String(unreadCount);
            element.classList.toggle("d-none", unreadCount === 0);
        });
    }

    async function loadCurrentUser() {
        const response = await getApiData("/auth/me");
        const user = response?.data ?? response;

        const roleName =
            user?.role?.role_name ??
            user?.role_name ??
            user?.role;

        if (
            roleName &&
            String(roleName).toLowerCase() !== "technician"
        ) {
            throw new Error(
                "This account does not have the Technician role."
            );
        }

        elements.technicianName.textContent =
            user?.full_name || "Technician";
    }

    async function loadDashboardSummary() {
        const response = await getApiData("/dashboard/summary");
        const technician = response?.data?.technician;

        if (!technician) {
            throw new Error(
                "The API did not return the Technician dashboard summary."
            );
        }

        setCount(
            elements.assignedJobs,
            technician.assigned_jobs
        );

        setCount(
            elements.awaitingAcceptance,
            technician.awaiting_acceptance
        );

        setCount(
            elements.inProgress,
            technician.in_progress_jobs
        );

        setCount(
            elements.completedThisMonth,
            technician.completed_this_month
        );
    }

    async function loadUnreadNotifications() {
        const response = await getApiData(
            "/notifications?page=1&per_page=1"
        );

        updateUnreadCount(
            response?.meta?.unread_count ?? 0
        );
    }

    async function loadRecentJobOrders() {
        elements.jobsLoading.classList.remove("d-none");
        elements.jobsEmpty.classList.add("d-none");
        elements.jobsTableWrapper.classList.add("d-none");
        elements.jobsTableBody.replaceChildren();

        try {
            const response = await getApiData(
                "/job-orders?mine=true&sort=-created_at&page=1&per_page=5"
            );

            const jobs = Array.isArray(response?.data)
                ? response.data
                : [];

            elements.jobsLoading.classList.add("d-none");

            if (jobs.length === 0) {
                elements.jobsEmpty.classList.remove("d-none");
                return;
            }

            jobs.forEach(job => {
                const row = document.createElement("tr");

                row.appendChild(
                    createCell(
                        job.request_reference ||
                        `JO-${job.job_order_id}`
                    )
                );

                row.appendChild(
                    createCell(job.category_label)
                );

                const priorityCell = document.createElement("td");
                priorityCell.appendChild(
                    createPriorityBadge(job.priority)
                );
                row.appendChild(priorityCell);

                const statusCell = document.createElement("td");
                statusCell.appendChild(
                    createStatusBadge(job.status_label)
                );
                row.appendChild(statusCell);

                const technicians = Array.isArray(job.technicians)
                    ? job.technicians
                        .map(technician => technician.full_name)
                        .filter(Boolean)
                        .join(", ")
                    : "";

                row.appendChild(
                    createCell(technicians || "—")
                );

                row.appendChild(
                    createCell(job.created_at
                        ? formatDate(job.created_at)
                        : "—")
                );

                const actionCell = document.createElement("td");
                const link = document.createElement("a");

                link.className =
                    "btn btn-sm btn-outline-primary";

                link.href =
                    `job-order-details.html?jobOrderId=${
                        encodeURIComponent(job.job_order_id)
                    }`;

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

        const tasks = [
            {
                name: "Profile",
                run: loadCurrentUser
            },
            {
                name: "Dashboard summary",
                run: loadDashboardSummary
            },
            {
                name: "Recent job orders",
                run: loadRecentJobOrders
            },
            {
                name: "Notifications",
                run: loadUnreadNotifications
            }
        ];

        const results = await Promise.allSettled(
            tasks.map(task => task.run())
        );

        const failures = results
            .map((result, index) => ({
                result,
                name: tasks[index].name
            }))
            .filter(item => item.result.status === "rejected");

        if (failures.length > 0) {
            failures.forEach(item => {
                console.error(
                    `${item.name} failed:`,
                    item.result.reason
                );
            });

            showAlert(
                `Unable to load: ${
                    failures.map(item => item.name).join(", ")
                }. Check your API connection and try refreshing.`
            );
        }

        refreshButton.disabled = false;
        refreshButton.textContent = "Refresh Dashboard";
    }

    refreshButton.addEventListener("click", loadDashboard);

    // The shared app.js handles links with id="logoutLink".
    loadDashboard();
});
