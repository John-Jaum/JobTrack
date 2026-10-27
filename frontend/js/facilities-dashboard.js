(() => {
  "use strict";

  const API_REQUESTS_ENDPOINT = "/maintenance-requests";
  const API_SUMMARY_ENDPOINT = "/dashboard/summary";
  const API_REQUEST_STATUSES_ENDPOINT = "/statuses";
  const PER_PAGE = 100;

  let requests = [];
  let requestMeta = null;
  let statusLookup = [];
  let searchDebounce = null;
  let requestLoadSequence = 0;

  const byId = (id) => document.getElementById(id);

  function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function getStatusName(request) {
    return request?.status?.status_name
      ?? request?.status_name
      ?? request?.request_status
      ?? request?.status
      ?? "Unknown";
  }

  function getLocationName(request) {
    return request?.location_label
        ?? request?.location?.name
        ?? request?.location?.location_name
        ?? request?.location?.building_name
        ?? request?.location_name
        ?? "—";
  }

  function getCategoryName(request) {
    return request?.category_label
        ?? request?.category?.name
        ?? request?.category?.category_name
        ?? request?.category_name
        ?? "—";
}

  function getRequesterName(request) {
    const requester = request?.requester;

    if (requester && typeof requester === "object") {
      const fullName = [
        requester.first_name,
        requester.last_name
      ].filter(Boolean).join(" ");

      return requester.name
        ?? requester.full_name
        ?? fullName
        ?? requester.email
        ?? "—";
    }

    return requester ?? request?.requester_name ?? "—";
  }

  function showDashboardAlert(message, type = "danger") {
    let alert = byId("facilitiesDashboardAlert");

    if (!alert) {
      alert = document.createElement("div");
      alert.id = "facilitiesDashboardAlert";
      alert.className = "alert d-none mb-4";
      alert.setAttribute("role", "alert");

      const main = document.querySelector("main");
      const pageHeader = main?.querySelector("h1")?.closest(".d-flex");

      if (pageHeader?.parentNode) {
        pageHeader.parentNode.insertBefore(
          alert,
          pageHeader.nextSibling
        );
      } else if (main) {
        main.prepend(alert);
      }
    }

    alert.className = `alert alert-${type} mb-4`;
    alert.textContent = message;
  }

  function clearDashboardAlert() {
    const alert = byId("facilitiesDashboardAlert");

    if (alert) {
      alert.className = "alert d-none mb-4";
      alert.textContent = "";
    }
  }

  function showTableMessage(message, type = "muted") {
    const tbody = byId("requestTableBody");

    if (!tbody) return;

    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 6;
    cell.className = "text-center py-4";

    if (type === "danger") {
      cell.classList.add("text-danger");
    } else {
      cell.classList.add("text-muted");
    }

    cell.textContent = message;

    row.appendChild(cell);
    tbody.replaceChildren(row);
  }

  function createCell(text) {
    const cell = document.createElement("td");

    cell.textContent =
      text == null || text === ""
        ? "—"
        : String(text);

    return cell;
  }

  function createBadge(text, className) {
    const badge = document.createElement("span");

    badge.className = `badge ${className}`;
    badge.textContent = text;

    return badge;
  }

  function getStatusClass(status) {
    switch (normalize(status)) {
      case "pending":
        return "text-bg-warning";

      case "approved":
        return "text-bg-info";

      case "in progress":
        return "text-bg-primary";

      case "on hold":
        return "text-bg-secondary";

      case "completed":
      case "closed":
        return "text-bg-success";

      case "rejected":
        return "text-bg-danger";

      default:
        return "text-bg-secondary";
    }
  }

  function getPriorityClass(priority) {
    switch (normalize(priority)) {
      case "urgent":
      case "high":
        return "text-bg-danger";

      case "medium":
        return "text-bg-warning";

      case "low":
        return "text-bg-secondary";

      default:
        return "text-bg-secondary";
    }
  }

  // Use the summary endpoint for every dashboard counter.
  // Do not calculate job-order counts from maintenance requests.
  function renderSummary(facilities) {
    const counters = {
      pendingCount: facilities?.pending_requests,
      highPriorityCount: facilities?.high_priority_requests,
      activeJobsCount: facilities?.active_job_orders,
      completedJobsCount: facilities?.completed_job_orders
    };

    for (const [id, value] of Object.entries(counters)) {
      const element = byId(id);

      if (element) {
        element.textContent =
          value != null && value !== "" &&
          Number.isFinite(Number(value))
            ? String(Number(value))
            : "—";
      }
    }
  }


  async function loadSummary() {
    const counterIds = [
      "pendingCount",
      "highPriorityCount",
      "activeJobsCount",
      "completedJobsCount"
    ];

    try {
      const [requestsResponse, jobsResponse] = await Promise.all([
        apiRequest(`${API_REQUESTS_ENDPOINT}?per_page=100&page=1`),
        apiRequest("/job-orders?per_page=100&page=1")
      ]);

      const requests = Array.isArray(requestsResponse?.data)
        ? requestsResponse.data
        : [];

      const jobs = Array.isArray(jobsResponse?.data)
        ? jobsResponse.data
        : [];

      const pendingCount = requests.filter(
        request => String(request.status_label ?? "").toLowerCase() === "pending"
      ).length;

      const highPriorityCount = requests.filter(
        request => ["high", "urgent"].includes(
          String(request.priority ?? "").toLowerCase()
        )
      ).length;

      const activeJobsCount = jobs.filter(
        job => ["assigned", "in progress", "on hold"].includes(
          String(job.status_label ?? job.status?.name ?? job.status ?? "").toLowerCase()
        )
      ).length;

      const completedJobsCount = jobs.filter(
        job => ["completed", "closed"].includes(
          String(job.status_label ?? job.status?.name ?? job.status ?? "").toLowerCase()
        )
      ).length;

      const counters = {
        pendingCount,
        highPriorityCount,
        activeJobsCount,
        completedJobsCount
      };

      for (const [id, value] of Object.entries(counters)) {
        const element = byId(id);
        if (element) element.textContent = String(value);
      }

      return true;
    } catch (error) {
      counterIds.forEach(id => {
        const element = byId(id);
        if (element) element.textContent = "—";
      });

      showDashboardAlert(
        `Unable to load dashboard counters. ${error?.message || "Please try again."}`,
        "danger"
      );

      return false;
    }
  }


  async function loadStatusLookup() {
    try {
      const response = await apiRequest(
        API_REQUEST_STATUSES_ENDPOINT
      );

      statusLookup = Array.isArray(response?.data)
        ? response.data
        : [];
    } catch {
      // The request table can still load if the lookup fails.
      statusLookup = [];
    }
  }

  function selectedStatusId() {
    const selectedName = byId("statusFilter")?.value;

    if (!selectedName || selectedName === "all") {
      return null;
    }

    const match = statusLookup.find((item) => {
      const name = item.name ?? item.status_name;

      return normalize(name) === normalize(selectedName);
    });

    return match?.id ?? match?.status_id ?? null;
  }

  function getSearchableText(request) {
    return [
      request?.reference,
      request?.request_id,
      getLocationName(request),
      getCategoryName(request),
      getRequesterName(request),
      request?.priority,
      getStatusName(request)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function renderRequests() {
    const tbody = byId("requestTableBody");

    if (!tbody) return;

    const search =
      byId("requestSearch")?.value.trim().toLowerCase() ?? "";

    const selectedStatus =
      byId("statusFilter")?.value ?? "all";

    let visibleRequests = requests;

    // Apply local matching as well, so priority and status text
    // remain searchable even if the API's q parameter excludes them.
    if (search) {
      visibleRequests = visibleRequests.filter((request) =>
        getSearchableText(request).includes(search)
      );
    }

    // If the status lookup did not return an ID, filter the
    // records currently loaded by status name.
    if (selectedStatus !== "all" && !selectedStatusId()) {
      visibleRequests = visibleRequests.filter(
        (request) =>
          normalize(getStatusName(request)) ===
          normalize(selectedStatus)
      );
    }

    if (visibleRequests.length === 0) {
      showTableMessage(
        search || selectedStatus !== "all"
          ? "No matching maintenance requests found."
          : "There are no maintenance requests to display."
      );
    } else {
      const fragment = document.createDocumentFragment();

      visibleRequests.forEach((request) => {
        const row = document.createElement("tr");

        const status = getStatusName(request);
        const priority = request?.priority ?? "—";

        row.appendChild(
          createCell(request?.reference ?? request?.request_id)
        );

        row.appendChild(
          createCell(getLocationName(request))
        );

        row.appendChild(
          createCell(getCategoryName(request))
        );

        row.appendChild(
          createCell(getRequesterName(request))
        );

        const priorityCell = document.createElement("td");

        priorityCell.appendChild(
          createBadge(
            priority,
            getPriorityClass(priority)
          )
        );

        row.appendChild(priorityCell);

        const statusCell = document.createElement("td");

        statusCell.appendChild(
          createBadge(
            status,
            getStatusClass(status)
          )
        );

        row.appendChild(statusCell);
        fragment.appendChild(row);
      });

      tbody.replaceChildren(fragment);
    }

    const total = Number.isFinite(Number(requestMeta?.total))
      ? Number(requestMeta.total)
      : requests.length;

    const shown = visibleRequests.length;
    const label = byId("requestCountLabel");

    if (label) {
      label.textContent = `Showing ${shown} of ${total} requests`;
    }
  }

  async function loadRequests() {
    const sequence = ++requestLoadSequence;
    const tbody = byId("requestTableBody");

    if (!tbody) return;

    showTableMessage("Loading maintenance requests...");

    const search =
      byId("requestSearch")?.value.trim() ?? "";

    const statusFilter =
      byId("statusFilter")?.value ?? "all";

    try {
      const params = new URLSearchParams();

      params.set("page", "1");
      params.set("per_page", String(PER_PAGE));
      params.set("sort", "-submitted_at");

      if (search) {
        params.set("q", search);
      }

      if (statusFilter !== "all") {
        const statusId = selectedStatusId();

        if (statusId != null) {
          params.set("status_id", String(statusId));
        }
      }

      const response = await apiRequest(
        `${API_REQUESTS_ENDPOINT}?${params.toString()}`
      );

      // Ignore stale responses if a newer search has started.
      if (sequence !== requestLoadSequence) return;

      if (!Array.isArray(response?.data)) {
        throw new Error(
          "The maintenance-request response was not in the expected format."
        );
      }

      requests = response.data;
      requestMeta = response.meta ?? null;

      renderRequests();
      clearDashboardAlert();
    } catch (error) {
      if (sequence !== requestLoadSequence) return;

      requests = [];
      requestMeta = null;

      showTableMessage(
        `Unable to load maintenance requests. ${
          error?.message ||
          "Check your connection and try again."
        }`,
        "danger"
      );

      const label = byId("requestCountLabel");

      if (label) {
        label.textContent = "Request count unavailable";
      }

      showDashboardAlert(
        `The maintenance-request list could not be loaded. ${
          error?.message ||
          "Check that the Laravel API is running and try again."
        }`,
        "danger"
      );
    }
  }

  function scheduleRequestReload() {
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }

    searchDebounce = setTimeout(loadRequests, 300);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const searchInput = byId("requestSearch");
    const statusFilter = byId("statusFilter");

    searchInput?.addEventListener(
      "input",
      scheduleRequestReload
    );

    statusFilter?.addEventListener(
      "change",
      loadRequests
    );

    if (typeof apiRequest !== "function") {
      showDashboardAlert(
        "The API helper is unavailable. Make sure ../../js/app.js loads before facilities-dashboard.js.",
        "danger"
      );

      showTableMessage(
        "Dashboard unavailable because the API helper did not load.",
        "danger"
      );

      return;
    }

    // Load status IDs before applying status filters.
    await loadStatusLookup();

    // Both calls use their own API endpoints.
    await Promise.allSettled([
      loadSummary(),
      loadRequests()
    ]);
  });
})();