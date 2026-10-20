
(() => {
  const REQUESTS_KEY = "jobtrack_requests";
  const JOB_ORDERS_KEY = "jobtrack_job_orders";

  const sampleRequests = [
    {
      id: "MR-0005",
      location: "Electrical Room 204",
      category: "Electrical",
      requester: "Juan Dela Cruz",
      priority: "Normal",
      status: "Pending",
      createdAt: "2026-10-19"
    },
    {
      id: "MR-0004",
      location: "Faculty Room",
      category: "Plumbing",
      requester: "Maria Santos",
      priority: "High",
      status: "In Progress",
      createdAt: "2026-10-18"
    },
    {
      id: "MR-0003",
      location: "Computer Lab 2",
      category: "HVAC",
      requester: "Pedro Reyes",
      priority: "Normal",
      status: "Completed",
      createdAt: "2026-10-17"
    },
    {
      id: "MR-0002",
      location: "Library",
      category: "Carpentry",
      requester: "Ana Garcia",
      priority: "High",
      status: "Pending",
      createdAt: "2026-10-16"
    },
    {
      id: "MR-0001",
      location: "Room 101",
      category: "Electrical",
      requester: "Jose Cruz",
      priority: "Low",
      status: "Pending",
      createdAt: "2026-10-15"
    }
  ];

  // Only initialize the sample requests if no saved requests exist.
  function getRequests() {
    const saved = localStorage.getItem(REQUESTS_KEY);

    if (saved === null) {
      localStorage.setItem(REQUESTS_KEY, JSON.stringify(sampleRequests));
      return sampleRequests;
    }

    try {
      const requests = JSON.parse(saved);
      return Array.isArray(requests) ? requests : [];
    } catch {
      return [];
    }
  }

  function getJobOrders() {
    try {
      const orders = JSON.parse(
        localStorage.getItem(JOB_ORDERS_KEY) || "[]"
      );

      return Array.isArray(orders) ? orders : [];
    } catch {
      return [];
    }
  }

  function normalizeStatus(status) {
    return String(status || "").trim().toLowerCase();
  }

  function normalizePriority(priority) {
    return String(priority || "").trim().toLowerCase();
  }

  function getRequestStatus(request) {
    return request.status || request.request_status || "Pending";
  }

  function renderSummary(requests, jobOrders) {
    const pending = requests.filter(
      request => normalizeStatus(getRequestStatus(request)) === "pending"
    ).length;

    const highPriority = requests.filter(
      request => normalizePriority(request.priority) === "high"
    ).length;

    const activeJobs = jobOrders.filter(order => {
      const status = normalizeStatus(order.status || order.job_order_status);
      return ["approved", "assigned", "in progress", "on hold"].includes(status);
    }).length;

    const completedJobs = jobOrders.filter(order => {
      const status = normalizeStatus(order.status || order.job_order_status);
      return ["completed", "closed"].includes(status);
    }).length;

    document.getElementById("pendingCount").textContent = pending;
    document.getElementById("highPriorityCount").textContent = highPriority;
    document.getElementById("activeJobsCount").textContent = activeJobs;
    document.getElementById("completedJobsCount").textContent = completedJobs;
  }

  function createCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text || "—";
    return cell;
  }

  function createBadge(text, type) {
    const badge = document.createElement("span");
    badge.className = `badge ${type}`;
    badge.textContent = text;
    return badge;
  }

  function getStatusClass(status) {
    switch (normalizeStatus(status)) {
      case "pending":
        return "text-bg-warning";
      case "in progress":
        return "text-bg-primary";
      case "completed":
        return "text-bg-success";
      case "rejected":
        return "text-bg-danger";
      default:
        return "text-bg-secondary";
    }
  }

  function getPriorityClass(priority) {
    switch (normalizePriority(priority)) {
      case "high":
        return "text-bg-danger";
      case "normal":
        return "text-bg-primary";
      case "low":
        return "text-bg-secondary";
      default:
        return "text-bg-secondary";
    }
  }

  function renderRequests() {
    const requests = getRequests();
    const jobOrders = getJobOrders();

    renderSummary(requests, jobOrders);

    const search = document.getElementById("requestSearch").value
      .trim()
      .toLowerCase();

    const statusFilter = document.getElementById("statusFilter").value;

    const filtered = requests.filter(request => {
      const status = getRequestStatus(request);

      const searchable = [
        request.id,
        request.request_id,
        request.location,
        request.location_name,
        request.category,
        request.category_name,
        request.requester,
        request.requester_name
      ].filter(Boolean).join(" ").toLowerCase();

      const matchesSearch = searchable.includes(search);
      const matchesStatus =
        statusFilter === "all" || status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    // Show newest records first when a creation date is available.
    filtered.sort((a, b) =>
      String(b.createdAt || b.created_at || "")
        .localeCompare(String(a.createdAt || a.created_at || ""))
    );

    const tbody = document.getElementById("requestTableBody");
    tbody.replaceChildren();

    if (filtered.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 6;
      cell.className = "text-center py-4 text-muted";
      cell.textContent = "No matching maintenance requests found.";

      row.appendChild(cell);
      tbody.appendChild(row);
    } else {
      filtered.forEach(request => {
        const row = document.createElement("tr");
        const status = getRequestStatus(request);
        const priority = request.priority || "Normal";

        row.appendChild(createCell(request.id || request.request_id));
        row.appendChild(createCell(request.location || request.location_name));
        row.appendChild(createCell(request.category || request.category_name));
        row.appendChild(createCell(request.requester || request.requester_name));

        const priorityCell = document.createElement("td");
        priorityCell.appendChild(createBadge(priority, getPriorityClass(priority)));
        row.appendChild(priorityCell);

        const statusCell = document.createElement("td");
        statusCell.appendChild(createBadge(status, getStatusClass(status)));
        row.appendChild(statusCell);

        tbody.appendChild(row);
      });
    }

    document.getElementById("requestCountLabel").textContent =
      `Showing ${filtered.length} of ${requests.length} requests`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("requestSearch")
      .addEventListener("input", renderRequests);

    document.getElementById("statusFilter")
      .addEventListener("change", renderRequests);

    renderRequests();
  });
})();
