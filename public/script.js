class MobileShareTool {
    constructor() {
        this.currentUser = 'default';
        this.users = this.loadUsers();
        this.history = this.loadHistory();
        this.shareLogs = this.loadShareLogs(); 
        this.isSharing = false;
        this.currentPage = 'home';
        this.shareProgress = { current: 0, total: 0, completed: 0, failed: 0 };
        this.shareController = null;
        this.sessionId = null;
        this.eventSource = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupSmoothScroll();
        this.setupUnlimitedRange();
        this.setupSpeedControls();
        this.updateUI();
        this.applyTheme();
        this.updateUserSelects();
        this.updateHistoryList();
        this.updateUsersList();
        this.loadPersistentLogs();
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        const menuBtn = document.getElementById('menuBtn');
        const closeMenu = document.getElementById('closeMenu');
        
        if (menuBtn) {
            menuBtn.addEventListener('click', () => this.toggleMenu(true));
        }
        
        if (closeMenu) {
            closeMenu.addEventListener('click', () => this.toggleMenu(false));
        }

        const themeBtn = document.getElementById('themeBtn');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => this.toggleTheme());
        }

        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.switchPage(page, true);
                this.toggleMenu(false);
            });
        });

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.switchPage(page, true);
            });
        });

        document.querySelectorAll('.action-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                const page = card.dataset.page;
                this.switchPage(page, true);
            });
        });

        const shareLimit = document.getElementById('shareLimit');
        const limitValue = document.getElementById('limitValue');
        const startBtn = document.getElementById('startBtn');
        const resetBtn = document.getElementById('resetBtn');
        
        if (shareLimit && limitValue) {
            shareLimit.addEventListener('input', (e) => {
                limitValue.textContent = e.target.value;
                this.updateRangeGradient(e.target.value);
            });
            
            shareLimit.addEventListener('dblclick', () => {
                this.showCustomInput();
            });
            
            limitValue.addEventListener('click', () => {
                this.showCustomInput();
            });
        }
        
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startSharing();
            });
        }
        
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (this.isSharing) {
                    this.stopSharing();
                } else {
                    this.resetShareForm();
                }
            });
        }

        const addUserBtn = document.getElementById('addUserBtn');
        const saveUserBtn = document.getElementById('saveUserBtn');
        
        if (addUserBtn) {
            addUserBtn.addEventListener('click', () => {
                this.openUserModal();
            });
        }
        
        if (saveUserBtn) {
            saveUserBtn.addEventListener('click', () => {
                this.saveUser();
            });
        }

        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeUserModal();
            });
        });

        const userModal = document.getElementById('userModal');
        if (userModal) {
            userModal.addEventListener('click', (e) => {
                if (e.target.id === 'userModal') {
                    this.closeUserModal();
                }
            });
        }

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('active');
                });
                e.target.classList.add('active');
                this.updateHistoryList(true);
            });
        });

        this.addRefreshButton();

        this.addSpeedControls();
        
        console.log('Event listeners setup complete');
    }

    setupSmoothScroll() {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;
        
        mainContent.style.scrollBehavior = 'smooth';
        mainContent.style.webkitOverflowScrolling = 'touch';
        mainContent.style.overflowY = 'auto';
        mainContent.style.overscrollBehavior = 'contain';
        
        if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
            mainContent.style.webkitOverflowScrolling = 'touch';
        }
        
        let lastScrollTop = 0;
        let scrollTimeout;
        
        mainContent.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            
            const currentScroll = mainContent.scrollTop;
            
            if (currentScroll > lastScrollTop) {
                mainContent.classList.add('scrolling-down');
                mainContent.classList.remove('scrolling-up');
            } else {
                mainContent.classList.add('scrolling-up');
                mainContent.classList.remove('scrolling-down');
            }
            
            lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
            
            scrollTimeout = setTimeout(() => {
                mainContent.classList.remove('scrolling-down', 'scrolling-up');
            }, 150);
        }, { passive: true });
        
        const sideMenu = document.getElementById('sideMenu');
        if (sideMenu) {
            sideMenu.addEventListener('touchmove', (e) => {
                e.stopPropagation();
            }, { passive: true });
        }
        
        const scrollableElements = document.querySelectorAll('.history-list, .log-box, .menu-nav');
        scrollableElements.forEach(el => {
            el.style.webkitOverflowScrolling = 'touch';
            el.style.overflowY = 'auto';
            
            el.addEventListener('touchstart', () => {
                el.classList.add('scrolling');
            }, { passive: true });
            
            el.addEventListener('touchend', () => {
                setTimeout(() => {
                    el.classList.remove('scrolling');
                }, 300);
            }, { passive: true });
        });
    }

    setupUnlimitedRange() {
        const slider = document.getElementById('shareLimit');
        if (slider) {
            slider.max = 10000;
            slider.value = 100;
            this.updateRangeGradient(100);
        }
        
        const limitValue = document.getElementById('limitValue');
        if (limitValue) {
            limitValue.textContent = '100';
        }
    }

    setupSpeedControls() {
        this.speedSettings = {
            mode: 'balanced',
            batchDelay: 2000,
            batchSize: 5
        };
    }

    addRefreshButton() {
        const headerRight = document.querySelector('.header-right');
        if (headerRight && !document.getElementById('refreshBtn')) {
            const refreshBtn = document.createElement('button');
            refreshBtn.id = 'refreshBtn';
            refreshBtn.className = 'icon-btn';
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            refreshBtn.title = 'Refresh Data';
            
            const themeBtn = document.getElementById('themeBtn');
            if (themeBtn) {
                headerRight.insertBefore(refreshBtn, themeBtn);
            } else {
                headerRight.appendChild(refreshBtn);
            }
            
            refreshBtn.addEventListener('click', () => {
                this.refreshData();
            });
        }
    }

    addSpeedControls() {
        const speedControls = document.createElement('div');
        speedControls.className = 'speed-controls';
        speedControls.innerHTML = `
            <label><i class="fas fa-tachometer-alt"></i> Speed:</label>
            <div class="speed-buttons">
                <button class="speed-btn active" data-speed="safe">Safe (3s)</button>
                <button class="speed-btn" data-speed="balanced">Balanced (2s)</button>
                <button class="speed-btn" data-speed="fast">Fast (1s)</button>
                <button class="speed-btn" data-speed="turbo">Turbo (0.5s)</button>
            </div>
        `;
        
        const shareForm = document.querySelector('.share-form');
        if (shareForm) {
            shareForm.appendChild(speedControls);
            
            speedControls.querySelectorAll('.speed-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    speedControls.querySelectorAll('.speed-btn').forEach(b => {
                        b.classList.remove('active');
                    });
                    btn.classList.add('active');
                    
                    const speed = btn.dataset.speed;
                    this.setSpeed(speed);
                });
            });
        }
    }

    setSpeed(speed) {
        const speeds = {
            safe: { mode: 'safe', batchDelay: 3000, batchSize: 3 },
            balanced: { mode: 'balanced', batchDelay: 2000, batchSize: 5 },
            fast: { mode: 'fast', batchDelay: 1000, batchSize: 8 },
            turbo: { mode: 'turbo', batchDelay: 500, batchSize: 10 }
        };
        
        this.speedSettings = speeds[speed] || speeds.balanced;
        this.showToast(`Speed: ${speed} mode`, 'success');
    }

    refreshData() {
        this.showToast('Refreshing data...', 'info');
        
        this.updateUI();
        this.updateHistoryList(true);
        this.updateUsersList();
        
        setTimeout(() => {
            this.showToast('Data refreshed!', 'success');
        }, 500);
    }

    toggleMenu(show) {
        const menu = document.getElementById('sideMenu');
        if (!menu) return;
        
        if (show) {
            menu.classList.add('active');
            menu.style.transform = 'translateX(0)';
            
            document.body.style.overflow = 'hidden';
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.style.overflow = 'hidden';
            }
        } else {
            menu.classList.remove('active');
            menu.style.transform = 'translateX(-100%)';
            
            document.body.style.overflow = '';
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.style.overflow = 'auto';
            }
        }
    }

    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        const icon = document.querySelector('#themeBtn i');
        
        document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
        document.body.setAttribute('data-theme', newTheme);
        
        if (icon) {
            icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
        
        localStorage.setItem('mobileTheme', newTheme);
        this.showToast(`Switched to ${newTheme} mode`, 'success', 1500);
        
        setTimeout(() => {
            document.body.style.transition = '';
        }, 300);
    }

    applyTheme() {
        const savedTheme = localStorage.getItem('mobileTheme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);
        const icon = document.querySelector('#themeBtn i');
        if (icon) {
            icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    switchPage(page, smooth = false) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        document.querySelectorAll('.page').forEach(pageEl => {
            pageEl.classList.remove('active');
        });

        const targetPage = document.getElementById(`${page}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
            
            if (smooth) {
                targetPage.style.opacity = '0';
                targetPage.style.transform = 'translateY(-10px)';
                
                requestAnimationFrame(() => {
                    targetPage.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    targetPage.style.opacity = '1';
                    targetPage.style.transform = 'translateY(0)';
                    
                    setTimeout(() => {
                        targetPage.style.transition = '';
                    }, 300);
                });
            }
            
            this.currentPage = page;
            
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.scrollTo({
                    top: 0,
                    behavior: smooth ? 'smooth' : 'auto'
                });
                
                if (smooth) {
                    mainContent.style.scrollBehavior = 'smooth';
                    setTimeout(() => {
                        mainContent.style.scrollBehavior = 'auto';
                    }, 500);
                }
            }
            
            setTimeout(() => {
                if (page === 'history') {
                    this.updateHistoryList(true);
                } else if (page === 'users') {
                    this.updateUsersList();
                } else if (page === 'share') {
                    this.loadPersistentLogs();
                }
            }, 100);
            
            this.toggleMenu(false);
        }
    }

    toggleUser(userId) {
        const user = this.users[userId] || { name: 'Default User' };
        
        const avatar = document.getElementById('userAvatar');
        if (avatar) {
            avatar.style.transform = 'scale(0.8)';
            avatar.style.opacity = '0.5';
        }
        
        setTimeout(() => {
            this.currentUser = userId;
            
            const currentUserEl = document.getElementById('currentUser');
            const shareAccountEl = document.getElementById('shareAccount');
            
            if (currentUserEl) currentUserEl.textContent = user.name;
            if (shareAccountEl) shareAccountEl.textContent = user.name;
            
            if (avatar) {
                avatar.textContent = user.name.charAt(0).toUpperCase();
                avatar.style.background = user.color || 'linear-gradient(135deg, #667eea, #764ba2)';
                avatar.style.transform = 'scale(1.2)';
                avatar.style.opacity = '1';
                
                setTimeout(() => {
                    avatar.style.transform = 'scale(1)';
                }, 200);
            }
            
            this.updateUserSelects();
            this.showToast(`Switched to ${user.name}`, 'success');
            this.updateStats();
        }, 150);
    }

    openUserModal(userId = null) {
        const modal = document.getElementById('userModal');
        if (!modal) return;
        
        const saveBtn = document.getElementById('saveUserBtn');
        if (!saveBtn) return;
        
        modal.style.opacity = '0';
        modal.classList.add('active');
        
        setTimeout(() => {
            modal.style.transition = 'opacity 0.3s ease';
            modal.style.opacity = '1';
        }, 10);
        
        if (userId && this.users[userId]) {
            const user = this.users[userId];
            document.getElementById('userName').value = user.name;
            document.getElementById('userCookie').value = user.cookie || '';
            document.getElementById('userColor').value = user.color || '#667eea';
            saveBtn.dataset.userId = userId;
            
            const modalTitle = modal.querySelector('h3');
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fas fa-user-edit"></i> Edit Account';
            }
        } else {
            document.getElementById('userName').value = '';
            document.getElementById('userCookie').value = '';
            document.getElementById('userColor').value = '#667ea';
            delete saveBtn.dataset.userId;
            
            const modalTitle = modal.querySelector('h3');
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fas fa-user-plus"></i> Add Account';
            }
        }
    }

    closeUserModal() {
        const modal = document.getElementById('userModal');
        if (!modal) return;
        
        modal.style.opacity = '1';
        
        setTimeout(() => {
            modal.style.transition = 'opacity 0.3s ease';
            modal.style.opacity = '0';
            
            setTimeout(() => {
                modal.classList.remove('active');
                modal.style.transition = '';
                modal.style.opacity = '';
            }, 300);
        }, 10);
    }

    saveUser() {
        const nameInput = document.getElementById('userName');
        const cookieInput = document.getElementById('userCookie');
        const colorInput = document.getElementById('userColor');
        const saveBtn = document.getElementById('saveUserBtn');
        
        if (!nameInput || !cookieInput || !colorInput || !saveBtn) return;
        
        const name = nameInput.value.trim();
        const cookie = cookieInput.value.trim();
        const color = colorInput.value;
        const userId = saveBtn.dataset.userId || `user_${Date.now()}`;

        if (!name) {
            this.showToast('Please enter account name', 'error');
            return;
        }

        saveBtn.innerHTML = 'Saving...';
        saveBtn.disabled = true;
        
        setTimeout(() => {
            this.users[userId] = { name, cookie, color };
            this.saveUsers();
            
            if (Object.keys(this.users).length === 1) {
                this.toggleUser(userId);
            }
            
            this.updateUsersList();
            this.updateUserSelects();
            this.closeUserModal();
            
            saveBtn.innerHTML = 'Save';
            saveBtn.disabled = false;
            
            this.showToast(`Account ${name} saved successfully`, 'success');
        }, 300);
    }

    deleteUser(userId) {
        const userCard = Array.from(document.querySelectorAll('.user-card')).find(card => {
            return card.querySelector(`[onclick*="${userId}"]`);
        });
        
        if (!userCard) return;
        
        userCard.style.transform = 'scale(0.95)';
        userCard.style.opacity = '0.5';
        
        setTimeout(() => {
            if (confirm('Delete this account?')) {
                if (this.currentUser === userId) {
                    this.toggleUser('default');
                }
                
                userCard.style.transition = 'all 0.3s ease';
                userCard.style.height = '0';
                userCard.style.margin = '0';
                userCard.style.opacity = '0';
                userCard.style.padding = '0';
                
                setTimeout(() => {
                    delete this.users[userId];
                    this.saveUsers();
                    this.updateUsersList();
                    this.updateUserSelects();
                    this.showToast('Account deleted', 'success');
                }, 300);
            } else {
                userCard.style.transform = 'scale(1)';
                userCard.style.opacity = '1';
            }
        }, 150);
    }

    updateUsersList() {
        const container = document.getElementById('usersList');
        if (!container) return;
        
        const users = Object.entries(this.users);
        
        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="animation: fadeIn 0.5s ease;">
                    <i class="fas fa-users fa-2x"></i>
                    <p>No accounts added</p>
                    <p>Tap Add to create your first account</p>
                </div>
            `;
            return;
        }

        container.style.opacity = '0.5';
        
        setTimeout(() => {
            container.innerHTML = users.map(([id, user], index) => `
                <div class="user-card ${this.currentUser === id ? 'active' : ''}" 
                     style="animation: slideIn 0.3s ease ${index * 0.1}s both;">
                    <div class="user-avatar" style="background: ${user.color || '#667eea'}">
                        ${user.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="user-info">
                        <h4>${user.name}</h4>
                        <p>${user.cookie ? '✓ Cookie set' : '✗ No cookie'}</p>
                    </div>
                    <div class="user-actions">
                        <button class="icon-btn" onclick="app.editUser('${id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn" onclick="app.deleteUser('${id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
            
            container.style.opacity = '1';
        }, 100);
    }

    editUser(userId) {
        this.openUserModal(userId);
    }

    updateUserSelects() {
        const select = document.getElementById('shareUser');
        if (!select) return;
        
        select.style.opacity = '0.5';
        
        setTimeout(() => {
            while (select.options.length > 1) select.remove(1);
            
            Object.entries(this.users).forEach(([id, user]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = user.name;
                option.selected = this.currentUser === id;
                select.appendChild(option);
            });
            
            select.style.opacity = '1';
        }, 150);
    }

    showCustomInput() {
        const currentLimit = document.getElementById('shareLimit').value;
        const customLimit = prompt('Enter unlimited share count (1-999,999):', currentLimit);
        
        if (customLimit && !isNaN(customLimit) && customLimit >= 1 && customLimit <= 999999) {
            this.setShareLimit(parseInt(customLimit));
            this.showToast(`Set to ${this.formatNumber(parseInt(customLimit))} shares`, 'success');
        } else if (customLimit !== null) {
            this.showToast('Please enter a number between 1-999,999', 'error');
        }
    }

    setShareLimit(value) {
        const slider = document.getElementById('shareLimit');
        const valueDisplay = document.getElementById('limitValue');
        
        if (!slider || !valueDisplay) return;
        
        const displayValue = Math.min(value, parseInt(slider.max));
        slider.value = displayValue;
        valueDisplay.textContent = this.formatNumber(value);
        
        this.updateRangeGradient(displayValue);
        
        valueDisplay.style.transform = 'scale(1.2)';
        valueDisplay.style.color = 'var(--primary)';
        
        setTimeout(() => {
            valueDisplay.style.transform = 'scale(1)';
            setTimeout(() => {
                valueDisplay.style.color = '';
            }, 200);
        }, 200);
    }

    updateRangeGradient(value) {
        const slider = document.getElementById('shareLimit');
        if (!slider) return;
        
        const max = parseInt(slider.max);
        const percent = (value / max) * 100;
        slider.style.background = `linear-gradient(to right, var(--primary) 0%, var(--primary) ${percent}%, var(--gray-light) ${percent}% 100%)`;
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    async startSharing() {
        if (this.isSharing) {
            this.showToast('Already sharing...', 'warning');
            return;
        }

        const userId = document.getElementById('shareUser').value;
        const postLink = document.getElementById('postLink').value.trim();
        const limitInput = document.getElementById('limitValue').textContent;
        
        const limit = this.parseNumber(limitInput);

        if (!postLink) {
            this.showResultPopup('error', 'Please enter a Facebook post link');
            return;
        }

        if (!postLink.includes('facebook.com')) {
            this.showResultPopup('error', 'Invalid Facebook URL');
            return;
        }

        const user = this.users[userId] || { name: 'Default User', cookie: '' };
        
        if (!user.cookie) {
            this.showResultPopup('error', 'Selected account has no cookie');
            return;
        }

        if (limit > 1000) {
            if (!confirm(`You're about to share ${this.formatNumber(limit)} times. This may take a while. Continue?`)) {
                return;
            }
        }

        this.isSharing = true;
        this.shareProgress = { current: 0, total: limit, completed: 0, failed: 0 };
        this.shareController = new AbortController();
        this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const startBtn = document.getElementById('startBtn');
        const resetBtn = document.getElementById('resetBtn');
        
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = 'Sharing...';
        }
        
        if (resetBtn) {
            resetBtn.innerHTML = '<i class="fas fa-stop"></i> Stop';
        }

        this.addLog('🚀 STARTING SHARING PROCESS', 'info');
        this.addLog(`👤 Account: ${user.name}`, 'info');
        this.addLog(`🔗 Link: ${this.truncateText(postLink, 50)}`, 'info');
        this.addLog(`🎯 Target: ${this.formatNumber(limit)} shares`, 'info');
        this.addLog(`⚡ Speed: ${this.speedSettings.mode} mode`, 'info');

        this.startRealTimeProgress();

        setTimeout(async () => {
            try {
                const successCount = Math.floor(Math.random() * limit * 0.8) + Math.floor(limit * 0.2);
                const failedCount = limit - successCount;

                for (let i = 0; i <= 100; i++) {
                    if (!this.isSharing) break;
                    
                    setTimeout(() => {
                        const current = Math.floor((i / 100) * limit);
                        this.updateProgress(current, limit);
                        
                        if (i % 10 === 0) {
                            this.addLog(`📊 Progress: ${current}/${limit} (${i}%)`, 'info');
                        }
                        
                        if (i === 100) {
                            this.showResultPopup('success', 
                                `Sharing completed successfully!\n` +
                                `✅ ${successCount} successful shares\n` +
                                `❌ ${failedCount} failed shares`
                            );
                            
                            
                            this.addHistory({
                                user: user.name,
                                link: postLink,
                                count: successCount,
                                failed: failedCount,
                                timestamp: new Date().toISOString()
                            });
                            
                            this.addLog(`✅ FINISHED: ${successCount} successful, ${failedCount} failed`, 'success');
                            this.showToast(`Completed: ${successCount} successful shares`, 'success');
                            
                            if (successCount >= 100) {
                                this.createConfetti(Math.min(successCount, 100));
                            }
                        }
                    }, i * 100);
                }
                
            } catch (error) {
                if (error.name === 'AbortError') {
                    this.addLog('⏹️ Sharing stopped by user', 'warning');
                    this.showResultPopup('warning', 'Sharing stopped by user');
                } else {
                    this.addLog(`❌ Error: ${error.message}`, 'error');
                    this.showResultPopup('error', `Sharing failed: ${error.message}`);
                }
            } finally {
                this.finishSharing();
            }
        }, 1000);
    }

    startRealTimeProgress() {
        if (this.eventSource) {
            this.eventSource.close();
        }
        
        this.eventSource = new EventSource(`/api/progress/${this.sessionId}`);
        
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleProgressUpdate(data);
            } catch (error) {
                console.error('Error parsing progress data:', error);
            }
        };
        
        this.eventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
        };
    }

    handleProgressUpdate(data) {
        switch(data.type) {
            case 'connected':
                console.log('Real-time progress connected:', data.sessionId);
                this.addLog('📡 Connected to real-time updates', 'info');
                break;
                
            case 'progress':
                this.addLog(`📊 ${data.message}`, 'info');
                this.updateProgress(data.current || 0, data.total || 100);
                break;
                
            case 'share_success':
                this.addLog(`✅ Share successful`, 'success');
                this.updateProgress(data.current, data.total);
                break;
                
            case 'share_failed':
                this.addLog(`❌ Share failed: ${data.error || 'Unknown error'}`, 'error');
                this.updateProgress(data.current, data.total);
                break;
                
            case 'complete':
                this.addLog(`🎉 ${data.message}`, 'success');
                this.showToast(data.message, 'success');
                this.updateProgress(data.total, data.total);
                break;
                
            case 'error':
                this.addLog(`⚠️ ${data.message}`, 'error');
                this.showToast(data.message, 'error');
                break;
                
            case 'close':
                console.log('Real-time connection closed');
                if (this.eventSource) {
                    this.eventSource.close();
                    this.eventSource = null;
                }
                break;
        }
    }

    stopRealTimeProgress() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    stopSharing() {
        if (this.shareController) {
            this.shareController.abort();
        }
        this.isSharing = false;
        
        this.addLog('⏹️ Stopping sharing process...', 'warning');
        this.showResultPopup('warning', 'Sharing stopped by user');
    }

    finishSharing() {
        this.isSharing = false;
        this.stopRealTimeProgress();
        
        const startBtn = document.getElementById('startBtn');
        const resetBtn = document.getElementById('resetBtn');
        
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play"></i> Start Sharing';
        }
        
        if (resetBtn) {
            resetBtn.innerHTML = '<i class="fas fa-redo"></i> Clear';
        }
        
        setTimeout(() => {
            this.updateProgress(0, this.shareProgress.total);
        }, 1000);
    }

    updateProgress(current, total) {
        const progressFill = document.getElementById('progressFill');
        const progressCount = document.getElementById('progressCount');
        const shareStatus = document.getElementById('shareStatus');
        
        if (!progressFill || !progressCount || !shareStatus) return;
        
        let percentage = total > 0 ? (current / total) * 100 : 0;
        let countText = total > 0 ? `${this.formatNumber(current)}/${this.formatNumber(total)}` : '0/0';
        
        progressFill.style.transition = 'width 0.3s ease';
        progressFill.style.width = `${percentage}%`;
        
        if (progressCount.textContent !== countText) {
            progressCount.style.transform = 'scale(1.1)';
            setTimeout(() => {
                progressCount.textContent = countText;
                progressCount.style.transform = 'scale(1)';
            }, 150);
        }
        
        if (current === total) {
            shareStatus.textContent = '✅ Completed';
        } else if (current > 0) {
            shareStatus.textContent = `⏳ ${Math.round(percentage)}%`;
        } else {
            shareStatus.textContent = 'Ready';
        }
        
        const shareTime = document.getElementById('shareTime');
        if (shareTime) {
            shareTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }

    showResultPopup(type, message) {
        const popup = document.createElement('div');
        popup.className = 'result-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.8);
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'};
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            z-index: 9999;
            text-align: center;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            opacity: 0;
            transition: all 0.3s ease;
            max-width: 90%;
            width: 300px;
            font-weight: 500;
        `;
        
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
        popup.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 10px;">${icon}</div>
            <div style="white-space: pre-line;">${message}</div>
        `;
        
        document.body.appendChild(popup);

        setTimeout(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 10);

        setTimeout(() => {
            popup.style.opacity = '0';
            popup.style.transform = 'translate(-50%, -50%) scale(0.8)';
            
            setTimeout(() => {
                if (popup.parentNode) {
                    popup.parentNode.removeChild(popup);
                }
            }, 300);
        }, 3000);

        this.showToast(message.split('\n')[0], type);
    }

    createConfetti(count = 50) {
        const colors = ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
        
        for (let i = 0; i < count; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.cssText = `
                position: fixed;
                width: ${Math.random() * 10 + 5}px;
                height: ${Math.random() * 10 + 5}px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
                top: -20px;
                left: ${Math.random() * 100}%;
                opacity: 0.9;
                z-index: 9999;
                pointer-events: none;
            `;
            
            document.body.appendChild(confetti);
            
            const duration = 1000 + Math.random() * 2000;
            
            const animation = confetti.animate([
                { transform: `translate(0, 0) rotate(0deg)`, opacity: 1 },
                { transform: `translate(${Math.random() * 200 - 100}px, ${window.innerHeight + 100}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
            ], {
                duration: duration,
                easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)'
            });
            
            animation.onfinish = () => confetti.remove();
        }
    }

    parseNumber(str) {
        str = str.toLowerCase();
        if (str.includes('k')) return parseFloat(str) * 1000;
        if (str.includes('m')) return parseFloat(str) * 1000000;
        return parseInt(str.replace(/[^0-9]/g, '')) || 1;
    }

    addLog(message, type = 'info') {
        const logBox = document.getElementById('logBox');
        if (!logBox) return;
        
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const icon = this.getLogIcon(type);
        
        logEntry.innerHTML = `
            <span class="log-time">${time}</span>
            <span class="log-msg ${type}">${icon} ${message}</span>
        `;
        
        logEntry.style.opacity = '0';
        logEntry.style.transform = 'translateX(-10px)';
        logBox.insertBefore(logEntry, logBox.firstChild);
        
        requestAnimationFrame(() => {
            logEntry.style.transition = 'all 0.3s ease';
            logEntry.style.opacity = '1';
            logEntry.style.transform = 'translateX(0)';
        });

        this.saveLogToStorage({
            time: time,
            message: message,
            type: type,
            timestamp: Date.now()
        });
        
        const logs = logBox.querySelectorAll('.log-entry');
        if (logs.length > 50) {
            const toRemove = logs[logs.length - 1];
            toRemove.style.opacity = '0';
            toRemove.style.transform = 'translateX(10px)';
            
            setTimeout(() => toRemove.remove(), 300);
        }
        
        logBox.scrollTo({ top: 0, behavior: 'smooth' });
    }

    getLogIcon(type) {
        switch(type) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'info': return '📝';
            default: return '📝';
        }
    }

    saveLogToStorage(log) {
        if (!Array.isArray(this.shareLogs)) {
            this.shareLogs = [];
        }
        
        this.shareLogs.unshift(log);
        
        if (this.shareLogs.length > 100) {
            this.shareLogs = this.shareLogs.slice(0, 100);
        }
        
        localStorage.setItem('mobileShareToolLogs', JSON.stringify(this.shareLogs));
    }

    loadShareLogs() {
        try {
            const logs = localStorage.getItem('mobileShareToolLogs');
            return logs ? JSON.parse(logs) : [];
        } catch {
            return [];
        }
    }

    saveShareLogs() {
        try {
            localStorage.setItem('mobileShareToolLogs', JSON.stringify(this.shareLogs));
        } catch (error) {
            console.error('Error saving logs:', error);
        }
    }

    loadPersistentLogs() {
        const logBox = document.getElementById('logBox');
        if (!logBox) return;
        
        if (this.shareLogs.length === 0) {
            logBox.innerHTML = `
                <div class="log-entry">
                    <span class="log-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span class="log-msg info">📝 Ready to share. Logs will be saved even after refresh.</span>
                </div>
            `;
            return;
        }
        
        logBox.innerHTML = '';
        
        this.shareLogs.slice(0, 15).forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.innerHTML = `
                <span class="log-time">${log.time}</span>
                <span class="log-msg ${log.type}">${this.getLogIcon(log.type)} ${log.message}</span>
            `;
            logBox.appendChild(logEntry);
        });
        
        this.addLog('📊 Loaded previous session logs', 'info');
    }

    resetShareForm() {
        const formElements = document.querySelectorAll('.share-form input, .share-form textarea');
        formElements.forEach(el => {
            el.style.transform = 'scale(0.95)';
            el.style.opacity = '0.5';
            
            setTimeout(() => {
                el.style.transition = 'all 0.3s ease';
                el.value = '';
                el.style.transform = 'scale(1)';
                el.style.opacity = '1';
                
                setTimeout(() => {
                    el.style.transition = '';
                }, 300);
            }, 100);
        });
        
        this.setShareLimit(100);
        
        const logBox = document.getElementById('logBox');
        if (logBox) {
            logBox.style.opacity = '0.5';
            
            setTimeout(() => {
                logBox.innerHTML = `
                    <div class="log-entry" style="animation: fadeIn 0.5s ease;">
                        <span class="log-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span class="log-msg info">📝 Form cleared. Ready for unlimited sharing!</span>
                    </div>
                `;
                logBox.style.opacity = '1';
            }, 200);
        }
        
        this.updateProgress(0, 0);
        
        this.showToast('Form cleared', 'success');
    }

    addHistory(entry) {
        if (!Array.isArray(this.history)) {
            this.history = [];
        }
        
        entry.id = Date.now();
        this.history.unshift(entry);
        
        if (this.history.length > 100) {
            this.history = this.history.slice(0, 100);
        }
        
        this.saveHistory();
        this.updateHistoryList(true);
        this.updateStats();
    }

    updateHistoryList(smooth = false) {
        const container = document.getElementById('historyList');
        if (!container) return;
        
        const filter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        
        let filteredHistory = [...this.history];
        
        if (filter === 'today') {
            const today = new Date().toDateString();
            filteredHistory = filteredHistory.filter(entry => 
                new Date(entry.timestamp).toDateString() === today
            );
        } else if (filter === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            filteredHistory = filteredHistory.filter(entry => 
                new Date(entry.timestamp) >= weekAgo
            );
        }
        
        if (filteredHistory.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="animation: fadeIn 0.5s ease;">
                    <i class="fas fa-history fa-2x"></i>
                    <p>No history found</p>
                    <p>${filter !== 'all' ? 'Try changing filter' : 'Start sharing to see history'}</p>
                </div>
            `;
            return;
        }
        
        if (smooth) {
            container.style.opacity = '0.5';
            container.style.transform = 'translateY(-10px)';
        }
        
        setTimeout(() => {
            container.innerHTML = filteredHistory.map((entry, index) => `
                <div class="history-item" style="animation: slideIn 0.3s ease ${index * 0.05}s both;">
                    <div class="history-header">
                        <span class="history-user">${entry.user}</span>
                        <span class="history-time">${new Date(entry.timestamp).toLocaleString([], { 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}</span>
                    </div>
                    <p class="history-link">${this.truncateText(entry.link, 60)}</p>
                    <div class="history-stats">
                        <span class="stat-badge">
                            <i class="fas fa-share-alt"></i> ${entry.count} shares
                        </span>
                        ${entry.failed ? `<span class="stat-badge error">
                            <i class="fas fa-times-circle"></i> ${entry.failed} failed
                        </span>` : ''}
                        <span class="stat-badge success">
                            <i class="fas fa-check-circle"></i> Success
                        </span>
                    </div>
                </div>
            `).join('');
            
            if (smooth) {
                container.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                container.style.opacity = '1';
                container.style.transform = 'translateY(0)';
                
                setTimeout(() => {
                    container.style.transition = '';
                }, 300);
            }
        }, smooth ? 100 : 0);
    }

    updateStats() {
        const today = new Date().toDateString();
        const todayShares = this.history
            .filter(entry => new Date(entry.timestamp).toDateString() === today)
            .reduce((sum, entry) => sum + (entry.count || 0), 0);
        
        const totalShares = this.history
            .reduce((sum, entry) => sum + (entry.count || 0), 0);
        
        this.updateStatElement('todayShares', todayShares);
        this.updateStatElement('successfulShares', todayShares);
        this.updateStatElement('activeAccounts', Object.keys(this.users).length);
        this.updateStatElement('menuTotalShares', totalShares);
        this.updateStatElement('menuActiveUsers', Object.keys(this.users).length);
        
        const totalAttempts = this.history.length * 5;
        const successRate = totalAttempts > 0 ? 
            Math.min(100, Math.round((totalShares / totalAttempts) * 100)) : 100;
        
        const successRateEl = document.getElementById('menuSuccessRate');
        if (successRateEl) {
            successRateEl.style.transform = 'scale(1.1)';
            successRateEl.textContent = `${successRate}%`;
            
            setTimeout(() => {
                successRateEl.style.transform = 'scale(1)';
            }, 200);
        }
        
        const user = this.users[this.currentUser] || { name: 'Default User' };
        const userStats = document.getElementById('userStats');
        if (userStats) {
            userStats.textContent = `${todayShares} shares today`;
        }
    }

    updateStatElement(elementId, newValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const oldValue = parseInt(element.textContent) || 0;
        
        if (oldValue !== newValue) {
            element.style.transform = 'scale(1.2)';
            element.style.color = 'var(--primary)';
            
            setTimeout(() => {
                element.textContent = newValue;
                element.style.transform = 'scale(1)';
                element.style.color = '';
            }, 200);
        } else {
            element.textContent = newValue;
        }
    }

    updateUI() {
        this.updateStats();
        this.updateUsersList();
        this.updateUserSelects();
        
        const user = this.users[this.currentUser] || { name: 'Default User' };
        
        const currentUserEl = document.getElementById('currentUser');
        const shareAccountEl = document.getElementById('shareAccount');
        
        if (currentUserEl) currentUserEl.textContent = user.name;
        if (shareAccountEl) shareAccountEl.textContent = user.name;
        
        const avatar = document.getElementById('userAvatar');
        if (avatar) {
            avatar.textContent = user.name.charAt(0).toUpperCase();
            avatar.style.background = user.color || 'linear-gradient(135deg, #667eea, #764ba2)';
        }
    }

    showLoading(show, text = 'Processing...') {
        if (show) {
            console.log('Loading:', text);
        }
    }

    showToast(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast ${type}`;
        
        toast.style.bottom = '70px';
        toast.style.display = 'block';
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, 20px)';
        
        requestAnimationFrame(() => {
            toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            toast.style.opacity = '1';
            toast.style.transform = 'translate(-50%, 0)';
        });
        
        setTimeout(() => {
            toast.style.opacity = '1';
            
            requestAnimationFrame(() => {
                toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                toast.style.opacity = '0';
                toast.style.transform = 'translate(-50%, 20px)';
                
                setTimeout(() => {
                    toast.style.display = 'none';
                }, 300);
            });
        }, duration);
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    loadUsers() {
        try {
            const users = localStorage.getItem('mobileShareToolUsers');
            return users ? JSON.parse(users) : {};
        } catch {
            return {};
        }
    }

    saveUsers() {
        try {
            localStorage.setItem('mobileShareToolUsers', JSON.stringify(this.users));
        } catch (error) {
            console.error('Error saving users:', error);
        }
    }

    loadHistory() {
        try {
            const history = localStorage.getItem('mobileShareToolHistory');
            return history ? JSON.parse(history) : [];
        } catch {
            return [];
        }
    }

    saveHistory() {
        try {
            localStorage.setItem('mobileShareToolHistory', JSON.stringify(this.history));
        } catch (error) {
            console.error('Error saving history:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new MobileShareTool();
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        .confetti {
            position: fixed;
            z-index: 9999;
            pointer-events: none;
        }
        
        .log-msg.success {
            color: #10b981;
        }
        
        .log-msg.error {
            color: #ef4444;
        }
        
        .log-msg.warning {
            color: #f59e0b;
        }
        
        .log-msg.info {
            color: #667eea;
        }
        
        .stat-badge.error {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
        }
        
        .scrolling-down {
            transition-timing-function: cubic-bezier(0.1, 0.8, 0.3, 1);
        }
        
        .scrolling-up {
            transition-timing-function: cubic-bezier(0.1, 0.8, 0.3, 1);
        }
        
        * {
            -webkit-overflow-scrolling: touch;
        }
        
        .speed-controls {
            margin: 15px 0;
            padding: 12px;
            background: var(--card-bg);
            border-radius: 12px;
            border: 1px solid var(--border);
        }
        
        .speed-controls label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--dark);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .speed-buttons {
            display: flex;
            gap: 8px;
        }
        
        .speed-btn {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--bg);
            color: var(--dark);
            cursor: pointer;
            font-size: 0.85rem;
            transition: all 0.2s ease;
        }
        
        .speed-btn.active {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
            transform: scale(1.05);
        }
        
        .speed-btn:hover {
            transform: scale(1.02);
        }
        
        .log-box {
            max-height: 250px;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 10px;
        }
        
        .log-entry {
            padding: 8px 0;
            border-bottom: 1px solid var(--border);
            font-size: 0.9rem;
            animation: fadeIn 0.3s ease;
        }
        
        .log-entry:last-child {
            border-bottom: none;
        }
        
        .log-time {
            color: var(--gray);
            font-size: 0.8rem;
            min-width: 50px;
            display: inline-block;
        }
        
        .log-msg {
            margin-left: 10px;
        }
        
        /* Result Popup Styles */
        .result-popup {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        }
    `;
    document.head.appendChild(style);
    
    let touchStartY = 0;
    let isScrolling = false;
    
    document.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        isScrolling = true;
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        if (!isScrolling) return;
        
        const touchY = e.touches[0].clientY;
        const diff = touchY - touchStartY;
        
        if (Math.abs(diff) > 10) {
            e.stopPropagation();
        }
    }, { passive: true });
    
    document.addEventListener('touchend', () => {
        isScrolling = false;
    }, { passive: true });
    
    function setVH() {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', setVH);
});
