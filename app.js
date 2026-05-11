// --- CONFIGURATION ---
const API_URL = "https://script.google.com/macros/s/AKfycbwjd5gcjvSdaRRLQJ11al0C9bd5UdNR-6B6R7w_3HkidR53SafLaXDUFrCgBlK_Rjrd/exec";

// --- STATE ---
let currentUser = null;
let inventoryData = [];
let equipmentData = [];

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    // Check if already logged in
    const storedUser = localStorage.getItem("labflow_user");
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        showApp();
    }

    // Login Form Listener
    document.getElementById("login-form").addEventListener("submit", handleLogin);
    
    // Log Movement Form Listener
    document.getElementById("log-form").addEventListener("submit", handleLogSubmit);
    
    // Dynamic Form Logic
    document.getElementById("log-action").addEventListener("change", (e) => {
        const sourceGroup = document.getElementById("source-group");
        if(e.target.value === "Out" || e.target.value === "Transfer") {
            sourceGroup.classList.remove("hidden");
        } else {
            sourceGroup.classList.add("hidden");
        }
    });
});

// --- API WRAPPER ---
async function apiCall(action, payload) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ action: action, payload: payload })
        });
        const result = await response.json();
        if (result.status === "error") throw new Error(result.message);
        return result.data;
    } catch (error) {
        console.error("API Error:", error);
        alert("Error: " + error.message);
        return null;
    }
}

// --- AUTHENTICATION ---
async function handleLogin(e) {
    e.preventDefault();
    const pin = document.getElementById("pin-input").value;
    const btn = document.getElementById("login-btn");
    const errorMsg = document.getElementById("login-error");
    
    btn.textContent = "Verifying...";
    btn.disabled = true;
    errorMsg.classList.add("hidden");

    const data = await apiCall("login", { pinCode: pin });

    if (data && data.user) {
        currentUser = data.user;
        localStorage.setItem("labflow_user", JSON.stringify(currentUser));
        showApp();
    } else {
        errorMsg.classList.remove("hidden");
    }
    
    btn.textContent = "Login";
    btn.disabled = false;
    document.getElementById("pin-input").value = "";
}

function logout() {
    localStorage.removeItem("labflow_user");
    currentUser = null;
    document.getElementById("app-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
}

function showApp() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");
    
    document.getElementById("display-user-name").textContent = currentUser.name.toUpperCase();
    document.getElementById("display-user-role").textContent = currentUser.role.toUpperCase();

    // Role Based UI
    if (currentUser.role === "Supervisor") {
        document.getElementById("main-nav").classList.remove("hidden");
        document.querySelector(".fab").classList.remove("hidden");
        switchTab('inventory');
        fetchData(); // Fetch data for supervisors
    } else {
        // Technician view
        document.getElementById("main-nav").classList.add("hidden");
        document.querySelector(".fab").classList.add("hidden");
        
        document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
        document.getElementById("tab-tech-only").classList.remove("hidden");
    }
}

// --- NAVIGATION ---
function switchTab(tabId) {
    // Update Nav UI
    document.querySelectorAll(".tab").forEach(el => el.classList.remove("active"));
    event.currentTarget.classList.add("active");

    // Update Content
    document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
    document.getElementById(`tab-${tabId}`).classList.remove("hidden");
}

// --- DATA FETCHING & RENDERING ---
async function fetchData() {
    if(currentUser.role !== "Supervisor") return;
    
    const refreshBtn = document.querySelector(".ph-arrows-clockwise").parentElement;
    refreshBtn.style.opacity = "0.5";

    const invResult = await apiCall("get_inventory", {});
    if (invResult) {
        inventoryData = invResult.inventory;
        renderInventory(inventoryData);
        renderAlerts(inventoryData);
    }

    const eqResult = await apiCall("get_equipment", {});
    if (eqResult) {
        equipmentData = eqResult.equipment;
        renderEquipment(equipmentData);
    }

    refreshBtn.style.opacity = "1";
}

function getRiskClass(grade) {
    if(grade === "Mild") return { border: "card-border-mild", badge: "safe" };
    if(grade === "Medium") return { border: "card-border-medium", badge: "warning" };
    return { border: "card-border-high", badge: "danger" };
}

function renderInventory(data) {
    const container = document.getElementById("inventory-list");
    container.innerHTML = "";

    if(data.length === 0) {
        container.innerHTML = "<p style='text-align:center; padding: 20px;'>No inventory data found.</p>";
        return;
    }

    data.forEach(item => {
        const risk = getRiskClass(item.dangerGrade);
        const card = document.createElement("div");
        card.className = `card ${risk.border}`;
        
        // Format expiry nicely
        const expDate = item.expiryDate ? new Date(item.expiryDate).toISOString().split('T')[0] : "N/A";

        card.innerHTML = `
            <div class="card-top">
                <span class="item-code">${item.itemCode}</span>
                <span class="badge ${risk.badge}">${item.dangerGrade} RISK</span>
            </div>
            <h3>${item.itemName}</h3>
            <div class="card-grid">
                <div class="grid-item">
                    <p>Location</p>
                    <div><i class="ph ph-map-pin"></i> ${item.lab} • ${item.closet}</div>
                </div>
                <div class="grid-item">
                    <p>Expiry</p>
                    <div><i class="ph ph-calendar-blank"></i> ${expDate}</div>
                </div>
            </div>
            <div class="card-bottom">
                <div class="qty">${item.totalRemaining} <span>${item.unit}</span></div>
                <button class="action-btn" onclick="openModal('${item.itemCode}')"><i class="ph ph-arrows-left-right"></i> ACTION</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderEquipment(data) {
    const container = document.getElementById("equipment-list");
    container.innerHTML = "";

    data.forEach(eq => {
        let badgeClass = "safe";
        if(eq.status === "Needs Repair") badgeClass = "danger";
        if(eq.status === "Under Maintenance") badgeClass = "warning";

        const lastCheck = eq.lastCheck ? new Date(eq.lastCheck).toISOString().split('T')[0] : "N/A";
        const nextCheck = eq.nextMaintenance ? new Date(eq.nextMaintenance).toISOString().split('T')[0] : "N/A";

        const card = document.createElement("div");
        card.className = `card`;
        card.innerHTML = `
            <div class="card-top">
                <span class="item-code">${eq.id}</span>
                <span class="badge ${badgeClass}"><i class="ph ph-check-circle"></i> ${eq.status}</span>
            </div>
            <h3>${eq.name}</h3>
            <div class="card-grid">
                <div class="grid-item">
                    <p>Location</p>
                    <div><i class="ph ph-map-pin"></i> ${eq.location}</div>
                </div>
                <div class="grid-item">
                    <p>Maintainer</p>
                    <div><i class="ph ph-user"></i> ${eq.maintainedBy || "Unassigned"}</div>
                </div>
                <div class="grid-item">
                    <p>Last Check</p>
                    <div><i class="ph ph-clock-counter-clockwise"></i> ${lastCheck}</div>
                </div>
                <div class="grid-item">
                    <p>Next Due</p>
                    <div><i class="ph ph-calendar-star"></i> ${nextCheck}</div>
                </div>
            </div>
            <button class="action-btn outline"><i class="ph ph-gear"></i> Management Actions</button>
        `;
        container.appendChild(card);
    });
}

function renderAlerts(data) {
    const container = document.getElementById("alerts-list");
    container.innerHTML = "";
    
    const today = new Date();
    today.setHours(0,0,0,0);

    // Filter items expiring in <= 90 days
    const alerts = data.filter(item => {
        if(!item.expiryDate) return false;
        const exp = new Date(item.expiryDate);
        const daysLeft = (exp - today) / (1000 * 60 * 60 * 24);
        return daysLeft <= 90;
    });

    if(alerts.length === 0) {
        container.innerHTML = "<p style='text-align:center; padding: 20px;'>No critical expiry alerts.</p>";
        return;
    }

    alerts.forEach(item => {
        const expDate = new Date(item.expiryDate).toISOString().split('T')[0];
        const card = document.createElement("div");
        card.className = `card card-border-high`;
        card.innerHTML = `
            <div style="display:flex; align-items:center; gap: 15px;">
                <div style="font-size: 32px; color: var(--status-red-text);"><i class="ph ph-warning-circle"></i></div>
                <div style="flex: 1;">
                    <span class="item-code">${item.itemCode}</span>
                    <h3 style="margin-bottom: 5px; font-size: 16px;">${item.itemName}</h3>
                    <p style="text-transform: none; font-size: 12px;"><i class="ph ph-map-pin"></i> ${item.lab} • ${item.closet}</p>
                </div>
                <div style="text-align: right;">
                    <div style="color: var(--status-red-text); font-weight: 800; font-size: 10px;">EXPIRES SOON</div>
                    <div style="font-weight: 800; font-size: 16px;">${expDate}</div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function filterInventory() {
    const query = document.getElementById("search-input").value.toLowerCase();
    const filtered = inventoryData.filter(item => 
        item.itemName.toLowerCase().includes(query) || 
        item.itemCode.toLowerCase().includes(query) ||
        item.lab.toLowerCase().includes(query)
    );
    renderInventory(filtered);
}

// --- MODAL LOGIC ---
function openModal(prefillCode = "") {
    document.getElementById("log-modal").classList.remove("hidden");
    if(prefillCode) {
        document.getElementById("log-item").value = prefillCode;
    }
}

function closeModal() {
    document.getElementById("log-modal").classList.add("hidden");
    document.getElementById("log-form").reset();
}

async function handleLogSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById("submit-log-btn");
    btn.textContent = "Submitting...";
    btn.disabled = true;

    // Helper to split "Lab 1 • Closet 2" safely
    const splitLoc = (str) => {
        if(!str) return ["", ""];
        const parts = str.split("•").map(s => s.trim());
        return [parts[0] || "", parts[1] || ""];
    };

    const destParts = splitLoc(document.getElementById("log-dest").value);
    const sourceParts = splitLoc(document.getElementById("log-source").value);

    const payload = {
        action: document.getElementById("log-action").value,
        itemCode: document.getElementById("log-item").value.toUpperCase(),
        amount: document.getElementById("log-amount").value,
        unit: document.getElementById("log-unit").value,
        destLab: destParts[0],
        destCloset: destParts[1],
        sourceLab: sourceParts[0],
        sourceCloset: sourceParts[1],
        expDate: document.getElementById("log-exp").value,
        techName: currentUser.name // From logged in state!
    };

    const result = await apiCall("submit_log", payload);

    if (result) {
        alert("Success: " + result.message);
        closeModal();
        if(currentUser.role === "Supervisor") fetchData(); // refresh data
    }

    btn.textContent = "Submit Log";
    btn.disabled = false;
}
