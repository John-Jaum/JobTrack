(() => {
    const requestReference = document.getElementById("requestReference");

    if (!requestReference) return;

    const params = new URLSearchParams(window.location.search);
    const requestId = params.get("requestId");

    const loading = document.getElementById("detailsLoading");
    const content = document.getElementById("requestDetailsContent");
    const errorElement = document.getElementById("detailsError");

    const reviewSection = document.getElementById("reviewSection");
    const reviewForm = document.getElementById("reviewForm");
    const decisionElement = document.getElementById("reviewDecision");
    const remarksElement = document.getElementById("reviewRemarks");
    const reviewError = document.getElementById("reviewError");
    const submitButton = document.getElementById("submitReviewButton");

    let currentRequest = null;

    function showError(message) {
        errorElement.textContent = message;
        errorElement.classList.remove("d-none");
    }

    function formatDate(dateString) {
        if (!dateString) return "—";

        return new Date(dateString).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    }

    function setStatus(status) {
        const classes = {
            "Pending": "text-bg-warning",
            "Approved": "text-bg-info",
            "Rejected": "text-bg-danger",
            "In Progress": "text-bg-primary",
            "On Hold": "text-bg-secondary",
            "Completed": "text-bg-success",
            "Closed": "text-bg-dark"
        };

        const badge = document.getElementById("requestStatus");
        badge.className = `badge ${classes[status] || "text-bg-secondary"}`;
        badge.textContent = status || "Unknown";
    }

    async function loadRequest() {
        if (!requestId || !/^\d+$/.test(requestId) || Number(requestId) < 1) {
            throw new Error("Invalid request ID. Return to Manage Requests and select a request.");
        }

        const response = await apiRequest(
            `/maintenance-requests/${encodeURIComponent(requestId)}`
        );

        const request = response?.data;

        if (!request) {
            throw new Error("The server did not return request details.");
        }

        currentRequest = request;

        requestReference.textContent =
            request.reference || `MR-${request.request_id}`;

        document.getElementById("requesterName").textContent =
            request.requester?.full_name || "—";

        document.getElementById("requestCategory").textContent =
            request.category_label || "—";

        document.getElementById("requestLocation").textContent =
            request.location_label || "—";

        document.getElementById("requestPriority").textContent =
            request.priority || "—";

        document.getElementById("requestDate").textContent =
            formatDate(request.submitted_at || request.created_at);

        document.getElementById("attachmentCount").textContent =
            Number(request.attachment_count || 0) === 1
                ? "1 attachment"
                : `${Number(request.attachment_count || 0)} attachments`;

        document.getElementById("requestDescription").textContent =
            request.description || "No description provided.";

        const status = request.status_label || "Unknown";
        setStatus(status);

        reviewSection.classList.toggle("d-none", status !== "Pending");
    }

    reviewForm.addEventListener("submit", async event => {
        event.preventDefault();

        reviewError.classList.add("d-none");

        const decision = decisionElement.value;
        const remarks = remarksElement.value.trim();

        if (!decision) {
            reviewError.textContent = "Please choose a decision.";
            reviewError.classList.remove("d-none");
            return;
        }

        if (decision === "reject" && !remarks) {
            reviewError.textContent = "Remarks are required when rejecting a request.";
            reviewError.classList.remove("d-none");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";

        try {
            const payload = { decision };

            if (remarks) {
                payload.remarks = remarks;
            }

            await apiRequest(
                `/maintenance-requests/${encodeURIComponent(requestId)}/review`,
                {
                    method: "POST",
                    body: payload
                }
            );

            alert(
                decision === "approve"
                    ? "Request approved. A Job Order has been created and the requester has been notified."
                    : "Request rejected. The requester has been notified."
            );

            await loadRequest();
            reviewSection.classList.add("d-none");

        } catch (error) {
            reviewError.textContent =
                error.message || "Unable to submit the review.";
            reviewError.classList.remove("d-none");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Submit Decision";
        }
    });

    async function initialize() {
        try {
            await loadRequest();
            content.classList.remove("d-none");
        } catch (error) {
            console.error("Facilities request details error:", error);
            showError(error.message || "Unable to load request details.");
        } finally {
            loading.classList.add("d-none");
        }
    }

    initialize();
})();