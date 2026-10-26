
/**
 * JobTrack - Inventory Staff Materials Page
 *
 * API contract: jobtrack-openapi-v5.yaml
 *
 * GET    /materials?q=&is_low_stock=&page=&per_page=
 * GET    /materials/{materialId}
 * POST   /materials
 * PATCH  /materials/{materialId}
 * POST   /materials/{materialId}/stock-adjustments
 *
 * The shared app.js is expected to provide window.apiRequest(path, options).
 */

document.addEventListener("DOMContentLoaded", () => {
    const state = {
        materials: [],
        page: 1,
        perPage: 10,
        total: 0,
        lastPage: 1,
        search: "",
        lowStockOnly: false,
        editingMaterialId: null,
        adjustingMaterial: null,
        busy: false
    };

    const elements = {
        pageAlert: document.getElementById("inventoryPageAlert"),
        formAlert: document.getElementById("materialFormAlert"),
        adjustmentAlert: document.getElementById("stockAdjustmentAlert"),

        sidebarName: document.getElementById("inventorySidebarUserName"),
        topbarName: document.getElementById("inventoryTopbarUserName"),
        unreadBadge: document.getElementById("inventorySidebarUnreadCount"),

        searchForm: document.getElementById("inventorySearchForm"),
        searchInput: document.getElementById("inventorySearchInput"),
        stockFilter: document.getElementById("inventoryStockFilter"),
        resetFiltersButton: document.getElementById(
            "resetInventoryFiltersButton"
        ),
        perPageSelect: document.getElementById("inventoryPerPageSelect"),
        refreshButton: document.getElementById("refreshInventoryButton"),

        itemCount: document.getElementById("inventoryPageItemCount"),
        lowStockCount: document.getElementById(
            "inventoryPageLowStockCount"
        ),

        loading: document.getElementById("inventoryTableLoading"),
        emptyState: document.getElementById("inventoryTableEmptyState"),
        tableContainer: document.getElementById("inventoryTableContainer"),
        tableBody: document.getElementById("inventoryTableBody"),
        paginationInfo: document.getElementById("inventoryPaginationInfo"),
        previousButton: document.getElementById(
            "previousInventoryPageButton"
        ),
        nextButton: document.getElementById("nextInventoryPageButton"),

        addButton: document.getElementById("addMaterialButton"),
        materialForm: document.getElementById("materialForm"),
        materialModalTitle: document.getElementById("materialFormModalTitle"),
        saveMaterialButton: document.getElementById("saveMaterialButton"),
        materialName: document.getElementById("materialNameInput"),
        materialSku: document.getElementById("materialSkuInput"),
        materialUnit: document.getElementById("materialUnitInput"),
        materialUnitCost: document.getElementById("materialUnitCostInput"),
        materialCurrentStock: document.getElementById(
            "materialCurrentStockInput"
        ),
        materialReorderLevel: document.getElementById(
            "materialReorderLevelInput"
        ),

        adjustmentForm: document.getElementById("stockAdjustmentForm"),
        adjustmentName: document.getElementById(
            "stockAdjustmentMaterialName"
        ),
        adjustmentCurrentStock: document.getElementById(
            "stockAdjustmentCurrentStock"
        ),
        adjustmentDelta: document.getElementById("stockQuantityDeltaInput"),
        adjustmentReason: document.getElementById(
            "stockAdjustmentReasonInput"
        ),
        saveAdjustmentButton: document.getElementById(
            "saveStockAdjustmentButton"
        ),

        logoutButton: document.getElementById("logoutButton")
    };

    const materialModalElement = document.getElementById("materialFormModal");
    const adjustmentModalElement = document.getElementById(
        "stockAdjustmentModal"
    );

    const materialModal = materialModalElement && window.bootstrap
        ? window.bootstrap.Modal.getOrCreateInstance(materialModalElement)
        : null;

    const adjustmentModal = adjustmentModalElement && window.bootstrap
        ? window.bootstrap.Modal.getOrCreateInstance(adjustmentModalElement)
        : null;

    function showAlert(element, message, type = "warning") {
        if (!element) return;

        element.textContent = message;
        element.className = `alert alert-${type}`;
        element.classList.remove("d-none");
    }

    function hideAlert(element) {
        if (!element) return;

        element.textContent = "";
        element.classList.add("d-none");
    }

    function showPageAlert(message, type = "warning") {
        showAlert(elements.pageAlert, message, type);
    }

    function unwrapData(response) {
        if (
            response &&
            typeof response === "object" &&
            Object.prototype.hasOwnProperty.call(response, "data")
        ) {
            return response.data;
        }

        return response;
    }

    function getErrorMessage(error) {
        if (error?.data?.message) {
            return error.data.message;
        }

        if (error?.response?.data?.message) {
            return error.response.data.message;
        }

        if (error?.message) {
            return error.message;
        }

        return "An unexpected error occurred. Please try again.";
    }

    function getValidationMessage(error) {
        const errors =
            error?.data?.errors ??
            error?.response?.data?.errors;

        if (errors && typeof errors === "object") {
            return Object.values(errors)
                .flat()
                .filter(Boolean)
                .join(" ");
        }

        return getErrorMessage(error);
    }

    function formatCurrency(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) return "—";

        return new Intl.NumberFormat("en-PH", {
            style: "currency",
            currency: "PHP",
            minimumFractionDigits: 2
        }).format(number);
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function getDisplayName(user) {
        if (!user || typeof user !== "object") {
            return "Inventory Staff";
        }

        return (
            user.full_name ??
            user.name ??
            [user.first_name, user.last_name].filter(Boolean).join(" ") ??
            "Inventory Staff"
        ) || "Inventory Staff";
    }

    function renderUser(user) {
        const name = getDisplayName(user);

        if (elements.sidebarName) {
            elements.sidebarName.textContent = name;
        }

        if (elements.topbarName) {
            elements.topbarName.textContent = name;
        }
    }

    function renderUnreadBadge(count) {
        if (!elements.unreadBadge) return;

        const number = Number(count);

        if (!Number.isFinite(number) || number <= 0) {
            elements.unreadBadge.classList.add("d-none");
            return;
        }

        elements.unreadBadge.textContent = number > 99
            ? "99+"
            : String(number);

        elements.unreadBadge.classList.remove("d-none");
    }

    async function loadUserAndNotifications() {
        const userResponse = await window.apiRequest("/auth/me");
        const userPayload = unwrapData(userResponse);
        const user = userPayload?.user ?? userPayload;

        if (user && typeof user === "object") {
            renderUser(user);
        }

        try {
            const notificationResponse = await window.apiRequest(
                "/notifications?page=1&per_page=1"
            );

            const payload = unwrapData(notificationResponse);
            const meta =
                notificationResponse?.meta ??
                payload?.meta;

            renderUnreadBadge(meta?.unread_count);
        } catch (error) {
            // Notification availability should not prevent inventory use.
            console.warn("Could not load notification count:", error);
            renderUnreadBadge(null);
        }
    }

    function setLoading(isLoading) {
        state.busy = isLoading;

        if (elements.loading) {
            elements.loading.classList.toggle("d-none", !isLoading);

            if (isLoading) {
                elements.loading.textContent = "Loading inventory...";
            }
        }

        if (elements.previousButton) {
            elements.previousButton.disabled =
                isLoading || state.page <= 1;
        }

        if (elements.nextButton) {
            elements.nextButton.disabled =
                isLoading || state.page >= state.lastPage;
        }

        if (elements.addButton) {
            elements.addButton.disabled = isLoading;
        }
    }

    function renderMaterials() {
        const materials = state.materials;

        if (elements.tableBody) {
            elements.tableBody.replaceChildren();
        }

        if (elements.itemCount) {
            elements.itemCount.textContent = String(materials.length);
        }

        if (elements.lowStockCount) {
            elements.lowStockCount.textContent = String(
                materials.filter((material) =>
                    material.is_low_stock === true
                ).length
            );
        }

        elements.tableContainer?.classList.toggle(
            "d-none",
            materials.length === 0
        );

        elements.emptyState?.classList.toggle(
            "d-none",
            materials.length !== 0
        );

        if (materials.length === 0 && elements.emptyState) {
            const heading = elements.emptyState.querySelector("h5");
            const message = elements.emptyState.querySelector("p");

            if (heading) heading.textContent = "No materials found";
            if (message) {
                message.textContent =
                    "Try another search or add a material.";
            }
        }

        if (elements.tableBody) {
            for (const material of materials) {
                const lowStock = material.is_low_stock === true;
                const row = document.createElement("tr");

                row.innerHTML = `
                    <td>
                        <strong>${escapeHtml(material.material_name)}</strong>
                        <div class="text-muted small">
                            ID: ${escapeHtml(material.material_id)}
                        </div>
                    </td>
                    <td>${escapeHtml(material.sku)}</td>
                    <td>${escapeHtml(material.unit_of_measure)}</td>
                    <td>${escapeHtml(formatCurrency(material.unit_cost))}</td>
                    <td>${escapeHtml(material.current_stock)}</td>
                    <td>${escapeHtml(material.reorder_level)}</td>
                    <td>
                        <span class="badge ${
                            lowStock ? "bg-danger" : "bg-success"
                        }">
                            ${lowStock ? "Low Stock" : "In Stock"}
                        </span>
                    </td>
                    <td>
                        <div class="d-flex gap-2 flex-wrap">
                            <button
                                type="button"
                                class="btn btn-outline-primary btn-sm"
                                data-action="edit"
                                data-id="${escapeHtml(material.material_id)}"
                            >Edit</button>
                            <button
                                type="button"
                                class="btn btn-outline-secondary btn-sm"
                                data-action="adjust"
                                data-id="${escapeHtml(material.material_id)}"
                            >Adjust Stock</button>
                        </div>
                    </td>
                `;

                elements.tableBody.appendChild(row);
            }
        }

        const start = state.total === 0
            ? 0
            : ((state.page - 1) * state.perPage) + 1;

        const end = Math.min(state.page * state.perPage, state.total);

        if (elements.paginationInfo) {
            elements.paginationInfo.textContent =
                `Showing ${start}–${end} of ${state.total} materials` +
                ` · Page ${state.page} of ${state.lastPage}`;
        }

        if (elements.previousButton) {
            elements.previousButton.disabled =
                state.busy || state.page <= 1;
        }

        if (elements.nextButton) {
            elements.nextButton.disabled =
                state.busy || state.page >= state.lastPage;
        }
    }

    async function loadMaterials() {
        if (typeof window.apiRequest !== "function") {
            showPageAlert(
                "The shared API helper is unavailable. Check app.js.",
                "danger"
            );
            return;
        }

        hideAlert(elements.pageAlert);
        setLoading(true);

        if (elements.emptyState) {
            elements.emptyState.classList.add("d-none");
        }

        if (elements.tableContainer) {
            elements.tableContainer.classList.add("d-none");
        }

        const params = new URLSearchParams();
        params.set("page", String(state.page));
        params.set("per_page", String(state.perPage));

        if (state.search) {
            params.set("q", state.search);
        }

        if (state.lowStockOnly) {
            params.set("is_low_stock", "true");
        }

        try {
            const response = await window.apiRequest(
                `/materials?${params.toString()}`
            );

            const payload = unwrapData(response);

            if (!Array.isArray(payload)) {
                throw new Error(
                    "Unexpected materials response. Expected a paginated data array."
                );
            }

            // Contract response: { data: [...], meta: PageMeta }
            // meta may be on the envelope, depending on apiRequest behavior.
            const meta =
                response?.meta ??
                payload?.meta ??
                null;

            state.materials = payload;
            state.total = Number(meta?.total ?? payload.length);
            state.lastPage = Math.max(
                1,
                Number(meta?.last_page ?? 1)
            );

            // If a page becomes invalid after a filter change, return to page 1.
            if (state.page > state.lastPage) {
                state.page = state.lastPage;
                setLoading(false);
                await loadMaterials();
                return;
            }

            renderMaterials();
        } catch (error) {
            console.error("Unable to load materials:", error);

            state.materials = [];
            state.total = 0;
            state.lastPage = 1;

            renderMaterials();

            showPageAlert(
                `Unable to load materials. ${getErrorMessage(error)}`,
                "danger"
            );
        } finally {
            setLoading(false);
            renderMaterials();
        }
    }

    function resetMaterialForm() {
        state.editingMaterialId = null;

        elements.materialForm?.reset();

        if (elements.materialCurrentStock) {
            elements.materialCurrentStock.value = "0";
            elements.materialCurrentStock.disabled = false;
        }

        if (elements.materialReorderLevel) {
            elements.materialReorderLevel.value = "0";
        }

        if (elements.materialModalTitle) {
            elements.materialModalTitle.textContent = "Add Material";
        }

        if (elements.saveMaterialButton) {
            elements.saveMaterialButton.textContent = "Save Material";
            elements.saveMaterialButton.disabled = false;
        }

        hideAlert(elements.formAlert);
    }

    function openAddMaterialModal() {
        resetMaterialForm();

        if (!materialModal) {
            showPageAlert(
                "The Bootstrap modal could not be initialized.",
                "danger"
            );
            return;
        }

        materialModal.show();
    }

    async function openEditMaterialModal(materialId) {
        hideAlert(elements.formAlert);
        resetMaterialForm();

        if (!materialModal) {
            showPageAlert(
                "The Bootstrap modal could not be initialized.",
                "danger"
            );
            return;
        }

        if (elements.materialModalTitle) {
            elements.materialModalTitle.textContent = "Edit Material";
        }

        if (elements.saveMaterialButton) {
            elements.saveMaterialButton.disabled = true;
            elements.saveMaterialButton.textContent = "Loading...";
        }

        materialModal.show();

        try {
            const response = await window.apiRequest(
                `/materials/${encodeURIComponent(materialId)}`
            );

            const material = unwrapData(response);

            if (!material || typeof material !== "object") {
                throw new Error("The material response was invalid.");
            }

            state.editingMaterialId = material.material_id;

            elements.materialName.value = material.material_name ?? "";
            elements.materialSku.value = material.sku ?? "";
            elements.materialUnit.value = material.unit_of_measure ?? "";
            elements.materialUnitCost.value = material.unit_cost ?? "";
            elements.materialReorderLevel.value =
                material.reorder_level ?? 0;

            // The API contract says existing stock cannot be changed by PATCH.
            elements.materialCurrentStock.value =
                material.current_stock ?? 0;
            elements.materialCurrentStock.disabled = true;

            if (elements.saveMaterialButton) {
                elements.saveMaterialButton.textContent = "Save Changes";
            }
        } catch (error) {
            console.error("Unable to retrieve material:", error);

            showAlert(
                elements.formAlert,
                `Unable to load material. ${getErrorMessage(error)}`,
                "danger"
            );
        } finally {
            if (elements.saveMaterialButton) {
                elements.saveMaterialButton.disabled = false;
                elements.saveMaterialButton.textContent =
                    state.editingMaterialId
                        ? "Save Changes"
                        : "Save Material";
            }
        }
    }

    function parseNonNegativeNumber(value, label, integerOnly = false) {
        const number = Number(value);

        if (
            !Number.isFinite(number) ||
            number < 0 ||
            (integerOnly && !Number.isInteger(number))
        ) {
            throw new Error(
                `${label} must be a valid non-negative` +
                `${integerOnly ? " whole number." : " number."}`
            );
        }

        return number;
    }

    async function saveMaterial(event) {
        event.preventDefault();
        hideAlert(elements.formAlert);

        if (!elements.materialForm?.reportValidity()) {
            return;
        }

        const isEditing = state.editingMaterialId !== null;

        try {
            const body = {
                material_name: elements.materialName.value.trim(),
                sku: elements.materialSku.value.trim(),
                unit_of_measure: elements.materialUnit.value.trim(),
                unit_cost: parseNonNegativeNumber(
                    elements.materialUnitCost.value,
                    "Unit cost"
                ),
                reorder_level: parseNonNegativeNumber(
                    elements.materialReorderLevel.value,
                    "Reorder level",
                    true
                )
            };

            if (!body.material_name || !body.sku || !body.unit_of_measure) {
                throw new Error(
                    "Material name, SKU, and unit of measure are required."
                );
            }

            let path = "/materials";
            let method = "POST";

            if (isEditing) {
                path = `/materials/${encodeURIComponent(
                    state.editingMaterialId
                )}`;
                method = "PATCH";

                // Never send current_stock in a material PATCH request.
            } else {
                body.current_stock = parseNonNegativeNumber(
                    elements.materialCurrentStock.value || "0",
                    "Initial stock",
                    true
                );
            }

            elements.saveMaterialButton.disabled = true;
            elements.saveMaterialButton.textContent = "Saving...";

            await window.apiRequest(path, {
                method,
                body
            });

            materialModal?.hide();

            showPageAlert(
                isEditing
                    ? "Material details updated successfully."
                    : "Material added successfully.",
                "success"
            );

            await loadMaterials();
        } catch (error) {
            console.error("Unable to save material:", error);

            showAlert(
                elements.formAlert,
                getValidationMessage(error),
                "danger"
            );
        } finally {
            if (elements.saveMaterialButton) {
                elements.saveMaterialButton.disabled = false;
                elements.saveMaterialButton.textContent =
                    state.editingMaterialId !== null
                        ? "Save Changes"
                        : "Save Material";
            }
        }
    }

    function openStockAdjustmentModal(material) {
        state.adjustingMaterial = material;

        hideAlert(elements.adjustmentAlert);
        elements.adjustmentForm?.reset();

        if (elements.adjustmentName) {
            elements.adjustmentName.textContent = material.material_name;
        }

        if (elements.adjustmentCurrentStock) {
            elements.adjustmentCurrentStock.textContent =
                String(material.current_stock);
        }

        if (elements.adjustmentDelta) {
            elements.adjustmentDelta.value = "";
        }

        if (elements.adjustmentReason) {
            elements.adjustmentReason.value = "";
        }

        if (!adjustmentModal) {
            showPageAlert(
                "The Bootstrap modal could not be initialized.",
                "danger"
            );
            return;
        }

        adjustmentModal.show();
    }

    async function saveStockAdjustment(event) {
        event.preventDefault();
        hideAlert(elements.adjustmentAlert);

        if (!state.adjustingMaterial) {
            showAlert(
                elements.adjustmentAlert,
                "Select a material before adjusting stock.",
                "danger"
            );
            return;
        }

        if (!elements.adjustmentForm?.reportValidity()) {
            return;
        }

        const delta = Number(elements.adjustmentDelta.value);
        const reason = elements.adjustmentReason.value.trim();

        if (!Number.isInteger(delta) || delta === 0) {
            showAlert(
                elements.adjustmentAlert,
                "Quantity change must be a non-zero whole number.",
                "danger"
            );
            return;
        }

        if (!reason) {
            showAlert(
                elements.adjustmentAlert,
                "Please provide a reason for the stock adjustment.",
                "danger"
            );
            return;
        }

        const material = state.adjustingMaterial;

        elements.saveAdjustmentButton.disabled = true;
        elements.saveAdjustmentButton.textContent = "Applying...";

        try {
            await window.apiRequest(
                `/materials/${encodeURIComponent(
                    material.material_id
                )}/stock-adjustments`,
                {
                    method: "POST",
                    body: {
                        quantity_delta: delta,
                        reason
                    }
                }
            );

            adjustmentModal?.hide();

            showPageAlert(
                "Stock adjustment applied successfully.",
                "success"
            );

            await loadMaterials();
        } catch (error) {
            console.error("Unable to adjust stock:", error);

            showAlert(
                elements.adjustmentAlert,
                getValidationMessage(error),
                "danger"
            );
        } finally {
            elements.saveAdjustmentButton.disabled = false;
            elements.saveAdjustmentButton.textContent =
                "Apply Adjustment";
        }
    }

    function handleTableAction(event) {
        const button = event.target.closest("button[data-action][data-id]");

        if (!button || !elements.tableBody?.contains(button)) {
            return;
        }

        const materialId = button.dataset.id;
        const action = button.dataset.action;

        const material = state.materials.find(
            (item) => String(item.material_id) === String(materialId)
        );

        if (!material) {
            showPageAlert(
                "The selected material is no longer on this page. Refresh and try again.",
                "warning"
            );
            return;
        }

        if (action === "edit") {
            openEditMaterialModal(materialId);
        } else if (action === "adjust") {
            openStockAdjustmentModal(material);
        }
    }

    function applyFilters() {
        state.search = elements.searchInput.value.trim();
        state.lowStockOnly = elements.stockFilter.value === "low";
        state.page = 1;

        loadMaterials();
    }

    function resetFilters() {
        elements.searchInput.value = "";
        elements.stockFilter.value = "all";

        state.search = "";
        state.lowStockOnly = false;
        state.page = 1;

        loadMaterials();
    }

    function handleLogout() {
        if (typeof window.logoutUser === "function") {
            window.logoutUser();
            return;
        }

        if (typeof window.redirectToLogin === "function") {
            window.redirectToLogin();
            return;
        }

        showPageAlert(
            "The shared logout function is unavailable. Check app.js.",
            "danger"
        );
    }

    function bindEvents() {
        elements.searchForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            applyFilters();
        });

        elements.resetFiltersButton?.addEventListener(
            "click",
            resetFilters
        );

        elements.perPageSelect?.addEventListener("change", () => {
            state.perPage = Number(elements.perPageSelect.value) || 10;
            state.page = 1;
            loadMaterials();
        });

        elements.previousButton?.addEventListener("click", () => {
            if (state.page > 1 && !state.busy) {
                state.page -= 1;
                loadMaterials();
            }
        });

        elements.nextButton?.addEventListener("click", () => {
            if (state.page < state.lastPage && !state.busy) {
                state.page += 1;
                loadMaterials();
            }
        });

        elements.addButton?.addEventListener(
            "click",
            openAddMaterialModal
        );

        elements.materialForm?.addEventListener(
            "submit",
            saveMaterial
        );

        elements.adjustmentForm?.addEventListener(
            "submit",
            saveStockAdjustment
        );

        elements.tableBody?.addEventListener(
            "click",
            handleTableAction
        );

        elements.logoutButton?.addEventListener(
            "click",
            handleLogout
        );
    }

    async function initialize() {
        if (
            typeof AUTH_TOKEN_KEY !== "undefined" &&
            !localStorage.getItem(AUTH_TOKEN_KEY)
        ) {
            if (typeof window.redirectToLogin === "function") {
                window.redirectToLogin();
                return;
            }
        }

        if (typeof window.apiRequest !== "function") {
            showPageAlert(
                "The shared API helper is unavailable. Ensure app.js loads before inventory.js.",
                "danger"
            );
            setLoading(false);
            return;
        }

        bindEvents();

        try {
            await loadUserAndNotifications();
        } catch (error) {
            console.error("Unable to initialize account information:", error);

            showPageAlert(
                "Account information could not be loaded. The inventory API may also be unavailable.",
                "warning"
            );
        }

        await loadMaterials();
    }

    initialize();
});
