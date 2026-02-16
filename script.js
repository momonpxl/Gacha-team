(function() {
    // -------------------- AUDIO --------------------
    const sounds = {
        start: document.getElementById('spinStartSound'),
        tick: document.getElementById('spinTickSound'),
        result: document.getElementById('spinResultSound')
    };

    function playSound(type) {
        try {
            if (sounds[type]) {
                sounds[type].currentTime = 0;
                sounds[type].play().catch(() => {});
            }
        } catch (e) {}
    }

    // -------------------- STATE MANAGEMENT --------------------
    let tabs = [];
    let nextTabId = 1;
    let activeTabId = 1;
    let globalLock = false;
    let autoSaveTimer = null;

    const friction = 0.985;
    const minSpin = 0.01;

    // Tab Class
    class GachaTab {
        constructor(id, tabName = `GACHA TIM ${id}`, names = [], teamNames = []) {
            this.id = id;
            this.tabName = tabName;
            this.names = names.length ? [...names] : this.getDefaultNames(id);
            this.teamNames = teamNames.length ? [...teamNames] : this.getDefaultTeamNames(id);
            this.teams = this.teamNames.map(() => []);
            this.membersPerTeam = 2;
            this.rotation = 0;
            this.isSpinning = false;
            this.velocity = 0;
            this.locked = false;
            this.colors = []; // warna per nama
            this.spinHistory = []; // riwayat spin (max 5)
            this.stats = {
                totalSpins: 0,
                teamDistribution: {},
                lastPicked: []
            };
            this.undoStack = []; // stack untuk undo
        }

        getDefaultNames(id) {
            return [`User${id}A`, `User${id}B`, `User${id}C`, `User${id}D`, `User${id}E`];
        }

        getDefaultTeamNames(id) {
            return [`Tim ${id} A`, `Tim ${id} B`, `Tim ${id} C`];
        }

        saveState() {
            return {
                names: [...this.names],
                teams: this.teams.map(team => [...team]),
                rotation: this.rotation,
                stats: {...this.stats},
                spinHistory: [...this.spinHistory]
            };
        }

        pushState() {
            this.undoStack.push(this.saveState());
            if (this.undoStack.length > 10) this.undoStack.shift();
        }

        undo() {
            if (this.undoStack.length === 0) return false;
            const prevState = this.undoStack.pop();
            this.names = prevState.names;
            this.teams = prevState.teams;
            this.rotation = prevState.rotation;
            this.stats = prevState.stats;
            this.spinHistory = prevState.spinHistory;
            return true;
        }
    }

    // Inisialisasi tab default
    tabs.push(new GachaTab(1, 'GACHA TIM 1', 
        ['Alex', 'Bella', 'Charlie', 'Diana', 'Evan', 'Fara'],
        ['Tim 1', 'Tim 2', 'Tim 3']
    ));
    tabs.push(new GachaTab(2, 'GACHA TIM 2',
        ['Gamma', 'Hani', 'Indra', 'Joko', 'Kiki', 'Lulu'],
        ['Tim 1', 'Tim 2', 'Tim 3']
    ));
    nextTabId = 3;

    // -------------------- DOM Elements --------------------
    const tabBar = document.getElementById('tabBar');
    const panelsContainer = document.getElementById('panelsContainer');
    const addTabBtn = document.getElementById('addTabBtn');
    const adminLockBtn = document.getElementById('adminLockBtn');
    const adminUnlockBtn = document.getElementById('adminUnlockBtn');
    const autoSaveStatus = document.getElementById('autoSaveStatus');
    const totalSpinsAll = document.getElementById('totalSpinsAll');
    const popupModal = document.getElementById('popupModal');
    const popupNama = document.getElementById('popupNama');
    const popupTeam = document.getElementById('popupTeam');
    const closePopupBtn = document.getElementById('closePopupBtn');

    // -------------------- AUTO SAVE (localStorage) --------------------
    function saveToStorage() {
        const state = {
            tabs: tabs.map(tab => ({
                id: tab.id,
                tabName: tab.tabName,
                names: tab.names,
                teamNames: tab.teamNames,
                teams: tab.teams,
                membersPerTeam: tab.membersPerTeam,
                rotation: tab.rotation,
                locked: tab.locked,
                colors: tab.colors,
                spinHistory: tab.spinHistory,
                stats: tab.stats,
                undoStack: [] // jangan simpan undo stack
            })),
            nextTabId,
            activeTabId,
            globalLock
        };
        localStorage.setItem('gachaProState', JSON.stringify(state));
        autoSaveStatus.textContent = 'Tersimpan ' + new Date().toLocaleTimeString();
    }

    function loadFromStorage() {
        const saved = localStorage.getItem('gachaProState');
        if (!saved) return false;

        try {
            const state = JSON.parse(saved);
            tabs = state.tabs.map(t => {
                const tab = new GachaTab(t.id, t.tabName, t.names, t.teamNames);
                tab.teams = t.teams || tab.teamNames.map(() => []);
                tab.membersPerTeam = t.membersPerTeam || 2;
                tab.rotation = t.rotation || 0;
                tab.locked = t.locked || false;
                tab.colors = t.colors || [];
                tab.spinHistory = t.spinHistory || [];
                tab.stats = t.stats || { totalSpins: 0, teamDistribution: {}, lastPicked: [] };
                return tab;
            });
            nextTabId = state.nextTabId || tabs.length + 1;
            activeTabId = state.activeTabId || tabs[0]?.id || 1;
            globalLock = state.globalLock || false;
            return true;
        } catch (e) {
            console.warn('Gagal load storage', e);
            return false;
        }
    }

    // Auto save setiap 2 detik jika ada perubahan
    function triggerAutoSave() {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            saveToStorage();
        }, 2000);
    }

    // -------------------- RENDER FUNCTIONS --------------------
    function getTabIds(tabId) {
        return {
            canvas: `wheelCanvas${tabId}`,
            totalSpan: `totalNama${tabId}`,
            chipContainer: `chipContainer${tabId}`,
            teamGrid: `teamGrid${tabId}`,
            spinBtn: `spinBtn${tabId}`,
            undoBtn: `undoBtn${tabId}`,
            addNameBtn: `addNameBtn${tabId}`,
            nameInput: `nameInput${tabId}`,
            membersSelect: `membersSelect${tabId}`,
            addTeamBtn: `addTeamBtn${tabId}`,
            teamNameInput: `teamNameInput${tabId}`,
            resetTeamsBtn: `resetTeamsBtn${tabId}`,
            clearTeamsBtn: `clearTeamsBtn${tabId}`,
            shareInput: `shareInput${tabId}`,
            shareBtn: `shareBtn${tabId}`,
            colorPicker: `colorPicker${tabId}`,
            statsSpin: `statsSpin${tabId}`,
            statsHistory: `statsHistory${tabId}`
        };
    }

    function buildTabLayout(tabId) {
        const ids = getTabIds(tabId);
        return `
            <div class="dashboard" id="dashboard${tabId}">
                <!-- Share Row -->
                <div style="grid-column: 1 / -1;">
                    <div class="share-row">
                        <input type="text" id="${ids.shareInput}" placeholder="Link tab ini" readonly>
                        <button class="btn-secondary" id="${ids.shareBtn}"><i class="fas fa-share-alt"></i> Share Tab</button>
                    </div>
                </div>

                <!-- Left: Wheel Panel -->
                <div class="wheel-panel">
                    <div class="wheel-container">
                        <canvas id="${ids.canvas}" class="spinWheelCanvas" width="540" height="540"></canvas>
                        <div class="wheel-pointer"></div>
                    </div>

                    <!-- Color Control -->
                    <div class="color-control">
                        <i class="fas fa-palette"></i>
                        <input type="color" id="${ids.colorPicker}" value="#ffb347">
                        <span style="font-size:0.9rem;">Warna Slice</span>
                    </div>

                    <!-- Spin Controls -->
                    <div class="wheel-controls">
                        <button class="btn-spin" id="${ids.spinBtn}" ${globalLock ? 'disabled' : ''}>
                            <i class="fas fa-dice"></i> SPIN
                        </button>
                        <button class="btn-undo" id="${ids.undoBtn}" ${globalLock ? 'disabled' : ''}>
                            <i class="fas fa-undo-alt"></i> Undo
                        </button>
                    </div>

                    <!-- Nama Chips -->
                    <div style="margin:10px 0 5px;"><i class="fas fa-users"></i> Peserta (klik untuk hapus):</div>
                    <div class="nama-chips" id="${ids.chipContainer}"></div>

                    <!-- Add Name -->
                    <div style="display:flex; gap:8px; margin:15px 0;">
                        <input type="text" id="${ids.nameInput}" placeholder="Nama baru" style="flex:1; background:#1f3148; border:1px solid #5e7db0; border-radius:60px; padding:10px;">
                        <button class="btn-secondary" id="${ids.addNameBtn}" style="width:44px; font-size:1.5rem; padding:0;">+</button>
                    </div>

                    <!-- Stats Panel -->
                    <div class="stats-panel">
                        <div class="stats-row">
                            <span>Total Spin:</span>
                            <span id="${ids.statsSpin}">0</span>
                        </div>
                        <div class="stats-row">
                            <span>Riwayat:</span>
                            <span></span>
                        </div>
                        <div class="history-list" id="${ids.statsHistory}"></div>
                    </div>
                </div>

                <!-- Right: Teams Section -->
                <div class="teams-section">
                    <h3><i class="fas fa-layer-group"></i> Daftar Tim</h3>
                    
                    <!-- Add Team -->
                    <div style="display:flex; gap:8px; margin:15px 0;">
                        <input type="text" id="${ids.teamNameInput}" placeholder="Tim baru" style="flex:1; background:#1f3148; border:1px solid #5e7db0; border-radius:60px; padding:10px;">
                        <button class="btn-secondary" id="${ids.addTeamBtn}" style="width:44px; font-size:1.5rem; padding:0;">+</button>
                    </div>

                    <!-- Members Per Team -->
                    <div style="margin:15px 0;">
                        <label>Anggota per tim: 
                            <select id="${ids.membersSelect}" style="background:#1f3148; color:white; padding:8px 16px; border-radius:40px;">
                                ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}">${n}</option>`).join('')}
                            </select>
                        </label>
                    </div>

                    <!-- Team Grid -->
                    <div class="team-grid" id="${ids.teamGrid}"></div>

                    <!-- Team Actions -->
                    <div style="display:flex; gap:10px; margin-top:15px;">
                        <button class="btn-secondary" id="${ids.resetTeamsBtn}"><i class="fas fa-undo"></i> Reset</button>
                        <button class="btn-secondary" id="${ids.clearTeamsBtn}"><i class="fas fa-trash"></i> Kosongkan</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderTabs() {
        // Tab buttons
        let tabButtonsHtml = '';
        tabs.forEach(tab => {
            tabButtonsHtml += `
                <button class="tab-btn ${tab.id === activeTabId ? 'active' : ''} ${tab.locked ? 'locked' : ''}" data-tab-id="${tab.id}">
                    <i class="fas fa-dice-d6"></i>
                    <span class="tab-name">${tab.tabName}</span>
                    <button class="edit-tab-name" onclick="event.stopPropagation(); startEditTabName(${tab.id})"><i class="fas fa-pencil-alt"></i></button>
                    <span class="close-tab" onclick="event.stopPropagation(); removeTab(${tab.id})"><i class="fas fa-times"></i></span>
                </button>
            `;
        });
        tabBar.innerHTML = tabButtonsHtml + '<button class="add-tab-btn" id="addTabBtn"><i class="fas fa-plus"></i> Tambah Tab</button>';

        // Panels
        let panelsHtml = '';
        tabs.forEach(tab => {
            panelsHtml += `
                <div id="tab${tab.id}Panel" class="tab-panel ${tab.id === activeTabId ? 'active-panel' : ''}">
                    ${buildTabLayout(tab.id)}
                </div>
            `;
        });
        panelsContainer.innerHTML = panelsHtml;

        // Re-attach listeners
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const tabId = parseInt(btn.dataset.tabId);
            if (tabId) {
                btn.addEventListener('click', (e) => {
                    if (e.target.classList.contains('close-tab') || e.target.closest('.close-tab')) return;
                    if (e.target.classList.contains('edit-tab-name') || e.target.closest('.edit-tab-name')) return;
                    setActiveTab(tabId);
                });
            }
        });

        tabs.forEach(tab => {
            initTabEvents(tab.id);
            refreshTab(tab.id);
        });

        document.getElementById('addTabBtn').addEventListener('click', addNewTab);
        updateTotalSpins();
        triggerAutoSave();
    }

    // -------------------- TAB OPERATIONS --------------------
    function getTab(tabId) {
        return tabs.find(t => t.id === tabId);
    }

    function setActiveTab(tabId) {
        activeTabId = tabId;
        renderTabs();
    }

    function addNewTab() {
        const newId = nextTabId++;
        const newTab = new GachaTab(newId);
        tabs.push(newTab);
        setActiveTab(newId);
    }

    window.removeTab = function(tabId) {
        if (tabs.length <= 1) {
            alert('Minimal harus ada 1 tab.');
            return;
        }
        tabs = tabs.filter(t => t.id !== tabId);
        if (activeTabId === tabId) {
            setActiveTab(tabs[0].id);
        } else {
            renderTabs();
        }
    };

    window.startEditTabName = function(tabId) {
        const tab = getTab(tabId);
        if (!tab) return;
        const newName = prompt('Edit nama tab:', tab.tabName);
        if (newName && newName.trim()) {
            tab.tabName = newName.trim();
            renderTabs();
        }
    };

    // -------------------- SHARE LINK (per tab) --------------------
    function generateTabLink(tabId) {
        const tab = getTab(tabId);
        if (!tab) return '';

        const state = {
            tabName: tab.tabName,
            names: tab.names,
            teamNames: tab.teamNames,
            membersPerTeam: tab.membersPerTeam
        };
        const json = JSON.stringify(state);
        const encoded = btoa(encodeURIComponent(json));
        const url = new URL(window.location.href);
        url.searchParams.set(`tab`, encoded);
        // Hapus tab lain
        const params = new URLSearchParams(url.search);
        for (let key of params.keys()) {
            if (key !== 'tab') params.delete(key);
        }
        url.search = params.toString();
        return url.href;
    }

    function loadTabFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const data = params.get('tab');
        if (!data) return false;

        try {
            const decoded = JSON.parse(decodeURIComponent(atob(data)));
            const newId = nextTabId++;
            const newTab = new GachaTab(newId, decoded.tabName || `Tab Import ${newId}`, decoded.names, decoded.teamNames);
            newTab.membersPerTeam = decoded.membersPerTeam || 2;
            tabs.push(newTab);
            setActiveTab(newId);
            return true;
        } catch (e) {
            console.warn('Gagal load tab dari URL', e);
            return false;
        }
    }

    // -------------------- WHEEL DRAWING --------------------
    function drawWheel(tabId) {
        const tab = getTab(tabId);
        if (!tab) return;
        const elems = getElems(tabId);
        if (!elems.canvas) return;

        const ctx = elems.canvas.getContext('2d');
        const names = tab.names;
        const angle = tab.rotation;
        const width = elems.canvas.width;
        const height = elems.canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = width / 2 - 2;

        ctx.clearRect(0, 0, width, height);

        if (names.length === 0) {
            ctx.font = 'bold 24px Inter';
            ctx.fillStyle = '#7f99c2';
            ctx.textAlign = 'center';
            ctx.fillText('+ nama', centerX, centerY);
            return;
        }

        const count = names.length;
        const anglePerSlice = (2 * Math.PI) / count;
        
        // Gunakan warna dari color picker atau auto generate
        const baseColor = elems.colorPicker ? elems.colorPicker.value : '#ffb347';

        for (let i = 0; i < count; i++) {
            const startAngle = i * anglePerSlice + angle;
            const endAngle = startAngle + anglePerSlice;

            // Generate warna (auto/manual)
            let fillColor;
            if (tab.colors && tab.colors[i]) {
                fillColor = tab.colors[i];
            } else {
                // Auto generate berdasarkan base color
                const hue = (parseInt(baseColor.slice(1), 16) + i * 30) % 360;
                fillColor = `hsl(${hue}, 80%, 60%)`;
            }

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = '#1b2e44';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Teks
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(startAngle + anglePerSlice / 2);
            ctx.textAlign = 'right';
            ctx.font = 'bold 30px Inter';
            ctx.fillStyle = '#0f1e2c';
            ctx.shadowColor = '#ffffff80';
            ctx.shadowBlur = 4;
            ctx.fillText(names[i], radius - 15, 6);
            ctx.restore();
        }

        // Titik tengah
        ctx.beginPath();
        ctx.arc(centerX, centerY, 12, 0, 2 * Math.PI);
        ctx.fillStyle = '#1e3144';
        ctx.fill();
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // -------------------- SPIN LOGIC --------------------
    function startSpin(tabId) {
        const tab = getTab(tabId);
        if (!tab || tab.isSpinning || tab.locked || globalLock) return;
        if (tab.names.length === 0) { alert('Tidak ada nama!'); return; }
        if (tab.teams.length === 0) { alert('Tidak ada tim!'); return; }

        // Cek available team
        let available = false;
        for (let i = 0; i < tab.teams.length; i++) {
            if (tab.teams[i].length < tab.membersPerTeam) {
                available = true;
                break;
            }
        }
        if (!available) { alert('Semua tim penuh!'); return; }

        playSound('start');
        tab.pushState(); // simpan state sebelum spin
        tab.isSpinning = true;
        tab.velocity = 1.2 + Math.random() * 0.8;
        
        const canvas = document.getElementById(getTabIds(tabId).canvas);
        if (canvas) canvas.classList.add('spinning');
        
        requestAnimationFrame(() => spinAnimation(tabId));
    }

    function spinAnimation(tabId) {
        const tab = getTab(tabId);
        if (!tab || !tab.isSpinning) return;

        if (Math.abs(tab.velocity) < minSpin) {
            tab.isSpinning = false;
            const canvas = document.getElementById(getTabIds(tabId).canvas);
            if (canvas) canvas.classList.remove('spinning');
            finalizeSpin(tabId);
            drawWheel(tabId);
            return;
        }

        tab.velocity *= friction;
        tab.rotation = (tab.rotation + tab.velocity) % (2 * Math.PI);
        
        // Sound tick setiap 100ms
        if (Math.random() > 0.7) playSound('tick');
        
        drawWheel(tabId);
        requestAnimationFrame(() => spinAnimation(tabId));
    }

    function finalizeSpin(tabId) {
        const tab = getTab(tabId);
        if (!tab || tab.names.length === 0) return;

        // Tentukan nama terpilih berdasarkan sudut
        const pointerAngle = (3 * Math.PI) / 2; // 270 derajat (atas)
        let rawAngle = (pointerAngle - tab.rotation + 2 * Math.PI) % (2 * Math.PI);
        const sliceAngle = (2 * Math.PI) / tab.names.length;
        const index = Math.floor(rawAngle / sliceAngle) % tab.names.length;
        const selected = tab.names[index];

        // Cari tim available (urutan pertama)
        let targetTeamIdx = -1;
        for (let i = 0; i < tab.teams.length; i++) {
            if (tab.teams[i].length < tab.membersPerTeam) {
                targetTeamIdx = i;
                break;
            }
        }

        if (targetTeamIdx === -1) {
            alert('Tidak ada tim yang tersedia!');
            return;
        }

        // Hapus nama dari daftar
        tab.names.splice(index, 1);
        
        // Masukkan ke tim
        tab.teams[targetTeamIdx].push(selected);

        // Update stats
        tab.stats.totalSpins++;
        tab.stats.teamDistribution[targetTeamIdx] = (tab.stats.teamDistribution[targetTeamIdx] || 0) + 1;
        tab.stats.lastPicked.unshift(selected);
        if (tab.stats.lastPicked.length > 5) tab.stats.lastPicked.pop();

        // Simpan history
        tab.spinHistory.unshift({
            name: selected,
            team: tab.teamNames[targetTeamIdx],
            time: new Date().toLocaleTimeString()
        });
        if (tab.spinHistory.length > 5) tab.spinHistory.pop();

        // Tampilkan popup
        playSound('result');
        popupNama.textContent = selected;
        popupTeam.textContent = `masuk ${tab.teamNames[targetTeamIdx]}`;
        popupModal.classList.add('active');

        // Update UI
        refreshTab(tabId);
        updateTotalSpins();
        triggerAutoSave();
    }

    function undoSpin(tabId) {
        const tab = getTab(tabId);
        if (!tab || tab.isSpinning || tab.locked || globalLock) return;
        
        if (tab.undo()) {
            refreshTab(tabId);
            triggerAutoSave();
        } else {
            alert('Tidak ada yang bisa di-undo');
        }
    }

    // -------------------- UI UPDATE --------------------
    function getElems(tabId) {
        const ids = getTabIds(tabId);
        return {
            canvas: document.getElementById(ids.canvas),
            totalSpan: document.getElementById(ids.totalSpan),
            chipContainer: document.getElementById(ids.chipContainer),
            teamGrid: document.getElementById(ids.teamGrid),
            spinBtn: document.getElementById(ids.spinBtn),
            undoBtn: document.getElementById(ids.undoBtn),
            addNameBtn: document.getElementById(ids.addNameBtn),
            nameInput: document.getElementById(ids.nameInput),
            membersSelect: document.getElementById(ids.membersSelect),
            addTeamBtn: document.getElementById(ids.addTeamBtn),
            teamNameInput: document.getElementById(ids.teamNameInput),
            resetTeamsBtn: document.getElementById(ids.resetTeamsBtn),
            clearTeamsBtn: document.getElementById(ids.clearTeamsBtn),
            shareInput: document.getElementById(ids.shareInput),
            shareBtn: document.getElementById(ids.shareBtn),
            colorPicker: document.getElementById(ids.colorPicker),
            statsSpin: document.getElementById(ids.statsSpin),
            statsHistory: document.getElementById(ids.statsHistory)
        };
    }

    function refreshTab(tabId) {
        const tab = getTab(tabId);
        if (!tab) return;
        const elems = getElems(tabId);
        if (!elems.canvas) return;

        // Update nama chips
        if (elems.chipContainer) {
            if (tab.names.length === 0) {
                elems.chipContainer.innerHTML = '<div style="color:#778fb4;">Kosong</div>';
            } else {
                let html = '';
                tab.names.forEach((n, idx) => {
                    html += `<span class="name-chip" data-index="${idx}"><i class="fas fa-user"></i> ${n}</span>`;
                });
                elems.chipContainer.innerHTML = html;
            }
        }

        if (elems.totalSpan) elems.totalSpan.textContent = tab.names.length;

        // Update teams
        if (elems.teamGrid) {
            if (tab.teams.length === 0) {
                elems.teamGrid.innerHTML = '<div>+ Tambah tim</div>';
            } else {
                let html = '';
                tab.teams.forEach((team, i) => {
                    const teamName = tab.teamNames[i] || `Tim ${i+1}`;
                    let membersHtml = '';
                    if (team.length === 0) {
                        membersHtml = '<div class="empty-team">– kosong –</div>';
                    } else {
                        team.forEach(m => {
                            membersHtml += `<div class="member-item">${m}</div>`;
                        });
                    }
                    html += `
                        <div class="team-tile">
                            <h3>${teamName} <span>${team.length}/${tab.membersPerTeam}</span></h3>
                            <div>${membersHtml}</div>
                        </div>
                    `;
                });
                elems.teamGrid.innerHTML = html;
            }
        }

        if (elems.membersSelect) elems.membersSelect.value = tab.membersPerTeam;
        if (elems.statsSpin) elems.statsSpin.textContent = tab.stats.totalSpins;
        
        if (elems.statsHistory) {
            let historyHtml = '';
            tab.spinHistory.forEach(h => {
                historyHtml += `<div class="history-item">${h.name} → ${h.team}</div>`;
            });
            elems.statsHistory.innerHTML = historyHtml || '<div>Belum ada spin</div>';
        }

        if (elems.spinBtn) elems.spinBtn.disabled = tab.locked || globalLock;
        if (elems.undoBtn) elems.undoBtn.disabled = tab.locked || globalLock;

        drawWheel(tabId);
    }

    function updateTotalSpins() {
        const total = tabs.reduce((sum, t) => sum + (t.stats?.totalSpins || 0), 0);
        totalSpinsAll.textContent = total;
    }

    // -------------------- EVENT INIT --------------------
    function initTabEvents(tabId) {
        const elems = getElems(tabId);
        const tab = getTab(tabId);
        if (!elems.canvas || !tab) return;

        // Spin
        elems.spinBtn.addEventListener('click', () => startSpin(tabId));
        elems.canvas.addEventListener('click', () => startSpin(tabId));

        // Undo
        elems.undoBtn.addEventListener('click', () => undoSpin(tabId));

        // Add name
        elems.addNameBtn.addEventListener('click', () => {
            const val = elems.nameInput.value.trim();
            if (val) {
                tab.pushState();
                tab.names.push(val);
                elems.nameInput.value = '';
                refreshTab(tabId);
                triggerAutoSave();
            }
        });

        // Delete name chip
        elems.chipContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.name-chip');
            if (chip && chip.dataset.index !== undefined) {
                tab.pushState();
                const idx = parseInt(chip.dataset.index);
                tab.names.splice(idx, 1);
                refreshTab(tabId);
                triggerAutoSave();
            }
        });

        // Members per team
        elems.membersSelect.addEventListener('change', (e) => {
            tab.membersPerTeam = parseInt(e.target.value);
            refreshTab(tabId);
            triggerAutoSave();
        });

        // Add team
        elems.addTeamBtn.addEventListener('click', () => {
            const val = elems.teamNameInput.value.trim();
            if (val) {
                tab.pushState();
                tab.teamNames.push(val);
                tab.teams.push([]);
                elems.teamNameInput.value = '';
                refreshTab(tabId);
                triggerAutoSave();
            }
        });

        // Reset teams
        elems.resetTeamsBtn.addEventListener('click', () => {
            tab.pushState();
            tab.teams = tab.teamNames.map(() => []);
            refreshTab(tabId);
            triggerAutoSave();
        });

        // Clear teams
        elems.clearTeamsBtn.addEventListener('click', () => {
            tab.pushState();
            tab.teams = tab.teamNames.map(() => []);
            refreshTab(tabId);
            triggerAutoSave();
        });

        // Share
        elems.shareBtn.addEventListener('click', () => {
            const link = generateTabLink(tabId);
            elems.shareInput.value = link;
            navigator.clipboard.writeText(link);
            alert('Link disalin!');
        });

        // Color picker
        elems.colorPicker.addEventListener('input', () => {
            drawWheel(tabId);
        });
    }

    // -------------------- ADMIN CONTROLS --------------------
    adminLockBtn.addEventListener('click', () => {
        globalLock = true;
        tabs.forEach(t => t.locked = true);
        renderTabs();
        triggerAutoSave();
    });

    adminUnlockBtn.addEventListener('click', () => {
        globalLock = false;
        tabs.forEach(t => t.locked = false);
        renderTabs();
        triggerAutoSave();
    });

    // -------------------- POPUP --------------------
    closePopupBtn.addEventListener('click', () => popupModal.classList.remove('active'));
    popupModal.addEventListener('click', (e) => {
        if (e.target === popupModal) popupModal.classList.remove('active');
    });

    // -------------------- PWA SUPPORT --------------------
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // -------------------- INITIALIZATION --------------------
    function init() {
        if (!loadFromStorage()) {
            // Default sudah di-set
        }
        // Cek apakah ada link tab
        if (!loadTabFromUrl()) {
            // Tidak ada tab dari URL
        }
        renderTabs();
    }

    init();

    // Auto save on beforeunload
    window.addEventListener('beforeunload', () => {
        saveToStorage();
    });
})();