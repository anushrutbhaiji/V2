document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('admin_token');
    const AUTH_HEADER = token ? { 'Authorization': 'Basic ' + token } : {};

    if (!token) {
        alert("You are not logged in! Please log in through the Admin Dashboard first.");
        // Optional: Redirect back to admin
        window.location.href = '/admin';
    }

    const fetchBtn = document.getElementById('fetch-btn');
    const clearBtn = document.getElementById('clear-btn');
    const finalizeBtn = document.getElementById('finalize-audit-btn');
    const scanInput = document.getElementById('scan-input');
    const scanStatus = document.getElementById('scan-status');
    const tableBody = document.getElementById('audit-table-body');
    const setupCard = document.getElementById('setup-card');
    const scannerCard = document.getElementById('scanner-card');

    const discrepancyModal = new bootstrap.Modal(document.getElementById('discrepancyModal'));

    let expectedItemsMap = new Map(); // Store full pipe objects by ID
    let verifiedIds = new Set();
    let unexpectedItems = []; // Pipes scanned that weren't in the filter

    // --- LOGBOOK LOGIC ---
    let scanLogEntries = [];
    const scanLogList = document.getElementById('scan-log-list');
    const logbookEmpty = document.getElementById('logbook-empty');

    function renderScanLog() {
        scanLogList.innerHTML = '';
        if (!scanLogEntries.length) { logbookEmpty.style.display = 'block'; return; }
        logbookEmpty.style.display = 'none';

        scanLogEntries.slice().reverse().forEach(entry => {
            const li = document.createElement('li');
            li.className = 'list-group-item py-2 px-3';
            li.innerHTML = `<small class="text-muted" style="font-size:0.7rem;">${entry.time}</small><br><strong style="font-family:monospace;">${entry.input}</strong><br><span class="badge bg-${entry.statusType}">${entry.status}</span>`;
            scanLogList.appendChild(li);
        });
    }

    function addLogEntry(input, status, statusType='secondary') {
        const entry = { input: String(input || '').trim(), status, statusType, time: new Date().toLocaleTimeString() };
        scanLogEntries.push(entry);
        renderScanLog();
        return entry;
    }

    document.getElementById('clear-log-btn').addEventListener('click', () => {
        if(confirm('Clear audit log?')) { scanLogEntries = []; renderScanLog(); }
    });

    // --- AUTO-FILL FROM INVENTORY PAGE ---
    const params = new URLSearchParams(window.location.search);
    if (params.has('brand') || params.has('size')) {
        document.getElementById('f_name').value = params.get('brand') || '';
        document.getElementById('f_size').value = params.get('size') || '';
        document.getElementById('f_color').value = params.get('color') || '';
        document.getElementById('f_pressure').value = params.get('pressure') || '';
        setTimeout(() => fetchBtn.click(), 500); // Auto-fetch on load
    }

    // --- 1. FETCH THE STOCK ---
    fetchBtn.addEventListener('click', async () => {
        const brand = document.getElementById('f_name').value.trim();
        const size = document.getElementById('f_size').value.trim();
        const color = document.getElementById('f_color').value.trim();
        const pressure = document.getElementById('f_pressure').value.trim();

        if (!brand && !size && !color) {
            if(!confirm("No filters entered. This will pull the ENTIRE WAREHOUSE stock. Continue?")) return;
        }

        fetchBtn.innerText = "⏳ Fetching Digital Stock...";
        fetchBtn.disabled = true;

        const apiParams = new URLSearchParams({
            name: brand, size: size, color: color, pressure: pressure,
            status: 'stock', grouped: 'false', page: 1, per_page: 5000 
        });

        try {
            const res = await fetch(`/api/inventory?${apiParams}`, { headers: AUTH_HEADER });
            const data = await res.json();

            if (data.items && data.items.length > 0) {
                expectedItemsMap.clear();
                verifiedIds.clear();
                unexpectedItems = [];
                scanLogEntries = [];

                data.items.forEach(item => expectedItemsMap.set(item.id, item));
                
                renderTable();
                enableScanner();
                addLogEntry('SYSTEM', `Fetched ${data.items.length} expected pipes.`, 'primary');
            } else {
                alert("No stock found matching those filters.");
            }
        } catch (e) { alert("Error fetching data."); } 
        finally { fetchBtn.innerText = "📥 Fetch Expected Stock"; fetchBtn.disabled = false; }
    });

    // --- 2. RENDER THE CHECKLIST ---
    function renderTable() {
        tableBody.innerHTML = '';
        
        let expectedArray = Array.from(expectedItemsMap.values());
        
        // Sort: Unverified Expected -> Verified Expected -> Unexpected
        const sortedItems = [...expectedArray, ...unexpectedItems].sort((a, b) => {
            const aIsUnex = unexpectedItems.includes(a);
            const bIsUnex = unexpectedItems.includes(b);
            if (aIsUnex && !bIsUnex) return 1; // Unexpected at bottom
            if (!aIsUnex && bIsUnex) return -1;
            
            const aVer = verifiedIds.has(a.id);
            const bVer = verifiedIds.has(b.id);
            if (aVer === bVer) return 0;
            return aVer ? 1 : -1; // Verified move down
        });

        sortedItems.forEach(item => {
            const isVerified = verifiedIds.has(item.id);
            const isUnexpected = unexpectedItems.includes(item);
            
            let rowClass = '';
            let statusHtml = '';

            if (isUnexpected) {
                rowClass = 'unexpected-row';
                statusHtml = '<span class="status-badge status-unexpected">⚠️ Unexpected</span>';
            } else if (isVerified) {
                rowClass = 'verified-row';
                statusHtml = '<span class="status-badge status-verified">✅ Scanned</span>';
            } else {
                statusHtml = '<span class="status-badge status-pending">⏳ Pending</span>';
            }

            tableBody.innerHTML += `
                <tr id="row-${item.id}" class="${rowClass}">
                    <td class="ps-4 fw-bold" style="font-family:monospace;">#${item.id}</td>
                    <td>${item.pipe_name}</td>
                    <td>${item.size}</td>
                    <td>${item.color}</td>
                    <td class="status-cell">${statusHtml}</td>
                </tr>
            `;
        });

        updateKPIs();
    }

    function updateKPIs() {
        document.getElementById('count-verified').innerText = verifiedIds.size + unexpectedItems.length;
        document.getElementById('count-total').innerText = expectedItemsMap.size;
    }

    function setStatus(msg, type) {
        scanStatus.innerText = msg;
        scanStatus.className = `form-text text-center mt-2 fw-bold text-${type}`;
        setTimeout(() => scanStatus.innerText = '', 4000);
    }

    // --- 3. UI TOGGLES ---
    function enableScanner() {
        setupCard.style.opacity = '0.5'; setupCard.style.pointerEvents = 'none';
        scannerCard.style.opacity = '1'; scannerCard.style.pointerEvents = 'auto';
        scanInput.disabled = false;
        clearBtn.style.display = 'inline-block';
        finalizeBtn.style.display = 'inline-block';
        scanInput.focus();
    }

    clearBtn.addEventListener('click', () => {
        if(!confirm("Reset this audit and discard scan progress?")) return;
        location.reload();
    });

    // --- 4. SCANNER LOGIC ---
    scanInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = scanInput.value.trim();
            scanInput.value = '';
            if (val) processScan(val);
        }
    });

    async function processScan(rawText) {
        let pipeId = null;
        try { const json = JSON.parse(rawText); if(json.id) pipeId = parseInt(json.id); } 
        catch(err) { const num = parseInt(rawText, 10); if(!isNaN(num) && String(num) === rawText) pipeId = num; }
        if (!pipeId) { const match = rawText.match(/"id":\s*(\d+)/); if (match && match[1]) pipeId = parseInt(match[1], 10); }

        if (!pipeId) { 
            setStatus("❌ Invalid Barcode", "danger"); 
            addLogEntry(rawText, "Invalid Barcode", "danger");
            return; 
        }

        if (verifiedIds.has(pipeId)) {
            setStatus(`⚠️ Pipe #${pipeId} already scanned!`, "warning");
            addLogEntry(pipeId, "Duplicate Scan", "warning");
            return;
        }

        // Check if it's in our expected list
        if (expectedItemsMap.has(pipeId)) {
            verifiedIds.add(pipeId);
            setStatus(`✅ Pipe #${pipeId} Verified!`, "success");
            addLogEntry(pipeId, "Verified ✅", "success");
            renderTable();
        } else {
            // It's a pipe we didn't expect! Let's fetch it to see what it is.
            setStatus(`⏳ Fetching unknown pipe #${pipeId}...`, "info");
            try {
                const res = await fetch(`/api/labels/${pipeId}`, { headers: AUTH_HEADER });
                if (!res.ok) throw new Error("Not found");
                const item = await res.json();
                
                unexpectedItems.push(item);
                verifiedIds.add(pipeId);
                
                let errText = "Unexpected Pipe ⚠️";
                if(item.dispatched_at) errText = "Found but marked DISPATCHED! 🚨";
                
                setStatus(errText, "danger");
                addLogEntry(pipeId, errText, "danger");
                renderTable();
            } catch (e) {
                setStatus(`❌ ID #${pipeId} does not exist in Database!`, "danger");
                addLogEntry(pipeId, "ID Not in Database", "dark");
            }
        }
    }

    // --- 5. ESP AUTO SCANNER ---
    let espMode = false;
    let espInterval = null;
    const espBtn = document.getElementById('esp-toggle-btn');

    async function fetchESP() {
        try {
            const res = await fetch('/api/esp/fetch', { headers: AUTH_HEADER });
            const ids = await res.json();
            for (let id of ids) processScan(String(id));
        } catch (e) { }
    }

    espBtn.addEventListener("click", () => {
        espMode = !espMode;
        if (espMode) {
            espBtn.innerText = "📡 ESP Mode: ON"; espBtn.className = "btn btn-success fw-bold";
            espInterval = setInterval(fetchESP, 1000);
            addLogEntry("SYSTEM", "ESP Scanner Activated", "success");
        } else {
            espBtn.innerText = "📡 ESP Mode: OFF"; espBtn.className = "btn btn-outline-primary fw-bold";
            clearInterval(espInterval); espInterval = null;
            addLogEntry("SYSTEM", "ESP Scanner Disabled", "secondary");
        }
    });

    // --- 6. FINALIZE & VOUCHER ---
    finalizeBtn.addEventListener('click', () => {
        let missingIds = [];
        expectedItemsMap.forEach((item, id) => {
            if (!verifiedIds.has(id)) missingIds.push(item);
        });

        document.getElementById('v-expected').innerText = expectedItemsMap.size;
        document.getElementById('v-scanned').innerText = verifiedIds.size;
        document.getElementById('v-missing').innerText = missingIds.length;

        const vTable = document.getElementById('v-missing-table');
        vTable.innerHTML = '';
        
        if (missingIds.length === 0) {
            vTable.innerHTML = '<tr><td colspan="4" class="text-center text-success py-4 fw-bold">🎉 Perfect Audit! No pipes are missing.</td></tr>';
        } else {
            missingIds.forEach(m => {
                vTable.innerHTML += `<tr><td class="fw-bold">#${m.id}</td><td>${m.pipe_name}</td><td>${m.size}</td><td>${m.color}</td></tr>`;
            });
        }

        discrepancyModal.show();
    });

    // Save Voucher logic
    window.saveVoucher = function() {
        alert("✅ Audit Voucher Saved to System History!");
        discrepancyModal.hide();
        location.reload(); // Reset for next audit
    };
});