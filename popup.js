// Popup script for YouTube Video Skipper
document.addEventListener('DOMContentLoaded', function () {
    const enabledCheckbox = document.getElementById('enabled');
    const skipSecondsInput = document.getElementById('skipSeconds');
    const channelInput = document.getElementById('channelInput');
    const addChannelBtn = document.getElementById('addChannel');
    const addCurrentChannelBtn = document.getElementById('addCurrentChannel');
    const toggleDebugBtn = document.getElementById('toggleDebug');
    const channelList = document.getElementById('channelList');
    const statusDiv = document.getElementById('status');
    const channelNameSpan = document.getElementById('channelName');
    const debugSection = document.getElementById('debugSection');

    // Debug elements
    const debugChannelUrl = document.getElementById('debugChannelUrl');
    const debugChannelId = document.getElementById('debugChannelId');
    const debugIsTarget = document.getElementById('debugIsTarget');
    const debugEnabled = document.getElementById('debugEnabled');
    const debugSkipSeconds = document.getElementById('debugSkipSeconds');
    const debugVideoFound = document.getElementById('debugVideoFound');

    // Load saved settings
    chrome.storage.sync.get(['isEnabled', 'skipSeconds', 'targetChannels'], function (result) {
        enabledCheckbox.checked = result.isEnabled !== false; // Default to true
        skipSecondsInput.value = result.skipSeconds || 7;
        updateChannelList(result.targetChannels || []);
        updateStatusValue(result.isEnabled !== false);
    });

    // Get current channel info from active tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
            // Attempt to communicate with the content script regardless of URL
            // This handles cases where tabs.url might be restricted or formatted differently

            let attempts = 0;
            const maxAttempts = 3;

            function tryGetChannelInfo() {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'getChannelInfo' }, function (response) {
                    if (chrome.runtime.lastError) {
                        // Content script not ready or not injected
                        console.log('Connection failed:', chrome.runtime.lastError);

                        // Only show "Not on video page" if we've exhausted attempts AND URL clearly isn't YouTube
                        // But if it IS YouTube, we might just need to wait
                        if (attempts >= maxAttempts) {
                            if (tabs[0].url && !tabs[0].url.includes('youtube.com')) {
                                channelNameSpan.textContent = 'Not on a YouTube page';
                            } else {
                                channelNameSpan.textContent = 'Refresh the page';
                            }
                            updateDebugInfo({ channelUrl: null, channelId: null });
                        } else {
                            attempts++;
                            setTimeout(tryGetChannelInfo, 500);
                        }
                    } else if (response && response.channelUrl) {
                        channelNameSpan.textContent = response.channelUrl;
                        window.currentChannelUrl = response.channelUrl;
                        window.currentChannelId = response.channelId;
                        updateDebugInfo(response);
                    } else {
                        // Connected but no channel found (e.g. homepage)
                        attempts++;
                        if (attempts < maxAttempts) {
                            setTimeout(tryGetChannelInfo, 1000);
                        } else {
                            channelNameSpan.textContent = 'Channel not detected';
                            updateDebugInfo({ channelUrl: null, channelId: null });
                        }
                    }
                });
            }

            tryGetChannelInfo();
        } else {
            channelNameSpan.textContent = 'No active tab';
        }
    });

    // Update debug information
    function updateDebugInfo(channelInfo) {
        chrome.storage.sync.get(['isEnabled', 'skipSeconds', 'targetChannels'], function (result) {
            const isEnabled = result.isEnabled !== false;
            const skipSeconds = result.skipSeconds || 7;
            const targetChannels = result.targetChannels || [];

            debugChannelUrl.textContent = channelInfo.channelUrl || 'Not detected';
            debugChannelId.textContent = channelInfo.channelId || 'Not extracted';
            debugEnabled.textContent = isEnabled ? 'Yes' : 'No';
            debugSkipSeconds.textContent = skipSeconds + ' seconds';

            // Check if current channel is in target list
            let isTarget = 'No';
            if (channelInfo.channelId) {
                isTarget = targetChannels.some(channelUrl => {
                    const targetChannelId = extractChannelId(channelUrl);
                    return targetChannelId && targetChannelId === channelInfo.channelId;
                }) ? 'Yes' : 'No';
            }
            debugIsTarget.textContent = isTarget;

            // Check if video element exists
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com/watch')) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'checkVideo' }, function (response) {
                        debugVideoFound.textContent = response && response.videoFound ? 'Yes' : 'No';
                    });
                } else {
                    debugVideoFound.textContent = 'Not on video page';
                }
            });
        });
    }

    // Extract channel ID from URL (same function as in content script)
    function extractChannelId(url) {
        if (!url) return null;

        const patterns = [
            /youtube\.com\/channel\/([^\/\?]+)/,
            /youtube\.com\/c\/([^\/\?]+)/,
            /youtube\.com\/@([^\/\?]+)/,
            /youtube\.com\/user\/([^\/\?]+)/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    // Update status value display
    function updateStatusValue(isEnabled) {
        const statusValue = document.getElementById('statusValue');
        if (statusValue) {
            statusValue.textContent = isEnabled ? 'ENABLED' : 'DISABLED';
            statusValue.style.color = isEnabled ? '#ebf424' : '#666666';
        }
    }

    // Toggle debug section
    toggleDebugBtn.addEventListener('click', function () {
        const isVisible = debugSection.style.display !== 'none';
        debugSection.style.display = isVisible ? 'none' : 'block';
        toggleDebugBtn.textContent = isVisible ? 'Show Debug Info' : 'Hide Debug Info';

        if (!isVisible) {
            // Refresh debug info when showing
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com/watch')) {
                    // Try multiple times to get updated info
                    let attempts = 0;
                    const maxAttempts = 3;

                    function tryUpdateDebugInfo() {
                        chrome.tabs.sendMessage(tabs[0].id, { action: 'getChannelInfo' }, function (response) {
                            if (response && response.channelUrl) {
                                updateDebugInfo(response);
                            } else {
                                attempts++;
                                if (attempts < maxAttempts) {
                                    setTimeout(tryUpdateDebugInfo, 500);
                                } else {
                                    updateDebugInfo({ channelUrl: null, channelId: null });
                                }
                            }
                        });
                    }

                    tryUpdateDebugInfo();
                }
            });
        }
    });

    // Save enabled state
    enabledCheckbox.addEventListener('change', function () {
        chrome.storage.sync.set({ isEnabled: enabledCheckbox.checked }, function () {
            showStatus('Extension ' + (enabledCheckbox.checked ? 'enabled' : 'disabled'), 'success');
            updateStatusValue(enabledCheckbox.checked);
            updateDebugInfo({ channelUrl: window.currentChannelUrl, channelId: window.currentChannelId });
        });
    });

    // Save skip seconds
    skipSecondsInput.addEventListener('change', function () {
        const seconds = parseInt(skipSecondsInput.value);
        if (seconds >= 1 && seconds <= 60) {
            chrome.storage.sync.set({ skipSeconds: seconds }, function () {
                showStatus('Skip time updated to ' + seconds + ' seconds', 'success');
                updateDebugInfo({ channelUrl: window.currentChannelUrl, channelId: window.currentChannelId });
            });
        } else {
            showStatus('Please enter a value between 1 and 60', 'error');
            skipSecondsInput.value = 7;
        }
        skipSecondsInput.value = 7;
    });

    // Number Control Buttons
    document.getElementById('decreaseSkip').addEventListener('click', function () {
        const currentValue = parseInt(skipSecondsInput.value) || 0;
        if (currentValue > 1) {
            skipSecondsInput.value = currentValue - 1;
            skipSecondsInput.dispatchEvent(new Event('change'));
        }
    });

    document.getElementById('increaseSkip').addEventListener('click', function () {
        const currentValue = parseInt(skipSecondsInput.value) || 0;
        if (currentValue < 60) {
            skipSecondsInput.value = currentValue + 1;
            skipSecondsInput.dispatchEvent(new Event('change'));
        }
    });

    // Validate YouTube channel URL
    function isValidChannelUrl(url) {
        if (!url) return false;

        const patterns = [
            /^https?:\/\/(www\.)?youtube\.com\/channel\/[^\/\?]+/,
            /^https?:\/\/(www\.)?youtube\.com\/c\/[^\/\?]+/,
            /^https?:\/\/(www\.)?youtube\.com\/@[^\/\?]+/,
            /^https?:\/\/(www\.)?youtube\.com\/user\/[^\/\?]+/
        ];

        return patterns.some(pattern => pattern.test(url));
    }

    // Add channel from input
    addChannelBtn.addEventListener('click', function () {
        const channelUrl = channelInput.value.trim();
        if (channelUrl) {
            if (isValidChannelUrl(channelUrl)) {
                chrome.storage.sync.get(['targetChannels'], function (result) {
                    const channels = result.targetChannels || [];
                    if (!channels.includes(channelUrl)) {
                        channels.push(channelUrl);
                        chrome.storage.sync.set({ targetChannels: channels }, function () {
                            updateChannelList(channels);
                            channelInput.value = '';
                            showStatus('Channel URL added successfully', 'success');
                            updateDebugInfo({ channelUrl: window.currentChannelUrl, channelId: window.currentChannelId });
                        });
                    } else {
                        showStatus('Channel URL already exists', 'error');
                    }
                });
            } else {
                showStatus('Please enter a valid YouTube channel URL', 'error');
            }
        } else {
            showStatus('Please enter a channel URL', 'error');
        }
    });

    // Add current channel
    addCurrentChannelBtn.addEventListener('click', function () {
        if (window.currentChannelUrl) {
            chrome.storage.sync.get(['targetChannels'], function (result) {
                const channels = result.targetChannels || [];
                if (!channels.includes(window.currentChannelUrl)) {
                    channels.push(window.currentChannelUrl);
                    chrome.storage.sync.set({ targetChannels: channels }, function () {
                        updateChannelList(channels);
                        showStatus('Current channel added successfully', 'success');
                        updateDebugInfo({ channelUrl: window.currentChannelUrl, channelId: window.currentChannelId });
                    });
                } else {
                    showStatus('Current channel already exists', 'error');
                }
            });
        } else {
            showStatus('No channel detected on current page', 'error');
        }
    });

    // Enter key to add channel
    channelInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            addChannelBtn.click();
        }
    });

    // Update channel list display
    function updateChannelList(channels) {
        channelList.innerHTML = '';
        if (channels.length === 0) {
            channelList.innerHTML = '<div class="empty-state">No channels added yet</div>';
            return;
        }

        channels.forEach(function (channelUrl, index) {
            const channelItem = document.createElement('div');
            channelItem.className = 'channel-item';

            const channelUrlSpan = document.createElement('div');
            channelUrlSpan.className = 'channel-url';
            channelUrlSpan.textContent = channelUrl;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.textContent = 'Remove';
            removeBtn.onclick = function () {
                removeChannel(index);
            };

            channelItem.appendChild(channelUrlSpan);
            channelItem.appendChild(removeBtn);
            channelList.appendChild(channelItem);
        });
    }

    // Remove channel
    function removeChannel(index) {
        chrome.storage.sync.get(['targetChannels'], function (result) {
            const channels = result.targetChannels || [];
            const removedChannel = channels[index];
            channels.splice(index, 1);
            chrome.storage.sync.set({ targetChannels: channels }, function () {
                updateChannelList(channels);
                showStatus('Channel removed successfully', 'success');
                updateDebugInfo({ channelUrl: window.currentChannelUrl, channelId: window.currentChannelId });
            });
        });
    }

    // Show status message
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + type;
        statusDiv.style.display = 'block';

        setTimeout(function () {
            statusDiv.style.display = 'none';
        }, 3000);
    }

}); 