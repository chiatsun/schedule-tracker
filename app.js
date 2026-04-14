document.addEventListener('DOMContentLoaded', () => {
    const scheduleForm = document.getElementById('schedule-form');
    const scheduleGrid = document.getElementById('schedule-grid');

    const statOngoing = document.getElementById('stat-ongoing');
    const statWarning = document.getElementById('stat-warning');
    const statDanger = document.getElementById('stat-danger');
    const statCompleted = document.getElementById('stat-completed');
    const statCancelled = document.getElementById('stat-cancelled');
    const statAll = document.getElementById('stat-all');

    let currentFilter = 'all';
    let currentSort = 'end-asc';
    let warningDays = parseInt(localStorage.getItem('warningDays')) || 5;
    let personnelList = JSON.parse(localStorage.getItem('personnelList')) || [];
    const API_URL = 'https://script.google.com/macros/s/AKfycbw8XFH6ngE_CPRXnOZkeYfyhbQImN-91VdGcNDoKteuzvQRQO79XFm4LOCRObM75mA/exec';
    const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1nPYrS9e3qvHTLsjzNIotcZlWwKtWsxha8cy3gQ5ZkAA/edit?gid=1089712477#gid=1089712477';

    // 初始化同步連結
    const syncLink = document.getElementById('sync-link');
    if (syncLink && SPREADSHEET_URL) {
        syncLink.href = SPREADSHEET_URL;
    }

    // Sync Status UI
    const syncStatus = document.getElementById('sync-status');
    const syncText = document.getElementById('sync-text');

    const updateSyncStatus = (state, text) => {
        if (!syncStatus || !syncText) return;
        syncStatus.className = 'nav-sync-status ' + state;
        syncText.textContent = text;
        const icon = syncStatus.querySelector('.material-symbols-outlined');
        if (icon) {
            switch (state) {
                case 'syncing': icon.textContent = 'cloud_sync'; break;
                case 'success': icon.textContent = 'cloud_done'; break;
                case 'error': icon.textContent = 'cloud_off'; break;
            }
        }
    };

    // Warning Days Element
    const warningDaysInput = document.getElementById('warning-days');
    if (warningDaysInput) {
        warningDaysInput.value = warningDays;
        warningDaysInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            if (val >= 0) {
                warningDays = val;
                localStorage.setItem('warningDays', warningDays);
                renderSchedules();
            } else {
                e.target.value = warningDays;
            }
        });
    }

    // Sort Element
    const sortSelect = document.getElementById('sort-select');
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderSchedules();
    });

    // UI Elements for extension dates
    const projectStatusSelect = document.getElementById('project-status');
    const extendedDateGroup = document.getElementById('extended-date-group');

    // Modal Elements
    const updateModal = document.getElementById('update-modal');
    const updateForm = document.getElementById('update-form');
    const btnCancelUpdate = document.getElementById('btn-cancel-update');
    const updateStatusSelect = document.getElementById('update-status');
    const updateExtendedDateGroup = document.getElementById('update-extended-date-group');

    let schedules = [];
    let isDataLoaded = false;

    // Helper for date formatting
    const formatDateHelper = (dateStr) => {
        if (!dateStr) return '無資料';
        // Handle ISO strings or Date objects
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
    };

    const APP_VERSION = '2024.04.13.v4'; // 升級版本號
    console.log(`[System] Schedule Tracker Version: ${APP_VERSION}`);

    const loadSchedules = async () => {
        const overlay = document.getElementById('loading-overlay');
        updateSyncStatus('syncing', '從雲端載入中...');

        const cacheBuster = `&t=${Date.now()}`;
        const finalUrl = API_URL.includes('?') ? (API_URL + cacheBuster) : (API_URL + '?t=' + Date.now());

        console.log('Fetching from cloud:', finalUrl);

        try {
            const response = await fetch(finalUrl, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                redirect: 'follow'
            });

            if (response.ok) {
                let data = await response.json();
                console.log('Raw Cloud Data:', data);

                let incomingSchedules = [];
                if (Array.isArray(data)) {
                    // Backward compatibility: data is just schedules array
                    incomingSchedules = data;
                } else if (data.schedules) {
                    // New format: { schedules: [], personnel: [] }
                    incomingSchedules = data.schedules;
                    personnelList = data.personnel || [];
                }

                schedules = incomingSchedules.map(item => {
                    const sanitized = {
                        ...item,
                        id: item.id || Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        startDate: formatDateHelper(item.startDate),
                        endDate: formatDateHelper(item.endDate),
                        extendedDate: item.extendedDate ? formatDateHelper(item.extendedDate) : null
                    };
                    return sanitized;
                });

                localStorage.setItem('schedules', JSON.stringify(schedules));
                localStorage.setItem('personnelList', JSON.stringify(personnelList));
                isDataLoaded = true;
                updateSyncStatus('success', '已與雲端同步');
            } else {
                throw new Error(`Server responded with ${response.status}`);
            }
        } catch (err) {
            console.error('Cloud load failed:', err);
            schedules = JSON.parse(localStorage.getItem('schedules')) || [];
            personnelList = JSON.parse(localStorage.getItem('personnelList')) || [];
            isDataLoaded = true;
            updateSyncStatus('error', '離線模式 (載入失敗)');
        }

        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 500);
        }

        renderSchedules();
        renderPersonnelUI();
    };

    const saveSchedules = async () => {
        // 安全機制：如果資料還沒載入完成，絕對不要執行儲存，以免覆蓋雲端
        if (!isDataLoaded) {
            console.warn('Data not loaded yet, save aborted to prevent overwrite.');
            return;
        }

        // 整理傳送結構
        const payload = {
            schedules: schedules,
            personnel: personnelList
        };

        // 存到本地
        localStorage.setItem('schedules', JSON.stringify(schedules));
        localStorage.setItem('personnelList', JSON.stringify(personnelList));

        if (window.pywebview && window.pywebview.api) {
            window.pywebview.api.save_data(JSON.stringify(payload));
        }

        updateSyncStatus('syncing', '同步到雲端...');
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            setTimeout(() => {
                updateSyncStatus('success', '已同步至雲端');
            }, 1000);
        } catch (err) {
            console.error('Cloud save failed:', err);
            updateSyncStatus('error', '雲端儲存失敗');
        }
    };

    const saveAndRender = () => {
        renderSchedules();
        renderPersonnelUI();
        saveSchedules();
    };

    // Toggles the extension date visibility
    const toggleExtendedDateGroup = (selectEl, groupEl) => {
        if (selectEl.value === 'extended') {
            groupEl.style.display = 'block';
        } else {
            groupEl.style.display = 'none';
        }
    };

    projectStatusSelect.addEventListener('change', () => toggleExtendedDateGroup(projectStatusSelect, extendedDateGroup));
    updateStatusSelect.addEventListener('change', () => toggleExtendedDateGroup(updateStatusSelect, updateExtendedDateGroup));

    // Cancel Modal
    btnCancelUpdate.addEventListener('click', () => {
        updateModal.style.display = 'none';
    });

    const calculateDaysLeft = (endDateStr) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const endDate = new Date(endDateStr);
        endDate.setHours(0, 0, 0, 0);

        const msPerDay = 1000 * 60 * 60 * 24;
        const diffMs = endDate - today;
        return Math.ceil(diffMs / msPerDay);
    };

    const getStatusTheme = (schedule) => {
        if (schedule.status === 'completed') return 'completed';
        if (schedule.status === 'cancelled') return 'cancelled';

        let targetDate = schedule.endDate;
        if (schedule.status === 'extended' && schedule.extendedDate) {
            targetDate = schedule.extendedDate;
        }

        const daysLeft = calculateDaysLeft(targetDate);
        if (daysLeft < 0) return 'danger';
        if (daysLeft <= warningDays) return 'warning';
        return 'ongoing';
    };

    const getStatusText = (theme) => {
        switch (theme) {
            case 'danger': return '已過期';
            case 'warning': return '即將過期';
            case 'ongoing': return '進行中';
            case 'completed': return '已竣工';
            case 'cancelled': return '已取消';
        }
    };

    const getDaysLeftText = (schedule, theme) => {
        if (theme === 'completed') return '專案已竣工';
        if (theme === 'cancelled') return '專案已取消';

        let targetDate = schedule.endDate;
        if (schedule.status === 'extended' && schedule.extendedDate) {
            targetDate = schedule.extendedDate;
        }

        const daysLeft = calculateDaysLeft(targetDate);
        if (daysLeft < 0) return `逾期 ${Math.abs(daysLeft)} 天`;
        if (daysLeft === 0) return '今天到期';
        return `剩餘 ${daysLeft} 天`;
    };

    const renderSchedules = () => {
        scheduleGrid.innerHTML = '';

        let counts = { ongoing: 0, warning: 0, danger: 0, completed: 0, cancelled: 0, all: schedules.length };

        if (schedules.length === 0) {
            scheduleGrid.innerHTML = `
                <div class="empty-state">
                    尚無行程資料。請透過上方表單新增專案行程。
                </div>
            `;
        } else {
            // Sort by dynamically selected logic
            schedules.sort((a, b) => {
                const getTargetDateA = () => a.status === 'extended' ? a.extendedDate : a.endDate;
                const getTargetDateB = () => b.status === 'extended' ? b.extendedDate : b.endDate;

                switch (currentSort) {
                    case 'end-asc':
                        return new Date(getTargetDateA()) - new Date(getTargetDateB());
                    case 'end-desc':
                        return new Date(getTargetDateB()) - new Date(getTargetDateA());
                    case 'start-asc':
                        return new Date(a.startDate) - new Date(b.startDate);
                    case 'start-desc':
                        return new Date(b.startDate) - new Date(a.startDate);
                    case 'name-asc':
                        return a.name.localeCompare(b.name, 'zh-TW');
                    default:
                        return new Date(getTargetDateA()) - new Date(getTargetDateB());
                }
            });

            schedules.forEach(schedule => {
                // Compatibility layer for older items
                if (!schedule.status) schedule.status = 'started';
                // Ensure ID exists
                if (!schedule.id) schedule.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);

                const theme = getStatusTheme(schedule);
                counts[theme]++;

                // Filter out non-matching 
                if (currentFilter !== 'all' && currentFilter !== theme) {
                    return;
                }

                const cardStyle = `card-${theme}`;
                const badgeStyle = `badge-${theme}`;
                const textStyle = `text-${theme}`;

                const card = document.createElement('div');
                card.className = `project-card ${cardStyle}`;
                card.innerHTML = `
                    <div class="card-header">
                        <div class="card-title">${schedule.name}</div>
                        <div class="status-badge ${badgeStyle}">${getStatusText(theme)}</div>
                    </div>
                    <div class="card-dates">
                        <div class="date-item">
                            <span class="date-label">施工人員</span>
                            <span class="date-value">${schedule.personnel || '無填寫'}</span>
                        </div>
                        <div class="date-item">
                            <span class="date-label">開始日期</span>
                            <span class="date-value">${formatDateHelper(schedule.startDate)}</span>
                        </div>
                        <div class="date-item">
                            <span class="date-label">結束日期</span>
                            <span class="date-value">${formatDateHelper(schedule.endDate)}</span>
                        </div>
                        ${schedule.status === 'extended' ? `
                        <div class="date-item">
                            <span class="date-label" style="color: var(--status-warning);">展延日期</span>
                            <span class="date-value" style="color: var(--status-warning);">${formatDateHelper(schedule.extendedDate)}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="card-footer">
                        <div class="days-left ${textStyle}">${getDaysLeftText(schedule, theme)}</div>
                        <div class="card-actions">
                            <button class="btn-update" data-id="${schedule.id}">更新狀態</button>
                            <button class="btn-delete" data-id="${schedule.id}">刪除</button>
                        </div>
                    </div>
                `;
                scheduleGrid.appendChild(card);
            });
        }

        statAll.textContent = counts.all;
        statOngoing.textContent = counts.ongoing;
        statWarning.textContent = counts.warning;
        statDanger.textContent = counts.danger;
        statCompleted.textContent = counts.completed;
        statCancelled.textContent = counts.cancelled;

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                deleteSchedule(id);
            });
        });

        document.querySelectorAll('.btn-update').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                openUpdateModal(id);
            });
        });
    };

    // Attach filter event listeners ONCE globally
    document.querySelectorAll('.filter-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-badge').forEach(b => b.classList.remove('active'));

            const clickedBadge = e.currentTarget;
            clickedBadge.classList.add('active');

            currentFilter = clickedBadge.getAttribute('data-filter');
            renderSchedules();
        });
    });

    const addSchedule = (e) => {
        e.preventDefault();
        const name = document.getElementById('project-name').value;
        const personnel = document.getElementById('personnel').value;
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        const status = document.getElementById('project-status').value;
        const extendedDate = document.getElementById('extended-date').value;

        if (new Date(startDate) > new Date(endDate)) {
            alert('結束日期不能早於開始日期！');
            return;
        }

        if (status === 'extended' && !extendedDate) {
            alert('選擇「展延」時，必須填寫展延日期！');
            return;
        }

        const now = new Date();
        const saveTime = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const newSchedule = {
            id: Date.now().toString(),
            saveTime, // 加入輸入日期時間
            name,
            personnel,
            startDate,
            endDate,
            status: status || 'started',
            extendedDate: status === 'extended' ? extendedDate : null
        };

        schedules.push(newSchedule);
        saveAndRender();
        scheduleForm.reset();
        extendedDateGroup.style.display = 'none';
        projectStatusSelect.value = 'started';
    };

    const deleteSchedule = (id) => {
        // 使用 String() 強制轉型，防止 Google Sheets 的數字 ID 與網頁字串 ID 比較失敗
        schedules = schedules.filter(s => String(s.id) !== String(id));
        saveAndRender();
    };

    const openUpdateModal = (id) => {
        const schedule = schedules.find(s => String(s.id) === String(id));
        if (!schedule) return;

        document.getElementById('update-id').value = schedule.id;
        updateStatusSelect.value = schedule.status || 'started';
        document.getElementById('update-extended-date').value = schedule.extendedDate || '';

        toggleExtendedDateGroup(updateStatusSelect, updateExtendedDateGroup);
        updateModal.style.display = 'flex';
    };

    updateForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('update-id').value;
        const status = updateStatusSelect.value;
        const extendedDate = document.getElementById('update-extended-date').value;

        if (status === 'extended' && !extendedDate) {
            alert('選擇「展延」時，必須填寫展延日期！');
            return;
        }

        const scheduleIndex = schedules.findIndex(s => String(s.id) === String(id));
        if (scheduleIndex !== -1) {
            schedules[scheduleIndex].status = status;
            schedules[scheduleIndex].extendedDate = status === 'extended' ? extendedDate : null;
            saveAndRender();
            updateModal.style.display = 'none';
        }
    });

    scheduleForm.addEventListener('submit', addSchedule);

    // Print Data
    document.getElementById('btn-print').addEventListener('click', () => {
        window.print();
    });

    // Export Data
    document.getElementById('btn-export').addEventListener('click', () => {
        const dataStr = JSON.stringify(schedules, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `schedules_export_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Import Data
    const importFileInput = document.getElementById('import-file');
    document.getElementById('btn-import-trigger').addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (Array.isArray(importedData)) {
                    if (confirm(`匯入成功！\n\n[確定]: 完全覆蓋現有資料\n[取消]: 保留現有資料，並將匯入資料附加在後面`)) {
                        schedules = importedData;
                    } else {
                        // Regenerate IDs to avoid conflicts
                        const reMappedData = importedData.map(item => ({ ...item, id: Date.now().toString() + Math.random().toString(36).substr(2, 5) }));
                        schedules = [...schedules, ...reMappedData];
                    }
                    saveAndRender();
                    alert('資料匯入完成！');
                } else {
                    alert('匯入失敗：檔案格式不正確 (非陣列)');
                }
            } catch (err) {
                alert('匯入失敗：無法解析 JSON 檔案內容');
            }
        };
        reader.readAsText(file);

        // Reset so same file can be triggered again
        e.target.value = '';
    });


    const renderPersonnelUI = () => {
        const quickPickContainer = document.getElementById('personnel-quick-pick');
        const manageContainer = document.getElementById('personnel-list-manage');
        const personnelInput = document.getElementById('personnel');

        if (!quickPickContainer || !manageContainer) return;

        // 1. Render Quick Pick Badges
        quickPickContainer.innerHTML = '';
        if (personnelList.length === 0) {
            quickPickContainer.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">尚未設定人員名單</span>';
        } else {
            personnelList.forEach(name => {
                const badge = document.createElement('span');
                badge.className = 'personnel-badge';
                badge.textContent = name;

                // Toggle logic: append or remove name from input
                badge.addEventListener('click', () => {
                    let currentNames = personnelInput.value.split(/[、,，\s]+/).map(n => n.trim()).filter(n => n);
                    if (currentNames.includes(name)) {
                        currentNames = currentNames.filter(n => n !== name);
                    } else {
                        currentNames.push(name);
                    }
                    personnelInput.value = currentNames.join('、');

                    // Update badge visual state
                    badge.classList.toggle('selected');
                });

                // Set initial selected state based on input value
                const currentNames = personnelInput.value.split(/[、,，\s]+/).map(n => n.trim());
                if (currentNames.includes(name)) {
                    badge.classList.add('selected');
                }

                quickPickContainer.appendChild(badge);
            });
        }

        // 2. Render Management List in Modal
        manageContainer.innerHTML = '';
        personnelList.forEach((name, index) => {
            const item = document.createElement('div');
            item.className = 'manage-item';
            item.innerHTML = `
                <span>${name}</span>
                <button type="button" class="delete-name-btn" data-index="${index}">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            `;
            manageContainer.appendChild(item);
        });

        // Delete Handler
        manageContainer.querySelectorAll('.delete-name-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                personnelList.splice(idx, 1);
                renderPersonnelUI();
            });
        });
    };

    // Personnel Modal Events
    const personnelModal = document.getElementById('personnel-modal');
    const btnManagePersonnel = document.getElementById('btn-manage-personnel');
    const btnClosePersonnel = document.getElementById('btn-close-personnel');
    const btnSavePersonnelClose = document.getElementById('btn-save-personnel-close');
    const btnAddPersonnel = document.getElementById('btn-add-personnel');
    const newPersonnelInput = document.getElementById('new-personnel-name');

    btnManagePersonnel.addEventListener('click', () => {
        renderPersonnelUI();
        personnelModal.style.display = 'flex';
    });

    const closePersonnelModal = () => {
        personnelModal.style.display = 'none';
        saveAndRender(); // Save to cloud when closing management
    };

    btnClosePersonnel.addEventListener('click', closePersonnelModal);
    btnSavePersonnelClose.addEventListener('click', closePersonnelModal);

    btnAddPersonnel.addEventListener('click', () => {
        const name = newPersonnelInput.value.trim();
        if (name && !personnelList.includes(name)) {
            personnelList.push(name);
            newPersonnelInput.value = '';
            renderPersonnelUI();
        } else if (personnelList.includes(name)) {
            alert('此姓名已在名單中！');
        }
    });

    // Also support Enter key for adding personnel
    newPersonnelInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnAddPersonnel.click();
        }
    });

    // Sync badge state when typing manually
    document.getElementById('personnel').addEventListener('input', () => {
        const currentNames = document.getElementById('personnel').value.split(/[、,，\s]+/).map(n => n.trim());
        document.querySelectorAll('.personnel-badge').forEach(badge => {
            if (currentNames.includes(badge.textContent)) {
                badge.classList.add('selected');
            } else {
                badge.classList.remove('selected');
            }
        });
    });

    // Initialize Flatpickr for custom date picker UI
    flatpickr('input[type="date"]', {
        locale: "zh_tw",
        dateFormat: "Y/m/d",
        allowInput: true
    });

    // native load hook (pywebview only)
    window.addEventListener('pywebviewready', async () => {
        // We keep this for exe version, it will overwrite the local schedules array 
        // once it loads the local file.
        try {
            if (window.pywebview && window.pywebview.api) {
                const dataStr = await window.pywebview.api.load_data();
                if (dataStr) {
                    const importedData = JSON.parse(dataStr);
                    if (Array.isArray(importedData)) {
                        schedules = importedData;
                        renderSchedules();
                    }
                }
            }
        } catch (e) {
            console.error("Pywebview load error:", e);
        }
    });

    // Start cloud load
    loadSchedules();
});
