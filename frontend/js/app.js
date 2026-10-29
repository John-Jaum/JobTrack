console.log("JobTrack frontend loaded successfully.");


            /* NEW CODE */

/* =================================
   JobTrack API Configuration
================================= */

const API_BASE_URL = "https://jobtrack-fk7m.onrender.com/api/v1";

// Must match the key used by your login JavaScript.
const AUTH_TOKEN_KEY = "jobtrack_token";

function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();

    if (!token) {
        throw new Error("Please log in to view your dashboard.");
    }

    const response = await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
            ...options,
            headers: {
                Accept: "application/json",
                // Let the browser set the multipart boundary for FormData.
                ...(options.body && !(options.body instanceof FormData)
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...options.headers,
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (response.status === 401) {
        throw new Error(
            "Your session has expired. Please log in again."
        );
    }

    if (response.status === 403) {
        throw new Error(
            "You are not authorized to access this page."
        );
    }

    if (!response.ok) {
        let errorPayload = null;
        try {
            errorPayload = await response.json();
        } catch {
            // Some server errors may not include a JSON response body.
        }

        const validationMessage = errorPayload?.errors
            ? Object.values(errorPayload.errors).flat().filter(Boolean).join(" ")
            : "";

        throw new Error(
            validationMessage ||
            errorPayload?.message ||
            `API request failed (HTTP ${response.status}).`
        );
    }


    return response.status === 204
        ? null
        : response.json();
}

            /* END OF NEW CODE */


























/* =================================
   Mock Request Storage
================================= */
const REQUESTS_STORAGE_KEY = "jobtrack_requests";
/*Get requests saved in the browser.*/
function getRequests() {
    const storedRequests =
        localStorage.getItem(REQUESTS_STORAGE_KEY);
    if (!storedRequests) {
        return [];
    }
    return JSON.parse(storedRequests);
}

/*Save requests to the browser.*/
function saveRequests(requests) {
    localStorage.setItem(
        REQUESTS_STORAGE_KEY,
        JSON.stringify(requests)
    );
}


































            /* NEW CODE */


/* =================================
   Create Maintenance Request - API
================================= */

function showFormMessage(element, message, isVisible = true) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("d-none", !isVisible);
}

async function loadRequestFormLookups() {
    const categoryElement = document.getElementById("category");
    const locationElement = document.getElementById("location");
    if (!categoryElement || !locationElement) return;

    const loadingMessage = document.getElementById("lookupLoadingMessage");
    const formErrorMessage = document.getElementById("formErrorMessage");

    try {
        const [categoryResponse, locationResponse] = await Promise.all([
            apiRequest("/categories"),
            apiRequest("/locations")
        ]);

        const categories = categoryResponse?.data;
        const locations = locationResponse?.data;

        if (!Array.isArray(categories) || !Array.isArray(locations)) {
            throw new Error("The API returned an unexpected category or location list.");
        }

        categoryElement.replaceChildren(new Option("Select category", ""));
        categories.forEach(category => {
            if (!Number.isInteger(Number(category.category_id)) || !category.category_name) return;
            categoryElement.add(new Option(category.category_name, String(category.category_id)));
        });

        locationElement.replaceChildren(new Option("Select location", ""));
        locations.forEach(location => {
            if (!Number.isInteger(Number(location.location_id)) || !location.building_name) return;
            const labelParts = [location.building_name];
            if (location.floor) labelParts.push(`Floor ${location.floor}`);
            if (location.room_number) labelParts.push(`Room ${location.room_number}`);
            if (location.description) labelParts.push(location.description);
            locationElement.add(new Option(labelParts.join(" · "), String(location.location_id)));
        });

        if (categories.length === 0 || locations.length === 0) {
            throw new Error("No categories or locations are available. Please contact the administrator.");
        }

        categoryElement.disabled = false;
        locationElement.disabled = false;
        showFormMessage(loadingMessage, "", false);
        categoryElement.dataset.loaded = "true";
        locationElement.dataset.loaded = "true";
    } catch (error) {
        console.error("Unable to load request form options:", error);
        showFormMessage(loadingMessage, "", false);
        showFormMessage(
            formErrorMessage,
            `${error.message || "Unable to load categories and locations."} Refresh the page or try again later.`
        );
        categoryElement.disabled = true;
        locationElement.disabled = true;
    }
}

function setupMaintenanceRequestForm() {
    const form = document.getElementById("maintenanceRequestForm");
    if (!form) return;

    const categoryElement = document.getElementById("category");
    const locationElement = document.getElementById("location");
    const priorityElement = document.getElementById("priority");
    const descriptionElement = document.getElementById("description");
    const attachmentInput = document.getElementById("attachments");
    const errorElement = document.getElementById("formErrorMessage");
    const successElement = document.getElementById("formSuccessMessage");
    const submitButton = form.querySelector('button[type="submit"]');

    loadRequestFormLookups();

    form.addEventListener("submit", async event => {
        event.preventDefault();

        [categoryElement, locationElement, priorityElement, descriptionElement]
            .filter(Boolean)
            .forEach(element => element.classList.remove("is-invalid"));
        showFormMessage(errorElement, "", false);
        showFormMessage(successElement, "", false);

        const description = descriptionElement?.value.trim() ?? "";
        let valid = true;

        if (!categoryElement?.value) {
            categoryElement?.classList.add("is-invalid");
            valid = false;
        }
        if (!locationElement?.value) {
            locationElement?.classList.add("is-invalid");
            valid = false;
        }
        if (!["Low", "Medium", "High", "Urgent"].includes(priorityElement?.value)) {
            priorityElement?.classList.add("is-invalid");
            valid = false;
        }
        if (description.length < 10 || description.length > 5000) {
            descriptionElement?.classList.add("is-invalid");
            valid = false;
        }

        const files = Array.from(attachmentInput?.files ?? []);
        const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
        const maxFileSize = 5 * 1024 * 1024;

        if (files.length > 5) {
            showFormMessage(errorElement, "You can attach no more than 5 files.");
            return;
        }

        const invalidFile = files.find(file =>
            !allowedTypes.has(file.type) || file.size > maxFileSize
        );
        if (invalidFile) {
            showFormMessage(
                errorElement,
                `${invalidFile.name}: choose a JPEG, PNG, WebP, or PDF file no larger than 5 MB.`
            );
            return;
        }

        if (!valid) {
            showFormMessage(
                errorElement,
                "Please select a category, location, and priority, and enter a description between 10 and 5,000 characters."
            );
            return;
        }

        if (categoryElement?.dataset.loaded !== "true" || locationElement?.dataset.loaded !== "true") {
            showFormMessage(errorElement, "Category and location options have not loaded. Please refresh and try again.");
            return;
        }

        const formData = new FormData();
        formData.append("location_id", locationElement.value);
        formData.append("category_id", categoryElement.value);
        formData.append("description", description);
        formData.append("priority", priorityElement.value);
        files.forEach(file => formData.append("files[]", file));

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.dataset.originalText = submitButton.textContent;
            submitButton.textContent = "Submitting...";
        }

        try {
            const response = await apiRequest("/maintenance-requests", {
                method: "POST",
                body: formData
            });

            const createdRequest = response?.data;
            if (!createdRequest) {
                throw new Error("The server did not return the created maintenance request.");
            }

            showFormMessage(
                successElement,
                `Maintenance request ${createdRequest.reference || ""} submitted successfully.`
            );

            const query = new URLSearchParams({ submitted: "1" });
            if (createdRequest.request_id) query.set("request_id", String(createdRequest.request_id));
            if (createdRequest.reference) query.set("reference", createdRequest.reference);
            window.location.href = `my-requests.html?${query.toString()}`;
        } catch (error) {
            console.error("Maintenance request submission failed:", error);
            showFormMessage(errorElement, error.message || "Unable to submit your request. Please try again.");
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = submitButton.dataset.originalText || "Submit Request";
            }
        }
    });
}

            /* END OF NEW CODE */

























/* =================================
   My Requests Page
================================= */
function setupMyRequestsPage() {
    const tableBody =
        document.getElementById("requestsTableBody");
    // Stop if this isn't the My Requests page.
    if (!tableBody) {
        return;
    }
    const requests = getRequests();

    /* -----------------------------
        Request Count
    ----------------------------- */
    const requestCount =
        document.getElementById("requestCount");

    if (requestCount) {
        requestCount.textContent =
            requests.length +
            (requests.length === 1 ? " request" : " requests");
    }

    /* -----------------------------
       Empty State
    ----------------------------- */
    if (requests.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    You have not submitted any maintenance requests yet.
                </td>
            </tr>
        `;
        return;
    }

    /* -----------------------------
       Display Requests
    ----------------------------- */
    tableBody.innerHTML = "";
    requests.forEach(request => {
        const row =
            document.createElement("tr");
        row.innerHTML = `
            <td>
                <a
                    href="request-details.html?id=${request.id}"
                    class="text-decoration-none fw-semibold"
                    >
                    ${request.id}
                </a>
            </td>
            <td>
                ${request.category}
            </td>
            <td>
                ${request.location}
            </td>
            <td>
                ${request.priority}
            </td>
            <td>
                ${getStatusBadge(request.status)}
            </td>
            <td>
                ${formatDate(request.submittedDate)}
            </td>
        `;
        tableBody.appendChild(row);
    });
}


/* =================================
   Status Badge
================================= */
function getStatusBadge(status) {
    const statusClasses = {
        "Pending": "text-bg-warning",
        "In Progress": "text-bg-primary",
        "Completed": "text-bg-success",
        "On Hold": "text-bg-secondary",
        "Closed": "text-bg-dark",
        "Rejected": "text-bg-danger"
    };

    const badgeClass =
        statusClasses[status] || "text-bg-secondary";
    return `
        <span class="badge ${badgeClass}">
            ${status}
        </span>
    `;
}

/* =================================
   Format Date
================================= */
function formatDate(dateString) {
    const date =
        new Date(dateString + "T00:00:00");
    return date.toLocaleDateString(
        "en-US",
        {
            month: "short",
            day: "numeric",
            year: "numeric"
        }
    );
}





















            /* NEW CODE */

/* =================================
   Request Details Page - Live API
================================= */

async function setupRequestDetailsPage() {
    const requestIdElement =
        document.getElementById("requestId");

    // Stop if this isn't the Request Details page.
    if (!requestIdElement) return;

    const statusElement =
        document.getElementById("requestStatus");

    const categoryElement =
        document.getElementById("requestCategory");

    const locationElement =
        document.getElementById("requestLocation");

    const priorityElement =
        document.getElementById("requestPriority");

    const dateElement =
        document.getElementById("requestDate");

    const descriptionElement =
        document.getElementById("requestDescription");

    const attachmentsElement =
        document.getElementById("requestAttachments");

    const urlParams =
        new URLSearchParams(window.location.search);

    const requestId = urlParams.get("id");

    if (!requestId || !/^\d+$/.test(requestId) ||
        Number(requestId) < 1) {
        showRequestDetailsError(
            "Invalid request ID. Please return to My Requests."
        );
        return;
    }

    try {
        const response = await apiRequest(
            `/maintenance-requests/${encodeURIComponent(requestId)}`
        );

        const request = response.data;

        if (!request) {
            throw new Error("The API returned no request details.");
        }

        requestIdElement.textContent =
            request.reference ?? `MR-${request.request_id}`;

        categoryElement.textContent =
            request.category_label ?? "—";

        locationElement.textContent =
            request.location_label ?? "—";

        priorityElement.textContent =
            request.priority ?? "—";

        dateElement.textContent =
            request.submitted_at
                ? new Date(request.submitted_at).toLocaleDateString(
                    "en-US",
                    {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                    }
                )
                : "—";

        descriptionElement.textContent =
            request.description ?? "—";

        const statusName =
            request.status_label ?? "Unknown";

        const statusClasses = {
            "Pending": "text-bg-warning",
            "Approved": "text-bg-info",
            "Rejected": "text-bg-danger",
            "In Progress": "text-bg-primary",
            "On Hold": "text-bg-secondary",
            "Completed": "text-bg-success",
            "Closed": "text-bg-dark"
        };

        statusElement.replaceChildren();

        const badge = document.createElement("span");
        badge.className =
            `badge ${statusClasses[statusName] ?? "text-bg-secondary"}`;
        badge.textContent = statusName;
        statusElement.appendChild(badge);

        renderRequestAttachments(
            request.attachments ?? [],
            attachmentsElement
        );

    } catch (error) {
        console.error("Request details API error:", error);

        showRequestDetailsError(
            error.message || "Unable to load this maintenance request."
        );
    }
}

function renderRequestAttachments(attachments, container) {
    if (!container) return;

    container.replaceChildren();

    if (!attachments.length) {
        const message = document.createElement("p");
        message.className = "text-muted mb-0";
        message.textContent = "No attachments.";
        container.appendChild(message);
        return;
    }

    const list = document.createElement("ul");
    list.className = "mb-0";

    attachments.forEach(attachment => {
        const item = document.createElement("li");
        const link = document.createElement("a");

        link.href = attachment.url;
        link.textContent =
            attachment.file_name || "View attachment";
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        item.appendChild(link);
        list.appendChild(item);
    });

    container.appendChild(list);
}

function showRequestDetailsError(message) {
    const requestIdElement =
        document.getElementById("requestId");

    const statusElement =
        document.getElementById("requestStatus");

    const descriptionElement =
        document.getElementById("requestDescription");

    if (requestIdElement) {
        requestIdElement.textContent = "Unable to load request";
    }

    if (statusElement) {
        statusElement.replaceChildren();
    }

    if (descriptionElement) {
        descriptionElement.textContent = message;
    }

    const attachmentsElement =
        document.getElementById("requestAttachments");

    if (attachmentsElement) {
        attachmentsElement.replaceChildren();
    }
}



/* =================================
   Requester Dashboard - Live API
================================= */

async function setupRequesterDashboard() {
    const totalElement =
        document.getElementById("totalRequests");
    if (!totalElement) return;

    const inProgressElement =
        document.getElementById("inProgressRequests");
    const completedElement =
        document.getElementById("completedRequests");
    const loadingElement =
        document.getElementById("dashboardLoading");
    const errorElement =
        document.getElementById("dashboardError");
    const tableBody =
        document.getElementById("recentRequestsTableBody");

    if (loadingElement) {
        loadingElement.classList.remove("d-none");
    }

    if (errorElement) {
        errorElement.classList.add("d-none");
        errorElement.textContent = "";
    }

    try {
        const response = await apiRequest(
            "/me/maintenance-requests?per_page=100&page=1"
        );

        const requests = Array.isArray(response.data)
            ? response.data
            : [];

        const total = response.meta?.total ?? requests.length;

        const inProgress = requests.filter(
            request => request.status_label === "In Progress"
        ).length;

        const completed = requests.filter(
            request => request.status_label === "Completed"
        ).length;

        totalElement.textContent = total;

        if (inProgressElement) {
            inProgressElement.textContent = inProgress;
        }

        if (completedElement) {
            completedElement.textContent = completed;
        }

        renderRecentRequests(requests, tableBody);
    } catch (error) {
        console.error("Requester dashboard API error:", error);

        if (errorElement) {
            errorElement.textContent =
                "Unable to load dashboard data. Please refresh and try again.";
            errorElement.classList.remove("d-none");
        }

        totalElement.textContent = "—";

        if (inProgressElement) {
            inProgressElement.textContent = "—";
        }

        if (completedElement) {
            completedElement.textContent = "—";
        }

        renderRecentRequests([], tableBody);
    } finally {
        if (loadingElement) {
            loadingElement.classList.add("d-none");
        }
    }
}



/* =================================
   Render Recent Requests
================================= */

function renderRecentRequests(requests, tableBody) {
    if (!tableBody) return;

    tableBody.replaceChildren();

    if (requests.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 5;
        cell.className =
            "text-center text-muted py-4";
        cell.textContent =
            "No maintenance requests yet.";

        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }

    requests.slice(0, 3).forEach(request => {
        const row = document.createElement("tr");

        // The API's reference is the display ID, e.g. MR-0005.
        const reference =
            request.reference ?? `MR-${request.request_id}`;

        const idCell = document.createElement("td");
        const link = document.createElement("a");

        link.href =
            `request-details.html?id=${encodeURIComponent(
                request.request_id
            )}`;

        link.className =
            "text-decoration-none fw-semibold";

        link.textContent = reference;
        idCell.appendChild(link);

        const categoryCell =
            document.createElement("td");

        categoryCell.textContent =
            request.category_label ?? "—";

        const locationCell =
            document.createElement("td");

        locationCell.textContent =
            request.location_label ?? "—";

        const statusCell =
            document.createElement("td");

        const statusName =
            request.status_label ?? "Unknown";

        const statusBadge =
            document.createElement("span");

        const statusClasses = {
            "Pending": "text-bg-warning",
            "Approved": "text-bg-info",
            "Rejected": "text-bg-danger",
            "In Progress": "text-bg-primary",
            "On Hold": "text-bg-secondary",
            "Completed": "text-bg-success",
            "Closed": "text-bg-dark"
        };

        statusBadge.className =
            `badge ${statusClasses[statusName] ??
                "text-bg-secondary"}`;

        statusBadge.textContent = statusName;
        statusCell.appendChild(statusBadge);

        const dateCell = document.createElement("td");

        dateCell.textContent = (request.submitted_at || request.created_at)
            ? formatDate(
                (request.submitted_at || request.created_at)
                .substring(0, 10)
            )
            : "—";

        row.append(
            idCell,
            categoryCell,
            locationCell,
            statusCell,
            dateCell
        );

        tableBody.appendChild(row);
    });
}


/* =================================
   Current User Profile
================================= */

async function setupCurrentUser() {
    const topbarUserName =
        document.getElementById("topbarUserName");

    const nameElement =
        document.getElementById("currentUserName");

    const welcomeElement =
        document.getElementById("welcomeName");

    const facilitiesOfficerName =
        document.getElementById("facilitiesOfficerName");

    // Stop if this page has no user-name elements.
    if (!topbarUserName && !nameElement && !welcomeElement && !facilitiesOfficerName) {
        return;
    }

    try {
        const response = await apiRequest("/auth/me");
        const user = response.data;

        const userName = user.full_name || "User";

        if (topbarUserName) {
            topbarUserName.textContent = userName;
        }

        if (nameElement) {
            nameElement.textContent = userName;
        }

        if (welcomeElement) {
            welcomeElement.textContent = userName;
        }

        if (facilitiesOfficerName) {
            facilitiesOfficerName.textContent =
                user.full_name || "Facilities Officer";
        }

    } catch (error) {
        console.error("Unable to load current user:", error);

        if (topbarUserName) {
            topbarUserName.textContent = "Requester";
        }

        if (nameElement) {
            nameElement.textContent = "Requester";
        }

        if (welcomeElement) {
            welcomeElement.textContent = "there";
        }

        if (facilitiesOfficerName) {
            facilitiesOfficerName.textContent = "Facilities Officer";
        }
    }
}



            /* END OF NEW CODE */






















/* =================================
   Submission Success Message
================================= */
function setupSubmissionSuccessMessage() {
    const successMessage =
        document.getElementById("successMessage");

    if (!successMessage) {
        return;
    }

    const urlParams =
        new URLSearchParams(window.location.search);

    const submitted =
        urlParams.get("submitted");

    if (submitted === "1") {
        successMessage.classList.remove("d-none");

        // Remove the query parameter from the URL.
        window.history.replaceState(
            {},
            document.title,
            window.location.pathname
        );
    }
}





















            /* NEW CODE */

/* =================================
   Logout links
================================= */

function setupLogoutLinks() {
    document.querySelectorAll("#logoutLink").forEach(link => {
        link.addEventListener("click", async event => {
            event.preventDefault();
            try {
                if (getAuthToken()) {
                    await apiRequest("/auth/logout", { method: "POST" });
                }
            } catch (error) {
                console.warn("Logout API request failed; clearing local session.", error);
            } finally {
                localStorage.removeItem(AUTH_TOKEN_KEY);
                localStorage.removeItem("jobtrack_user");
                window.location.href = "../../index.html";
            }
        });
    });
}

            /* END OF NEW CODE */







/* =================================
   Start Application
================================= */

setupMaintenanceRequestForm();
setupMyRequestsPage();
setupRequestDetailsPage();
setupRequesterDashboard();
setupSubmissionSuccessMessage();


setupCurrentUser();
setupLogoutLinks();