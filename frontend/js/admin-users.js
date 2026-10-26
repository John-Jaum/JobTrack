
(() => {
    "use strict";

    const PAGE_SIZE = 10;
    const TOKEN_KEY = "jobtrack_token";

    const state = {
        page: 1,
        lastPage: 1,
        total: 0,
        users: [],
        roles: [],
        editingId: null,
        loading: false
    };

    const $ = id => document.getElementById(id);

    const el = {
        alert: $("usersAlert"),
        topbarName: $("adminTopbarUserName"),
        total: $("totalUsers"),
        active: $("activeUsers"),
        inactive: $("inactiveUsers"),
        search: $("userSearch"),
        roleFilter: $("roleFilter"),
        statusFilter: $("statusFilter"),
        filterForm: $("userFilterForm"),
        resetFilters: $("resetFiltersButton"),
        refresh: $("refreshUsersButton"),
        create: $("createUserButton"),
        loading: $("usersLoading"),
        empty: $("usersEmpty"),
        error: $("usersError"),
        tableContainer: $("usersTableContainer"),
        tbody: $("usersTableBody"),
        pagination: $("usersPaginationInfo"),
        previous: $("previousUsersPage"),
        next: $("nextUsersPage"),
        retry: $("retryUsersButton"),
        modal: $("userModal"),
        modalTitle: $("userModalTitle"),
        form: $("userForm"),
        formAlert: $("userFormAlert"),
        fullName: $("fullName"),
        email: $("email"),
        phone: $("phoneNumber"),
        role: $("userRole"),
        password: $("password"),
        passwordRequired: $("passwordRequired"),
        activeCheckbox: $("isActive"),
        save: $("saveUserButton"),
        logout: $("logoutButton")
    };

    const modal = bootstrap.Modal.getOrCreateInstance(el.modal);

    function showAlert(message, type = "danger") {
        el.alert.textContent = message;
        el.alert.className = `alert alert-${type}`;
    }

    function hideAlert() {
        el.alert.textContent = "";
        el.alert.className = "alert d-none";
    }

    function showFormAlert(message, type = "danger") {
        el.formAlert.textContent = message;
        el.formAlert.className = `alert alert-${type}`;
    }

    function hideFormAlert() {
        el.formAlert.textContent = "";
        el.formAlert.className = "alert d-none";
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[c]);
    }

    function formatDate(value) {
        if (!value) return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "—"
            : date.toLocaleDateString();
    }

    async function api(path, options) {
        if (typeof window.apiRequest !== "function") {
            throw new Error("Shared apiRequest() helper is unavailable.");
        }
        return window.apiRequest(path, options);
    }

    function unwrap(response) {
        return response?.data;
    }

    function setLoading(loading) {
        state.loading = loading;
        el.loading.classList.toggle("d-none", !loading);
        el.refresh.disabled = loading;
        el.previous.disabled = loading || state.page <= 1;
        el.next.disabled = loading || state.page >= state.lastPage;
    }

    async function loadCurrentUser() {
        const response = await api("/auth/me");
        const user = unwrap(response);

        if (!user) throw new Error("Could not identify the current user.");

        if (el.topbarName) {
            el.topbarName.textContent = user.full_name || "Administrator";
        }

        const roleName = user.role?.role_name;
        if (roleName !== "Administrator") {
            throw new Error(
                "This page is for Administrators. Access must also be enforced by the backend."
            );
        }
    }

    async function loadRoles() {
        const response = await api("/roles?per_page=100&page=1");
        const roles = unwrap(response);

        if (!Array.isArray(roles)) {
            throw new Error("Unexpected roles response.");
        }

        state.roles = roles;
        populateRoleSelect(el.roleFilter, true);
        populateRoleSelect(el.role, false);
    }

    function populateRoleSelect(select, includeAll) {
        const currentValue = select.value;

        select.replaceChildren();

        const first = document.createElement("option");
        first.value = "";
        first.textContent = includeAll ? "All roles" : "Select a role";
        select.appendChild(first);

        state.roles.forEach(role => {
            const option = document.createElement("option");
            option.value = String(role.role_id);
            option.textContent = role.role_name;
            select.appendChild(option);
        });

        if ([...select.options].some(o => o.value === currentValue)) {
            select.value = currentValue;
        }
    }

    async function loadUsers() {
        hideAlert();
        setLoading(true);

        el.error.classList.add("d-none");
        el.empty.classList.add("d-none");
        el.tableContainer.classList.add("d-none");

        try {
            const params = new URLSearchParams({
                page: String(state.page),
                per_page: String(PAGE_SIZE)
            });

            const q = el.search.value.trim();
            if (q) params.set("q", q);
            if (el.roleFilter.value) {
                params.set("role_id", el.roleFilter.value);
            }
            if (el.statusFilter.value !== "") {
                params.set("is_active", el.statusFilter.value);
            }

            const response = await api(`/users?${params.toString()}`);
            const users = unwrap(response);
            const meta = response?.meta;

            if (!Array.isArray(users) || !meta) {
                throw new Error("Unexpected users response.");
            }

            state.users = users;
            state.total = Number(meta.total) || 0;
            state.page = Number(meta.current_page) || state.page;
            state.lastPage = Number(meta.last_page) || 1;

            renderUsers();
        } catch (error) {
            console.error("Failed to load users:", error);
            el.tbody.replaceChildren();
            el.error.classList.remove("d-none");
            showAlert(error.message || "Unable to load users.");
        } finally {
            setLoading(false);
            updatePagination();
        }
    }

    function renderUsers() {
        el.tbody.replaceChildren();

        let activeCount = 0;
        let inactiveCount = 0;

        state.users.forEach(user => {
            if (user.is_active) activeCount++;
            else inactiveCount++;

            const tr = document.createElement("tr");
            const roleName = user.role?.role_name || "Unknown role";

            tr.innerHTML = `
                <td>
                    <div class="fw-semibold">${escapeHtml(user.full_name)}</div>
                    <small class="text-muted">ID: ${escapeHtml(user.user_id)}</small>
                </td>
                <td>${escapeHtml(roleName)}</td>
                <td>
                    <div>${escapeHtml(user.email)}</div>
                    <small class="text-muted">
                        ${escapeHtml(user.phone_number || "No phone provided")}
                    </small>
                </td>
                <td>
                    <span class="badge ${
                        user.is_active ? "bg-success" : "bg-secondary"
                    }">
                        ${user.is_active ? "Active" : "Inactive"}
                    </span>
                </td>
                <td>${escapeHtml(formatDate(user.created_at))}</td>
                <td class="text-end text-nowrap">
                    <button type="button"
                            class="btn btn-outline-primary btn-sm edit-user"
                            data-id="${Number(user.user_id)}">
                        Edit
                    </button>
                    <button type="button"
                            class="btn btn-outline-${
                                user.is_active ? "danger" : "success"
                            } btn-sm toggle-user"
                            data-id="${Number(user.user_id)}"
                            data-active="${user.is_active ? "true" : "false"}">
                        ${user.is_active ? "Deactivate" : "Activate"}
                    </button>
                </td>
            `;

            el.tbody.appendChild(tr);
        });

        el.total.textContent = state.total.toLocaleString();
        el.active.textContent = activeCount.toLocaleString();
        el.inactive.textContent = inactiveCount.toLocaleString();

        const hasUsers = state.users.length > 0;
        el.tableContainer.classList.toggle("d-none", !hasUsers);
        el.empty.classList.toggle("d-none", hasUsers);
    }

    function updatePagination() {
        el.pagination.textContent =
            `Page ${state.page} of ${state.lastPage} · ${state.total} users`;

        el.previous.disabled = state.loading || state.page <= 1;
        el.next.disabled = state.loading || state.page >= state.lastPage;
    }

    function openCreateModal() {
        state.editingId = null;
        el.form.reset();
        hideFormAlert();

        el.modalTitle.textContent = "Create User";
        el.save.textContent = "Create User";
        el.password.required = true;
        el.passwordRequired.textContent = "*";
        el.activeCheckbox.checked = true;

        modal.show();
    }

    async function openEditModal(userId) {
        hideFormAlert();

        try {
            const response = await api(`/users/${userId}`);
            const user = unwrap(response);

            if (!user) throw new Error("User details were not returned.");

            state.editingId = Number(user.user_id);
            el.form.reset();

            el.modalTitle.textContent = "Edit User";
            el.save.textContent = "Save Changes";
            el.password.required = false;
            el.passwordRequired.textContent = "(optional)";

            el.fullName.value = user.full_name || "";
            el.email.value = user.email || "";
            el.phone.value = user.phone_number || "";
            el.role.value = String(user.role?.role_id || "");
            el.activeCheckbox.checked = Boolean(user.is_active);
            el.password.value = "";

            modal.show();
        } catch (error) {
            showAlert(error.message || "Unable to load user details.");
        }
    }

    async function saveUser(event) {
        event.preventDefault();
        hideFormAlert();

        if (!el.form.reportValidity()) return;

        const payload = {
            full_name: el.fullName.value.trim(),
            email: el.email.value.trim(),
            role_id: Number(el.role.value),
            is_active: el.activeCheckbox.checked
        };

        const phone = el.phone.value.trim();
        if (phone) payload.phone_number = phone;

        const password = el.password.value;
        if (password) payload.password = password;

        if (!state.editingId && !password) {
            showFormAlert("A password is required when creating a user.");
            return;
        }

        el.save.disabled = true;
        el.save.textContent = "Saving...";

        try {
            if (state.editingId) {
                await api(`/users/${state.editingId}`, {
                    method: "PATCH",
                    body: payload
                });
            } else {
                await api("/users", {
                    method: "POST",
                    body: payload
                });
            }

            modal.hide();
            showAlert(
                state.editingId
                    ? "User account updated."
                    : "User account created.",
                "success"
            );

            state.page = 1;
            await loadUsers();
        } catch (error) {
            console.error("Failed to save user:", error);
            showFormAlert(
                error.message ||
                "Unable to save the account. Check the submitted fields."
            );
        } finally {
            el.save.disabled = false;
            el.save.textContent = state.editingId
                ? "Save Changes"
                : "Create User";
        }
    }

    async function toggleUserStatus(userId, currentlyActive) {
        const action = currentlyActive ? "deactivate" : "activate";

        if (!window.confirm(`Are you sure you want to ${action} this account?`)) {
            return;
        }

        try {
            // PATCH supports changing is_active; there is no DELETE endpoint.
            await api(`/users/${userId}`, {
                method: "PATCH",
                body: { is_active: !currentlyActive }
            });

            showAlert(
                `User account ${currentlyActive ? "deactivated" : "activated"}.`,
                "success"
            );

            await loadUsers();
        } catch (error) {
            showAlert(error.message || "Unable to update account status.");
        }
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
        state.page = 1;
        loadUsers();
    });

    el.resetFilters.addEventListener("click", () => {
        el.search.value = "";
        el.roleFilter.value = "";
        el.statusFilter.value = "";
        state.page = 1;
        loadUsers();
    });

    el.create.addEventListener("click", openCreateModal);
    el.refresh.addEventListener("click", loadUsers);
    el.retry.addEventListener("click", loadUsers);
    el.form.addEventListener("submit", saveUser);

    el.previous.addEventListener("click", () => {
        if (state.page > 1 && !state.loading) {
            state.page--;
            loadUsers();
        }
    });

    el.next.addEventListener("click", () => {
        if (state.page < state.lastPage && !state.loading) {
            state.page++;
            loadUsers();
        }
    });

    el.tbody.addEventListener("click", event => {
        const editButton = event.target.closest(".edit-user");
        const toggleButton = event.target.closest(".toggle-user");

        if (editButton) {
            openEditModal(Number(editButton.dataset.id));
        }

        if (toggleButton) {
            toggleUserStatus(
                Number(toggleButton.dataset.id),
                toggleButton.dataset.active === "true"
            );
        }
    });

    el.logout.addEventListener("click", logout);

    async function initialize() {
        if (!localStorage.getItem(TOKEN_KEY)) {
            window.location.assign("../../index.html");
            return;
        }

        try {
            await loadCurrentUser();
            await loadRoles();
            await loadUsers();
        } catch (error) {
            console.error("User management initialization failed:", error);
            showAlert(error.message || "Unable to initialize user management.");
        }
    }

    initialize();
})();
