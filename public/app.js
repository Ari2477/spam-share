document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ App.js loaded - MULTI-PROCESS VERSION');
    
    // DOM Elements
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const modals = ['guideModal', 'historyModal', 'statsModal', 'processModal'];
    
    // Multi-process tracking
    let activeProcesses = new Map(); // Map of processId -> {interval, status}
    let processIntervals = new Map(); // Map of processId -> intervalId
    
    // Initialize application
    initApp();

    function initApp() {
        console.log('Initializing app...');
        setupEventListeners();
        updateStats();
        addLog('System initialized. Ready to start boosting.', 'info');
        addLog('You can run multiple processes simultaneously.', 'info');
    }

    function setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Menu Toggle
        if (menuToggle) {
            menuToggle.addEventListener('click', function(e) {
                e.stopPropagation();
                if (sidebar) {
                    sidebar.classList.toggle('active');
                }
            });
        }

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

        // Modal Links
        document.querySelectorAll('[id$="Link"]').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const modalId = this.id.replace('Link', 'Modal');
                openModal(modalId);
            });
        });

        // Share Form Handling - MULTI-PROCESS SUPPORT
        const shareForm = document.getElementById('shareForm');
        if (shareForm) {
            console.log('Share form found');
            shareForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                console.log('Share form submitted');
                
                const cookie = document.getElementById('cookie')?.value.trim();
                const postLink = document.getElementById('postLink')?.value.trim();
                const limit = document.getElementById('limit')?.value;
                const delay = document.getElementById('delay')?.value || 1;
                
                // Validation
                if (!cookie || !postLink || !limit) {
                    addLog('❌ Please fill all required fields', 'error');
                    return;
                }
                
                // Show loading state for this specific process
                const startBtn = document.getElementById('startBtn');
                const stopBtn = document.getElementById('stopBtn');
                
                if (startBtn) {
                    startBtn.disabled = true;
                    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
                }
                if (stopBtn) {
                    stopBtn.disabled = false;
                }
                
                try {
                    console.log('Sending share request...');
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
                    console.log('Share response:', data);
                    
                    if (data.status) {
                        const processId = data.processId;
                        
                        // Store process info
                        activeProcesses.set(processId, {
                            id: processId,
                            status: 'starting',
                            link: postLink,
                            limit: limit,
                            startTime: new Date()
                        });
                        
                        addLog(`🚀 Process #${processId.substring(0, 8)} started`, 'success');
                        addLog(`📊 Target: ${limit} shares to ${postLink}`, 'info');
                        addLog(`🔄 Process added. Active processes: ${activeProcesses.size}`, 'info');
                        
                        // Start polling for this specific process
                        startProcessPolling(processId);
                        
                        // Re-enable start button for new processes
                        if (startBtn) {
                            setTimeout(() => {
                                startBtn.disabled = false;
                                startBtn.innerHTML = '<i class="fas fa-rocket"></i> Start New Boost';
                            }, 1000);
                        }
                        
                    } else {
                        addLog(`❌ Error: ${data.message}`, 'error');
                        resetForm();
                    }
                } catch (error) {
                    console.error('Fetch error:', error);
                    addLog(`❌ Network error: ${error.message}`, 'error');
                    resetForm();
                }
            });
        }

        // Stop ALL Processes Button
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', function() {
                if (activeProcesses.size > 0) {
                    if (confirm(`Stop all ${activeProcesses.size} active processes?`)) {
                        stopAllProcesses();
                        addLog('🛑 All processes stopped by user', 'warning');
                    }
                } else {
                    addLog('ℹ️ No active processes to stop', 'info');
                }
            });
        }

        // Reset Button
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                resetForm();
                resetProgress();
                addLog('🔄 Form reset', 'info');
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
                            addLog('🗑️ History cleared successfully', 'success');
                        }
                    } catch (error) {
                        addLog('❌ Error clearing history', 'error');
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

    // Process Polling - FIXED with auto-stop
    function startProcessPolling(processId) {
        // Clear any existing interval for this process
        if (processIntervals.has(processId)) {
            clearInterval(processIntervals.get(processId));
        }
        
        const intervalId = setInterval(async () => {
            try {
                const response = await fetch(`/api/process/${processId}`);
                const data = await response.json();
                
                if (data.status && data.process) {
                    const process = data.process;
                    
                    // Update stored process info
                    if (activeProcesses.has(processId)) {
                        activeProcesses.set(processId, {
                            ...activeProcesses.get(processId),
                            ...process
                        });
                    }
                    
                    // Update UI progress
                    updateProgress(process);
                    
                    // Check if process is completed
                    if (process.status === 'completed' || 
                        process.status === 'failed' || 
                        process.status === 'stopped') {
                        
                        // Clear interval for this process
                        clearInterval(intervalId);
                        processIntervals.delete(processId);
                        
                        // Remove from active processes after delay
                        setTimeout(() => {
                            activeProcesses.delete(processId);
                            addLog(`📋 Process #${processId.substring(0, 8)} removed. Active: ${activeProcesses.size}`, 'info');
                            updateProcessCounter();
                        }, 3000);
                        
                        // Log final results
                        if (process.status === 'completed') {
                            const successRate = Math.round((process.success / process.total) * 100);
                            addLog(`✅ Process #${processId.substring(0, 8)} COMPLETED!`, 'success');
                            addLog(`📊 Results: ${process.success}/${process.total} successful (${successRate}% success rate)`, 'info');
                            addLog(`⏱️ Duration: ${(process.duration / 1000).toFixed(1)} seconds`, 'info');
                        } else if (process.status === 'failed') {
                            addLog(`❌ Process #${processId.substring(0, 8)} FAILED: ${process.error || 'Unknown error'}`, 'error');
                        } else if (process.status === 'stopped') {
                            addLog(`🛑 Process #${processId.substring(0, 8)} STOPPED`, 'warning');
                            addLog(`📊 Partial results: ${process.success}/${process.current} successful`, 'info');
                        }
                        
                        // Update stats
                        updateStats();
                        
                        // Update stop button state
                        updateStopButtonState();
                        
                    }
                } else {
                    // Process not found - might have been cleaned up
                    clearInterval(intervalId);
                    processIntervals.delete(processId);
                    activeProcesses.delete(processId);
                    
                    if (data.message) {
                        addLog(`⚠️ Process #${processId.substring(0, 8)}: ${data.message}`, 'warning');
                    }
                    
                    updateProcessCounter();
                    updateStopButtonState();
                }
            } catch (error) {
                console.error(`Polling error for process ${processId}:`, error);
                // Don't clear interval on network errors, keep trying
            }
        }, 1500); // Poll every 1.5 seconds
        
        // Store interval ID
        processIntervals.set(processId, intervalId);
        
        // Update process counter
        updateProcessCounter();
        updateStopButtonState();
    }

    // Update Progress Display
    function updateProgress(process) {
        // Get or create progress container for this process
        let progressContainer = document.getElementById(`progress-${process.id}`);
        
        if (!progressContainer) {
            // Create new progress container for this process
            progressContainer = document.createElement('div');
            progressContainer.id = `progress-${process.id}`;
            progressContainer.className = 'process-container';
            
            const progressBox = document.querySelector('.progress-box');
            if (progressBox) {
                // Insert after existing progress
                progressBox.parentNode.insertBefore(progressContainer, progressBox.nextSibling);
            }
        }
        
        // Update progress content
        const percentage = Math.min(100, (process.current / process.total) * 100);
        const successRate = process.current > 0 ? Math.round((process.success / process.current) * 100) : 0;
        
        progressContainer.innerHTML = `
            <div class="process-header">
                <strong>Process #${process.id.substring(0, 8)}</strong>
                <span class="status-badge ${process.status}">${process.status.toUpperCase()}</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="progress-info">
                    <span>${percentage.toFixed(1)}%</span>
                    <span>${process.current}/${process.total}</span>
                    <span>✅ ${process.success}</span>
                    <span>❌ ${process.failed}</span>
                    <span>${successRate}% success</span>
                </div>
            </div>
            <div class="process-details">
                <small>Link: ${process.link.substring(0, 50)}...</small>
                <small>Started: ${new Date(process.startTime).toLocaleTimeString()}</small>
            </div>
        `;
        
        // Add detailed log for significant progress updates
        if (process.current % 25 === 0 || process.current === process.total) {
            addLog(`📈 Process #${process.id.substring(0, 8)}: ${process.current}/${process.total} (${process.success}✅ ${process.failed}❌)`, 'info');
        }
    }

    // Stop all processes
    function stopAllProcesses() {
        // Clear all intervals
        processIntervals.forEach((intervalId, processId) => {
            clearInterval(intervalId);
        });
        
        processIntervals.clear();
        activeProcesses.clear();
        
        // Reset UI
        resetForm();
        resetProgress();
        
        // Clear process containers
        document.querySelectorAll('.process-container').forEach(el => el.remove());
        
        // Update process counter
        updateProcessCounter();
    }

    // Update process counter display
    function updateProcessCounter() {
        const counterEl = document.getElementById('processCounter');
        if (counterEl) {
            counterEl.textContent = activeProcesses.size;
            counterEl.className = activeProcesses.size > 0 ? 'active' : '';
        }
    }

    // Update stop button state
    function updateStopButtonState() {
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            stopBtn.disabled = activeProcesses.size === 0;
            stopBtn.innerHTML = activeProcesses.size > 0 
                ? `<i class="fas fa-stop-circle"></i> Stop All (${activeProcesses.size})` 
                : `<i class="fas fa-stop-circle"></i> Stop`;
        }
    }

    // Reset Form
    function resetForm() {
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-rocket"></i> Start New Boost';
        }
        
        updateStopButtonState();
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
        
        // Clear all process containers except the main one
        document.querySelectorAll('.process-container').forEach(el => {
            if (!el.id.startsWith('progress-main')) {
                el.remove();
            }
        });
    }

    // Add Log Entry
    function addLog(message, type = 'info') {
        const logBox = document.getElementById('logBox');
        if (!logBox) return;
        
        const time = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        // Add icons based on type
        let icon = '📝';
        if (type === 'success') icon = '✅';
        else if (type === 'error') icon = '❌';
        else if (type === 'warning') icon = '⚠️';
        else if (type === 'info') icon = 'ℹ️';
        
        logEntry.innerHTML = `
            <span class="log-time">[${time}]</span>
            <span class="log-icon">${icon}</span>
            <span class="log-message ${type}">${message}</span>
        `;
        
        logBox.appendChild(logEntry);
        logBox.scrollTop = logBox.scrollHeight;
        
        // Keep only last 100 log entries
        const entries = logBox.querySelectorAll('.log-entry');
        if (entries.length > 100) {
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
                const successRateEl = document.getElementById('successRate');
                
                if (totalSharesEl) totalSharesEl.textContent = data.stats.totalShares;
                if (successfulSharesEl) successfulSharesEl.textContent = data.stats.successfulShares;
                if (failedSharesEl) failedSharesEl.textContent = data.stats.failedShares;
                if (activeProcessesEl) activeProcessesEl.textContent = data.stats.activeProcesses;
                
                // Calculate and display success rate
                if (successRateEl && data.stats.totalShares > 0) {
                    const successRate = Math.round((data.stats.successfulShares / data.stats.totalShares) * 100);
                    successRateEl.textContent = `${successRate}%`;
                    successRateEl.style.color = successRate >= 80 ? '#4CAF50' : 
                                               successRate >= 60 ? '#FF9800' : '#F44336';
                }
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
                data.history.forEach((item, index) => {
                    const date = new Date(item.date).toLocaleString();
                    const successRate = Math.round((item.success / item.total) * 100);
                    const duration = (item.duration / 1000).toFixed(1);
                    
                    html += `
                        <div class="history-item">
                            <div class="history-header">
                                <strong>#${index + 1} - ${date}</strong>
                                <span class="badge ${successRate >= 80 ? 'success' : successRate >= 60 ? 'warning' : 'error'}">
                                    ${item.success}/${item.total} (${successRate}%)
                                </span>
                            </div>
                            <p class="history-link">${item.link}</p>
                            <div class="history-footer">
                                <small>⏱️ ${duration}s</small>
                                <small>🆔 ${item.id.substring(0, 8)}</small>
                            </div>
                        </div>
                    `;
                });
                historyList.innerHTML = html;
            } else {
                historyList.innerHTML = '<p class="loading">No history found</p>';
            }
        } catch (error) {
            historyList.innerHTML = '<p class="error">❌ Error loading history</p>';
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
                    Math.round((stats.successfulShares / stats.totalShares) * 100) : 0;
                
                statsDetails.innerHTML = `
                    <div class="stats-grid">
                        <div class="stat-detail">
                            <h3>📊 Total Shares</h3>
                            <p class="stat-value">${stats.totalShares.toLocaleString()}</p>
                        </div>
                        <div class="stat-detail">
                            <h3>✅ Successful</h3>
                            <p class="stat-value" style="color: #4CAF50;">${stats.successfulShares.toLocaleString()}</p>
                        </div>
                        <div class="stat-detail">
                            <h3>❌ Failed</h3>
                            <p class="stat-value" style="color: #f44336;">${stats.failedShares.toLocaleString()}</p>
                        </div>
                        <div class="stat-detail">
                            <h3>📈 Success Rate</h3>
                            <p class="stat-value" style="color: ${successRate >= 80 ? '#4CAF50' : successRate >= 60 ? '#FF9800' : '#F44336'};">${successRate}%</p>
                        </div>
                        <div class="stat-detail">
                            <h3>🔄 Active Processes</h3>
                            <p class="stat-value">${stats.activeProcesses}</p>
                        </div>
                        <div class="stat-detail">
                            <h3>⚡ Avg. Speed</h3>
                            <p class="stat-value">${stats.totalShares > 0 ? Math.round(stats.totalShares / 10) : 0}/min</p>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            statsDetails.innerHTML = '<p class="error">❌ Error loading statistics</p>';
        }
    }

    // Load Active Processes
    async function loadActiveProcesses() {
        const processList = document.getElementById('processList');
        if (!processList) return;
        
        if (activeProcesses.size > 0) {
            let html = '';
            activeProcesses.forEach((process, processId) => {
                const elapsed = Math.round((new Date() - new Date(process.startTime)) / 1000);
                html += `
                    <div class="process-item">
                        <div class="process-item-header">
                            <h4>🔄 Process #${processId.substring(0, 8)}</h4>
                            <span class="status ${process.status}">${process.status}</span>
                        </div>
                        <div class="process-item-details">
                            <p><strong>Link:</strong> ${process.link.substring(0, 60)}...</p>
                            <p><strong>Target:</strong> ${process.limit} shares</p>
                            <p><strong>Running:</strong> ${elapsed} seconds</p>
                            <button onclick="stopProcess('${processId}')" class="btn-stop-small">
                                <i class="fas fa-stop"></i> Stop This Process
                            </button>
                        </div>
                    </div>
                `;
            });
            processList.innerHTML = html;
        } else {
            processList.innerHTML = '<p class="loading">No active processes running.</p>';
        }
    }

    // Global function to stop specific process
    window.stopProcess = function(processId) {
        if (confirm('Stop this specific process?')) {
            fetch(`/api/process/${processId}/stop`, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.status) {
                        addLog(`🛑 Process #${processId.substring(0, 8)} stopped`, 'warning');
                    }
                })
                .catch(err => {
                    addLog(`❌ Failed to stop process: ${err.message}`, 'error');
                });
        }
    };

    // Auto-refresh stats every 30 seconds
    setInterval(updateStats, 30000);
    
    // Clean up finished processes every minute
    setInterval(() => {
        processIntervals.forEach((intervalId, processId) => {
            // Check if process is still in activeProcesses
            if (!activeProcesses.has(processId)) {
                clearInterval(intervalId);
                processIntervals.delete(processId);
            }
        });
    }, 60000);
});
