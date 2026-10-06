console.log("JobTrack frontend loaded successfully.");

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

/* =================================
   Initial Sample Requests
================================= */
function initializeSampleRequests() {
    const existingRequests = getRequests();
    // Don't overwrite requests that already exist.
    if (existingRequests.length > 0) {
        return;
    }

    const sampleRequests = [
        {
            id: "MR-0005",
            category: "Electrical",
            location: "Room 204",
            priority: "Normal",
            description: "Ceiling light is not working.",
            status: "Pending",
            submittedDate: "2026-10-05",
            attachments: []
        },
        {
            id: "MR-0004",
            category: "Plumbing",
            location: "Faculty Room",
            priority: "High",
            description: "Water is leaking underneath the sink.",
            status: "In Progress",
            submittedDate: "2026-10-03",
            attachments: []
        },
        {
            id: "MR-0003",
            category: "HVAC",
            location: "Computer Lab 2",
            priority: "Normal",
            description: "Air conditioning unit is not cooling properly.",
            status: "Completed",
            submittedDate: "2026-09-30",
            attachments: []
        }
    ];

    saveRequests(sampleRequests);
}


/* =================================
   Create Maintenance Request
================================= */
function setupMaintenanceRequestForm() {
    const form =
        document.getElementById("maintenanceRequestForm");
    // Stop if this page doesn't contain the form.
    if (!form) {
        return;
    }

    form.addEventListener("submit", function (event) {
        // Prevent normal HTML form submission.
        event.preventDefault();

        /* -----------------------------
            Get Form Elements
        ----------------------------- */

        const categoryElement =
            document.getElementById("category");

        const locationElement =
            document.getElementById("location");

        const priorityElement =
            document.getElementById("priority");

        const descriptionElement =
            document.getElementById("description");

        const formErrorMessage =
            document.getElementById("formErrorMessage");

        /* -----------------------------
           Get Form Values
        ----------------------------- */
        const category =
            categoryElement.value;

        const location =
            locationElement.value;

        const priority =
            priorityElement.value;

        const description =
            descriptionElement.value.trim();

        /* -----------------------------
           Clear Previous Errors
        ----------------------------- */
        categoryElement.classList.remove("is-invalid");

        locationElement.classList.remove("is-invalid");

        priorityElement.classList.remove("is-invalid");

        descriptionElement.classList.remove("is-invalid");

        formErrorMessage.classList.add("d-none");

        /* -----------------------------
           Validate Form
        ----------------------------- */
        let isValid = true;
        if (!category) {
            categoryElement.classList.add("is-invalid");
            isValid = false;
        }

        if (!location) {
            locationElement.classList.add("is-invalid");
            isValid = false;
        }


        if (!priority) {
            priorityElement.classList.add("is-invalid");
            isValid = false;
        }

        if (description.length < 10) {
            descriptionElement.classList.add("is-invalid");
            isValid = false;
        }

        /* -----------------------------
           Stop if Invalid
        ----------------------------- */
        if (!isValid) {
            formErrorMessage.classList.remove("d-none");
            return;
        }

        const attachmentInput =
            document.getElementById("attachments");

        /* -----------------------------
           Get Display Values
        ----------------------------- */
        const categoryText =
            document.getElementById("category")
                .selectedOptions[0].text;
        const locationText =
            document.getElementById("location")
                .selectedOptions[0].text;
        const priorityText =
            document.getElementById("priority")
                .selectedOptions[0].text;

        /* -----------------------------
           Get Attached File Names
        ----------------------------- */
        const attachments =
            Array.from(attachmentInput.files)
                .map(file => file.name);

        /* -----------------------------
           Generate Request ID
        ----------------------------- */
        const requests = getRequests();
        let nextNumber = 1;
        if (requests.length > 0) {
            const numbers = requests.map(request => {
                return parseInt(
                    request.id.replace("MR-", ""),
                    10
                );
            });
            nextNumber = Math.max(...numbers) + 1;
        }
        const requestId =
            "MR-" + String(nextNumber).padStart(4, "0");

        /* -----------------------------
           Current Date
        ----------------------------- */
        const today =
            new Date().toISOString().split("T")[0];

        /* -----------------------------
           Create Request Object
        ----------------------------- */
        const newRequest = {
            id: requestId,
            category: categoryText,
            location: locationText,
            priority: priorityText,
            description: description,
            status: "Pending",
            submittedDate: today,
            attachments: attachments
        };

        /* -----------------------------
           Save Request
        ----------------------------- */
        requests.unshift(newRequest);
        saveRequests(requests);

        /* -----------------------------
           Redirect
        ----------------------------- */
        window.location.href =
            "my-requests.html?submitted=1";
    });
}

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
    requestCount.textContent =
        requests.length +
        (requests.length === 1 ? " request" : " requests");

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


/* =================================
   Request Details Page
================================= */
function setupRequestDetailsPage() {
    const requestIdElement =
        document.getElementById("requestId");

    // Stop if this isn't the details page.
    if (!requestIdElement) {
        return;
    }

    /* -----------------------------
       Get Request ID from URL
    ----------------------------- */
    const urlParams =
        new URLSearchParams(window.location.search);
    const requestId =
        urlParams.get("id");

    /* -----------------------------
       Find Request
    ----------------------------- */
    const requests =
        getRequests();
    const request =
        requests.find(item => item.id === requestId);

    /* -----------------------------
       Request Not Found
    ----------------------------- */
    if (!request) {
        requestIdElement.textContent =
            "Request Not Found";
        document.getElementById("requestDescription")
            .textContent =
            "The requested maintenance request could not be found.";
        return;
    }

    /* -----------------------------
       Display Request Information
    ----------------------------- */
    requestIdElement.textContent =
        request.id;

    document.getElementById("requestCategory")
        .textContent =
        request.category;

    document.getElementById("requestLocation")
        .textContent =
        request.location;

    document.getElementById("requestPriority")
        .textContent =
        request.priority;

    document.getElementById("requestDate")
        .textContent =
        formatDate(request.submittedDate);

    document.getElementById("requestDescription")
        .textContent =
        request.description;


    /* -----------------------------
       Display Status
    ----------------------------- */
    document.getElementById("requestStatus")
        .innerHTML =
        getStatusBadge(request.status);

    /* -----------------------------
       Display Attachments
    ----------------------------- */
    const attachmentsContainer =
        document.getElementById("requestAttachments");

    if (
        !request.attachments ||
        request.attachments.length === 0
    ) {
        attachmentsContainer.innerHTML = `
            <p class="text-muted mb-0">
                No attachments.
            </p>
        `;
    } else {
        attachmentsContainer.innerHTML = `
            <ul class="mb-0">
                ${request.attachments
                    .map(file => `<li>${file}</li>`)
                    .join("")}
            </ul>
        `;
    }
}


/* =================================
   Requester Dashboard
================================= */
function setupRequesterDashboard() {
    const totalRequestsElement =
        document.getElementById("totalRequests");

    // Stop if this isn't the requester dashboard.
    if (!totalRequestsElement) {
        return;
    }
    const requests = getRequests();

    /* -----------------------------
       Calculate Statistics
    ----------------------------- */
    const totalRequests =
        requests.length;
    const inProgressRequests =
        requests.filter(
            request => request.status === "In Progress"
        ).length;
    const completedRequests =
        requests.filter(
            request => request.status === "Completed"
        ).length;

    /* -----------------------------
       Update Statistics
    ----------------------------- */
    document.getElementById("totalRequests")
        .textContent = totalRequests;
    document.getElementById("inProgressRequests")
        .textContent = inProgressRequests;
    document.getElementById("completedRequests")
        .textContent = completedRequests;

    /* -----------------------------
       Recent Requests
    ----------------------------- */
    const tableBody =
        document.getElementById("recentRequestsTableBody");
    if (!tableBody) {
        return;
    }

    // Show only the 3 most recent requests.
    const recentRequests =
        requests.slice(0, 3);

    if (recentRequests.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted py-4">
                    No maintenance requests yet.
                </td>
            </tr>
        `;
        return;
    }
    tableBody.innerHTML = "";
    recentRequests.forEach(request => {
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




/* =================================
   Start Application
================================= */
initializeSampleRequests();
setupMaintenanceRequestForm();
setupMyRequestsPage();
setupRequestDetailsPage();
setupRequesterDashboard();
setupSubmissionSuccessMessage();