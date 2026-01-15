document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const modals = ['guideModal', 'historyModal', 'statsModal', 'processModal'];
    let currentProcessId = null;
    let processInterval = null;

    // Initialize application
    initApp();

    function initApp() {
        setupEventListeners();
        updateStats();
        addLog('System initialized. Ready to start boosting.', 'info');
    }

    function setupEventListeners() {
        // Menu Toggle
        if (menuToggle) {
            menuToggle.addEventListener('click', function() {
                sidebar.classList.toggle('active');
            });
        }

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', function(event) {
            if (window.innerWidth <= 992 && 
                sidebar && 
                !sidebar.contains(event.target) && 
                menuToggle && 
                !menuToggle.contains(event.target) &&
                sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        });

        // Modal Functions
        window.openModal = function(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
                loadModalContent(modalId);
            }
        };

        window.closeModal = function(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        };

        // Close modal when clicking outside
        window.addEventListener('click', function(event) {
            modals.forEach(modalId => {
                const modal = document.getElementById(modalId);
                if (modal && event.target === modal) {
                    closeModal(modalId);
                }
            });
        });

        // Modal Links
        document.querySelectorAll('[id$="Link"]').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const modalId = this.id.replace('Link', 'Modal');
                openModal(modalId);
            });
        });

        // Close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', function() {
                const modal = this.closest('.modal');
                if (modal) {
                    closeModal(modal.id);
                }
            });
        });

        // Share Form Handling
        const shareForm = document.getElementById('shareForm');
        if (shareForm) {
            shareForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const cookie = document.getElementById('cookie')?.value.trim();
                const postLink = document.getElementById('postLink')?.value.trim();
                const limit = document.getElementById('limit')?.value;
                const delay = document.getElementById('delay')?.value || 1;
                
                // Validation
                if (!cookie || !postLink || !limit) {
                    addLog('Please fill all required fields', 'error');
                    return;
                }
                
                // Disable form and show loading
                const startBtn = document.getElementById('startBtn');
                const stopBtn = document.getElementById('stopBtn');
                if (startBtn) {
                    startBtn.disabled = true;
                    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
                }
                if (stopBtn) {
                    stopBtn.disabled = false;
                }
                
                // Reset progress
                resetProgress();
                
                try {
                    const response = await fetch('/api/share', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            cookie,
                            link: postLink,
                            limit,
                            delay
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.status) {
                        currentProcessId = data.processId;
                        addLog('Process started successfully', 'success');
                        addLog(`Process ID: ${currentProcessId}`, 'info');
                        
                        // Start polling for progress
                        startProcessPolling(currentProcessId);
                    } else {
                        addLog(`Error: ${data.message}`, 'error');
                        resetForm();
                    }
                } catch (error) {
                    addLog(`Network error: ${error.message}`, 'error');
                    resetForm();
                }
            });
        }

        // Stop Process Button
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', function() {
                if (currentProcessId && processInterval) {
                    clearInterval(processInterval);
                    addLog('Process stopped manually', 'warning');
                    resetForm();
                }
            });
        }

        // Reset Button
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                resetForm();
                resetProgress();
                addLog('Form reset', 'info');
            });
        }

        // Clear History
        const clearHistoryBtn = document.getElementById('clearHistory');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', async function() {
                if (confirm('Are you sure you want to clear all history?')) {
                    try {
                        const response = await fetch('/api/history/clear', {
                            method: 'POST'
                        });
                        const data = await response.json();
                        
                        if (data.status) {
                            await loadHistory();
                            addLog('History cleared successfully', 'success');
                        }
                    } catch (error) {
                        addLog('Error clearing history', 'error');
                    }
                }
            });
        }

        // Refresh History
        const refreshHistoryBtn = document.getElementById('refreshHistory');
        if (refreshHistoryBtn) {
            refreshHistoryBtn.addEventListener('click', loadHistory);
        }

        // Refresh Stats Button
        const refreshStatsBtn = document.getElementById('refreshStats');
        if (refreshStatsBtn) {
            refreshStatsBtn.addEventListener('click', updateStats);
        }

        // View History Button
        const viewHistoryBtn = document.getElementById('viewHistory');
        if (viewHistoryBtn) {
            viewHistoryBtn.addEventListener('click', function() {
                openModal('historyModal');
            });
        }
    }

    // Process Polling
    function startProcessPolling(processId) {
        processInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/process/${processId}`);
                const data = await response.json();
                
                if (data.status) {
                    updateProgress(data.process);
                    
                    if (data.process.status === 'completed' || 
                        data.process.status === 'failed' || 
                        data.process.status === 'stopped') {
                        clearInterval(processInterval);
                        
                        if (data.process.status === 'completed') {
                            addLog(`Process completed: ${data.process.success} successful shares`, 'success');
                        } else {
                            addLog(`Process ${data.process.status}: ${data.process.error || ''}`, 'error');
                        }
                        
                        // Enable form after delay
                        setTimeout(resetForm, 3000);
                    }
                } else {
                    clearInterval(processInterval);
                    addLog('Process not found', 'error');
                    resetForm();
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 1000); // Poll every second
    }

    // Update Progress Display
    function updateProgress(process) {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressCount = document.getElementById('progressCount');
        const successCount = document.getElementById('successCount');
        const failedCount = document.getElementById('failedCount');
        const activeCount = document.getElementById('activeCount');
        
        if (progressFill && process) {
            const percentage = (process.current / process.total) * 100;
            progressFill.style.width = `${percentage}%`;
            
            if (progressText) progressText.textContent = `${percentage.toFixed(1)}%`;
            if (progressCount) progressCount.textContent = `${process.current} / ${process.total}`;
            if (successCount) successCount.textContent = process.success || 0;
            if (failedCount) failedCount.textContent = process.failed || 0;
            
            // Add log entry for significant progress
            if (process.current % 10 === 0) {
                addLog(`Progress: ${process.current}/${process.total} (${process.success} successful)`, 'info');
            }
        }
        
        // Update stats
        updateStats();
    }

    // Reset Form
    function resetForm() {
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-rocket"></i> Start Boosting';
        }
        
        if (stopBtn) {
            stopBtn.disabled = true;
        }
        
        currentProcessId = null;
        if (processInterval) {
            clearInterval(processInterval);
            processInterval = null;
        }
    }

    // Reset Progress
    function resetProgress() {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressCount = document.getElementById('progressCount');
        const successCount = document.getElementById('successCount');
        const failedCount = document.getElementById('failedCount');
        
        if (progressFill) progressFill.style.width = '0%';
        if (progressText) progressText.textContent = '0%';
        if (progressCount) progressCount.textContent = '0 / 0';
        if (successCount) successCount.textContent = '0';
        if (failedCount) failedCount.textContent = '0';
    }

    // Add Log Entry
    function addLog(message, type = 'info') {
        const logBox = document.getElementById('logBox');
        if (!logBox) return;
        
        const time = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `
            <span class="log-time">[${time}]</span>
            <span class="log-message ${type}">${message}</span>
        `;
        
        logBox.appendChild(logEntry);
        logBox.scrollTop = logBox.scrollHeight;
        
        // Keep only last 50 log entries
        const entries = logBox.querySelectorAll('.log-entry');
        if (entries.length > 50) {
            entries[0].remove();
        }
    }

    // Update Stats
    async function updateStats() {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            
            if (data.status) {
                // Update dashboard stats
                const totalSharesEl = document.getElementById('totalShares');
                const successfulSharesEl = document.getElementById('successfulShares');
                const failedSharesEl = document.getElementById('failedShares');
                const activeProcessesEl = document.getElementById('activeProcesses');
                
                if (totalSharesEl) totalSharesEl.textContent = data.stats.totalShares;
                if (successfulSharesEl) successfulSharesEl.textContent = data.stats.successfulShares;
                if (failedSharesEl) failedSharesEl.textContent = data.stats.failedShares;
                if (activeProcessesEl) activeProcessesEl.textContent = data.stats.activeProcesses;
            }
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    // Load Modal Content
    async function loadModalContent(modalId) {
        switch(modalId) {
            case 'historyModal':
                await loadHistory();
                break;
            case 'statsModal':
                await loadStats();
                break;
            case 'processModal':
                await loadActiveProcesses();
                break;
        }
    }

    // Load History
    async function loadHistory() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;
        
        historyList.innerHTML = '<div class="spinner"></div><p>Loading history...</p>';
        
        try {
            const response = await fetch('/api/history');
            const data = await response.json();
            
            if (data.status && data.history.length > 0) {
                let html = '';
                data.history.forEach(item => {
                    const date = new Date(item.date).toLocaleString();
                    html += `
                        <div class="history-item">
                            <div class="history-header">
                                <strong>${date}</strong>
                                <span class="badge ${item.success === item.total ? 'success' : 'warning'}">
                                    ${item.success}/${item.total} successful
                                </span>
                            </div>
                            <p class="history-link">${item.link}</p>
                            <small>Duration: ${(item.duration / 1000).toFixed(2)}s</small>
                        </div>
                    `;
                });
                historyList.innerHTML = html;
            } else {
                historyList.innerHTML = '<p class="loading">No history found</p>';
            }
        } catch (error) {
            historyList.innerHTML = '<p class="error">Error loading history</p>';
        }
    }

    // Load Detailed Stats
    async function loadStats() {
        const statsDetails = document.getElementById('statsDetails');
        if (!statsDetails) return;
        
        statsDetails.innerHTML = '<div class="spinner"></div><p>Loading statistics...</p>';
        
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            
            if (data.status) {
                const stats = data.stats;
                const successRate = stats.totalShares > 0 ? 
                    ((stats.successfulShares / stats.totalShares) * 100).toFixed(2) : 0;
                
                statsDetails.innerHTML = `
                    <div class="stats-grid">
                        <div class="stat-detail">
                            <h3>Total Shares</h3>
                            <p class="stat-value">${stats.totalShares}</p>
                        </div>
                        <div class="stat-detail">
                            <h3>Successful</h3>
                            <p class="stat-value" style="color: #4CAF50;">${stats.successfulShares}</p>
                        </div>
                        <div class="stat-detail">
                            <h3>Failed</h3>
                            <p class="stat-value" style="color: #f44336;">${stats.failedShares}</p>
                        </div>
                        <div class="stat-detail">
                            <h3>Success Rate</h3>
                            <p class="stat-value" style="color: #2196F3;">${successRate}%</p>
                        </div>
                        <div class="stat-detail">
                            <h3>Active Processes</h3>
                            <p class="stat-value">${stats.activeProcesses}</p>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            statsDetails.innerHTML = '<p class="error">Error loading statistics</p>';
        }
    }

    // Load Active Processes
    async function loadActiveProcesses() {
        const processList = document.getElementById('processList');
        if (!processList) return;
        
        processList.innerHTML = '<div class="spinner"></div><p>Loading active processes...</p>';
        
        // Show current active processes
        if (currentProcessId) {
            try {
                const response = await fetch(`/api/process/${currentProcessId}`);
                const data = await response.json();
                
                if (data.status) {
                    const process = data.process;
                    processList.innerHTML = `
                        <div class="process-item">
                            <h4>Active Process: ${process.id}</h4>
                            <p>Status: <strong>${process.status}</strong></p>
                            <p>Progress: ${process.current}/${process.total}</p>
                            <p>Successful: ${process.success}</p>
                            <p>Failed: ${process.failed}</p>
                            <p>Link: ${process.link.substring(0, 50)}...</p>
                        </div>
                    `;
                } else {
                    processList.innerHTML = '<p>No active processes found.</p>';
                }
            } catch (error) {
                processList.innerHTML = '<p class="error">Error loading processes</p>';
            }
        } else {
            processList.innerHTML = '<p>No active processes running.</p>';
        }
    }

    // Auto-refresh stats every 30 seconds
    setInterval(updateStats, 30000);
});
