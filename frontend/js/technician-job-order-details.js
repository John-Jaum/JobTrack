
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);

    const jobOrderId = new URLSearchParams(window.location.search)
        .get("jobOrderId");

    const state = {
        user: null,
        job: null,
        assignments: [],
        myAssignment: null,
        busy: false
    };

    const loading = $("jobOrderDetailsLoading");
    const content = $("jobOrderDetailsContent");
    const errorPanel = $("jobOrderDetailsError");
    const errorMessage = $("jobOrderDetailsErrorMessage");
    const alertBox = $("jobOrderDetailsAlert");

    function showAlert(message, type = "danger") {
        alertBox.textContent = message;
        alertBox.className = `alert alert-${type}`;
    }

    function hideAlert() {
        alertBox.textContent = "";
        alertBox.className = "alert d-none";
    }

    function unwrapData(response) {
        return response &&
            Object.prototype.hasOwnProperty.call(response, "data")
            ? response.data
            : response;
    }

    async function apiRequest(path, options) {
        if (typeof window.apiRequest !== "function") {
            throw new Error(
                "Shared API helper not found. Check ../../js/app.js."
            );
        }

        return window.apiRequest(path, options);
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    function setText(id, value) {
        $(id).textContent =
            value === null || value === undefined || value === ""
                ? "—"
                : String(value);
    }

    function makeBadge(element, value, kind = "status") {
        const normalized = String(value || "").toLowerCase();

        const statusClasses = {
            pending: "bg-secondary",
            approved: "bg-secondary",
            assigned: "bg-primary",
            accepted: "bg-success",
            declined: "bg-danger",
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

        const classes = kind === "priority"
            ? priorityClasses
            : statusClasses;

        element.className =
            `badge ${classes[normalized] || "bg-secondary"}`;
        element.textContent = value || "Unknown";
    }

    function setBusy(busy) {
        state.busy = busy;

        [
            "acceptAssignmentButton",
            "declineAssignmentButton",
            "startJobButton",
            "putJobOnHoldButton",
            "resumeJobButton",
            "completeJobButton"
        ].forEach((id) => {
            $(id).disabled = busy;
        });
    }

    function showPageError(message) {
        loading.classList.add("d-none");
        content.classList.add("d-none");
        errorPanel.classList.remove("d-none");
        errorMessage.textContent = message;
    }

    function renderAssignments() {
        const tbody = $("detailAssignmentsTableBody");
        tbody.replaceChildren();

        state.assignments.forEach((assignment) => {
            const row = document.createElement("tr");
            const technician = assignment.technician || {};

            const nameCell = document.createElement("td");
            nameCell.textContent = technician.full_name || "Unknown technician";
            row.appendChild(nameCell);

            const roleCell = document.createElement("td");
            roleCell.textContent = assignment.assignment_role || "—";
            row.appendChild(roleCell);

            const statusCell = document.createElement("td");
            const statusBadge = document.createElement("span");
            makeBadge(
                statusBadge,
                assignment.assignment_status || "Unknown"
            );
            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);

            const assignedCell = document.createElement("td");
            assignedCell.textContent = formatDate(assignment.assigned_at);
            row.appendChild(assignedCell);

            tbody.appendChild(row);
        });

        if (state.assignments.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 4;
            cell.className = "text-center text-muted py-4";
            cell.textContent = "No assignment records were returned.";

            row.appendChild(cell);
            tbody.appendChild(row);
        }
    }

    function renderJobDetails() {
        const job = state.job;
        const assignment = state.myAssignment;

        setText(
            "detailJobOrderReference",
            job.request_reference || `JO-${job.job_order_id}`
        );
        setText("detailRequestReference", job.request_reference);
        setText("detailCategory", job.category_label);
        setText("detailLocation", job.location_label);
        setText("detailCreatedBy", job.created_by?.full_name);
        setText("detailCreatedAt", formatDate(job.created_at));
        setText("detailApprovedAt", formatDate(job.approved_at));
        setText("detailClosedAt", formatDate(job.closed_at));

        makeBadge($("detailJobOrderStatus"), job.status_label);
        makeBadge($("detailJobOrderPriority"), job.priority, "priority");

        setText(
            "detailMyAssignmentRole",
            assignment?.assignment_role
        );
        setText("detailMyAssignedAt", formatDate(assignment?.assigned_at));

        makeBadge(
            $("detailMyAssignmentStatus"),
            assignment?.assignment_status || "Not assigned"
        );

        setText("detailTotalHours", job.total_hours_spent ?? 0);

        const materialCost = Number(job.total_material_cost);
        setText(
            "detailTotalMaterialCost",
            Number.isFinite(materialCost)
                ? materialCost.toLocaleString(undefined, {
                    style: "currency",
                    currency: "PHP"
                })
                : "—"
        );

        renderAssignments();
        renderAvailableActions();
    }

    function renderAvailableActions() {
        const assignment = state.myAssignment;
        const jobStatus = state.job.status_label;
        const isLead = assignment?.assignment_role === "Lead";
        const assignmentStatus = assignment?.assignment_status;

        const actionsCard = $("jobOrderActionsCard");
        const assignmentActions = $("assignmentActions");
        const transitionActions = $("transitionActions");
        const remarksSection = $("transitionRemarksSection");
        const guidance = $("jobOrderActionGuidance");

        actionsCard.classList.remove("d-none");
        assignmentActions.classList.add("d-none");
        transitionActions.classList.add("d-none");
        remarksSection.classList.add("d-none");

        [
            "startJobButton",
            "putJobOnHoldButton",
            "resumeJobButton",
            "completeJobButton"
        ].forEach((id) => $(id).classList.add("d-none"));

        if (!assignment) {
            guidance.textContent =
                "No assignment for your account was found. You can view " +
                "the job details, but technician actions are unavailable.";
            return;
        }

        if (assignmentStatus === "Assigned") {
            assignmentActions.classList.remove("d-none");
            $("acceptAssignmentButton").classList.remove("d-none");
            $("declineAssignmentButton").classList.remove("d-none");

            guidance.textContent =
                "Please accept or decline your assignment. Job progress " +
                "actions are available only after acceptance and according " +
                "to your assignment role.";

            return;
        }

        if (assignmentStatus === "Declined") {
            guidance.textContent =
                "You declined this assignment. Contact the Facilities Officer " +
                "if it needs to be reassigned.";
            return;
        }

        if (assignmentStatus === "Completed") {
            guidance.textContent =
                "Your assignment is marked completed. No further technician " +
                "actions are available.";
            return;
        }

        if (assignmentStatus !== "Accepted") {
            guidance.textContent =
                "Your assignment is not currently in a state that allows actions.";
            return;
        }

        if (!isLead) {
            guidance.textContent =
                "Your assignment is accepted as a Support technician. " +
                "Only the Lead technician may change the job-order status. " +
                "You can record your work using the work-record feature when available.";
            return;
        }

        if (jobStatus === "Assigned") {
            $("startJobButton").classList.remove("d-none");
        } else if (jobStatus === "In Progress") {
            $("putJobOnHoldButton").classList.remove("d-none");
            $("completeJobButton").classList.remove("d-none");
        } else if (jobStatus === "On Hold") {
            $("resumeJobButton").classList.remove("d-none");
        }

        const hasTransition =
            ["Assigned", "In Progress", "On Hold"].includes(jobStatus);

        if (hasTransition) {
            transitionActions.classList.remove("d-none");
            remarksSection.classList.remove("d-none");
            guidance.textContent =
                "As the Lead technician, you can perform the status " +
                "transitions permitted for the current job state.";
        } else {
            guidance.textContent =
                "No job-order status transitions are available for the " +
                "current status.";
        }
    }

    async function loadUser() {
        const response = await apiRequest("/auth/me");
        state.user = unwrapData(response);

        if (!state.user?.user_id) {
            throw new Error(
                "The signed-in user's ID was not returned by the API."
            );
        }

        $("technicianName").textContent =
            state.user.full_name || "Technician";
    }

    async function loadJobOrder() {
        const response = await apiRequest(`/job-orders/${jobOrderId}`);
        state.job = unwrapData(response);

        if (!state.job?.job_order_id) {
            throw new Error("The API did not return a valid job order.");
        }

        const assignmentResponse = await apiRequest(
            `/job-orders/${jobOrderId}/assignments?page=1&per_page=100`
        );

        const assignmentPayload = unwrapData(assignmentResponse);

        state.assignments = Array.isArray(assignmentPayload)
            ? assignmentPayload
            : [];

        state.myAssignment = state.assignments.find(
            (item) => Number(item.technician?.user_id) ===
                Number(state.user.user_id)
        ) || null;

        renderJobDetails();
    }

    async function loadPage() {
        hideAlert();
        loading.classList.remove("d-none");
        errorPanel.classList.add("d-none");
        content.classList.add("d-none");

        try {
            await loadUser();
            await loadJobOrder();

            loading.classList.add("d-none");
            content.classList.remove("d-none");
        } catch (error) {
            console.error("Unable to load job-order details:", error);

            showPageError(
                error.message ||
                "The job order could not be loaded. Check the API connection."
            );
        }
    }

    async function updateAssignment(assignmentStatus) {
        if (state.busy || !state.myAssignment) return;

        const currentStatus = state.myAssignment.assignment_status;

        const allowed =
            (currentStatus === "Assigned" &&
                ["Accepted", "Declined"].includes(assignmentStatus)) ||
            (currentStatus === "Accepted" &&
                assignmentStatus === "Completed");

        if (!allowed) {
            showAlert(
                `The assignment cannot be changed from ${currentStatus} ` +
                `to ${assignmentStatus}.`,
                "warning"
            );
            return;
        }

        if (assignmentStatus === "Declined" &&
            !window.confirm("Are you sure you want to decline this assignment?")) {
            return;
        }

        setBusy(true);
        hideAlert();

        try {
            await apiRequest(
                `/job-orders/${jobOrderId}/assignments/${state.user.user_id}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        assignment_status: assignmentStatus
                    })
                }
            );

            showAlert(
                `Assignment updated to ${assignmentStatus}.`,
                "success"
            );

            await loadJobOrder();
        } catch (error) {
            console.error("Assignment update failed:", error);
            showAlert(
                error.message ||
                "Unable to update the assignment. The backend may reject " +
                "the action if the assignment state has changed."
            );
        } finally {
            setBusy(false);
        }
    }

    async function transitionJobOrder(targetStatus) {
        if (state.busy || !state.myAssignment) return;

        if (state.myAssignment.assignment_role !== "Lead") {
            showAlert(
                "Only the Lead technician may change job-order status.",
                "warning"
            );
            return;
        }

        const currentStatus = state.job.status_label;

        const allowedTransitions = {
            Assigned: ["In Progress"],
            "In Progress": ["On Hold", "Completed"],
            "On Hold": ["In Progress"]
        };

        if (!(allowedTransitions[currentStatus] || []).includes(targetStatus)) {
            showAlert(
                `The transition from ${currentStatus} to ${targetStatus} ` +
                "is not allowed.",
                "warning"
            );
            return;
        }

        const confirmationMessages = {
            "In Progress": "Start or resume work on this job?",
            "On Hold": "Put this job on hold?",
            Completed: "Mark this job as completed?"
        };

        if (!window.confirm(confirmationMessages[targetStatus])) {
            return;
        }

        setBusy(true);
        hideAlert();

        try {
            const body = {
                status_label: targetStatus
            };

            const remarks = $("transitionRemarks").value.trim();

            if (remarks) {
                body.remarks = remarks;
            }

            await apiRequest(
                `/job-orders/${jobOrderId}/transitions`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                }
            );

            $("transitionRemarks").value = "";

            showAlert(
                `Job order status updated to ${targetStatus}.`,
                "success"
            );

            await loadJobOrder();
        } catch (error) {
            console.error("Job-order transition failed:", error);
            showAlert(
                error.message ||
                "Unable to update the job order. The API may have rejected " +
                "the transition because of its current status or permissions."
            );
        } finally {
            setBusy(false);
        }
    }

    $("acceptAssignmentButton").addEventListener(
        "click",
        () => updateAssignment("Accepted")
    );

    $("declineAssignmentButton").addEventListener(
        "click",
        () => updateAssignment("Declined")
    );

    $("startJobButton").addEventListener(
        "click",
        () => transitionJobOrder("In Progress")
    );

    $("putJobOnHoldButton").addEventListener(
        "click",
        () => transitionJobOrder("On Hold")
    );

    $("resumeJobButton").addEventListener(
        "click",
        () => transitionJobOrder("In Progress")
    );

    $("completeJobButton").addEventListener(
        "click",
        () => transitionJobOrder("Completed")
    );

    $("retryJobOrderDetailsButton").addEventListener("click", loadPage);

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

    if (!jobOrderId || !/^\d+$/.test(jobOrderId)) {
        showPageError(
            "A valid job order ID is required. Open this page from My Job Orders."
        );
        return;
    }

    loadPage();
});
