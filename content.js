// YouTube Video Skipper Content Script
let skipSeconds = 7;
let targetChannels = [];
let isEnabled = true;
let isEnabled = true;
let isInitialized = false;

// Inject styles for the notification
const style = document.createElement('style');
style.textContent = `
  .yt-skipper-toast {
    position: absolute;
    top: 10%;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    font-family: Roboto, Arial, sans-serif;
    font-size: 14px;
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.3s ease-in-out;
    pointer-events: none;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  }
  .yt-skipper-toast.show {
    opacity: 1;
  }
`;
document.head.appendChild(style);

// Function to show notification
function showNotification(message) {
  const videoContainer = document.querySelector('.html5-video-player') || document.body;
  
  // Remove existing toast if any
  const existingToast = document.querySelector('.yt-skipper-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'yt-skipper-toast';
  toast.textContent = message;
  
  videoContainer.appendChild(toast);
  
  // Trigger reflow to ensure transition works
  void toast.offsetWidth;
  
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

// Load settings from storage
chrome.storage.sync.get(['skipSeconds', 'targetChannels', 'isEnabled'], function(result) {
  if (result.skipSeconds !== undefined) skipSeconds = result.skipSeconds;
  if (result.targetChannels !== undefined) targetChannels = result.targetChannels;
  if (result.isEnabled !== undefined) isEnabled = result.isEnabled;
});

// Listen for storage changes
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'sync') {
    if (changes.skipSeconds) skipSeconds = changes.skipSeconds.newValue;
    if (changes.targetChannels) targetChannels = changes.targetChannels.newValue;
    if (changes.isEnabled) isEnabled = changes.isEnabled.newValue;
  }
});

// Function to get current channel URL with multiple fallback methods
function getCurrentChannelUrl() {
  // Method 1: Try multiple selectors for channel links with more comprehensive coverage
  const selectors = [
    // Primary selectors
    'ytd-video-owner-renderer #channel-name a',
    'ytd-video-owner-renderer #owner-name a',
    'ytd-video-owner-renderer #owner-sub-count a',
    'ytd-video-owner-renderer ytd-channel-name a',
    'ytd-video-owner-renderer yt-formatted-string a',
    
    // Alternative selectors
    '#owner-name a',
    '#channel-name a',
    'ytd-video-owner-renderer a[href*="/channel/"]',
    'ytd-video-owner-renderer a[href*="/@"]',
    'ytd-video-owner-renderer a[href*="/c/"]',
    'ytd-video-owner-renderer a[href*="/user/"]',
    
    // More specific selectors
    'ytd-video-owner-renderer #owner-name yt-formatted-string a',
    'ytd-video-owner-renderer #channel-name yt-formatted-string a',
    'ytd-video-owner-renderer ytd-channel-name yt-formatted-string a',
    
    // Fallback selectors for different YouTube layouts
    'ytd-video-owner-renderer a[href*="youtube.com"]',
    '#owner a[href*="youtube.com"]',
    '#channel a[href*="youtube.com"]',
    
    // Additional selectors for newer YouTube layouts
    'ytd-video-owner-renderer #owner-name a[href*="youtube.com"]',
    'ytd-video-owner-renderer #channel-name a[href*="youtube.com"]',
    'ytd-video-owner-renderer ytd-channel-name a[href*="youtube.com"]',
    
    // Selectors for mobile/compact layouts
    'ytd-video-owner-renderer #owner-name a',
    'ytd-video-owner-renderer #channel-name a',
    'ytd-video-owner-renderer a[href*="/channel/"]',
    'ytd-video-owner-renderer a[href*="/@"]',
    'ytd-video-owner-renderer a[href*="/c/"]',
    'ytd-video-owner-renderer a[href*="/user/"]'
  ];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      if (element && element.href) {
        const href = element.href;
        // Make sure it's a channel URL and not a video URL
        if (href && (
          href.includes('/channel/') ||
          href.includes('/@') ||
          href.includes('/c/') ||
          href.includes('/user/')
        ) && !href.includes('/watch') && !href.includes('/embed')) {
          return href;
        }
      }
    }
  }

  // Method 2: Try to find any link that looks like a channel URL in the entire page
  const allLinks = document.querySelectorAll('a[href*="youtube.com"]');
  for (const link of allLinks) {
    const href = link.href;
    if (href && (
      href.includes('/channel/') ||
      href.includes('/@') ||
      href.includes('/c/') ||
      href.includes('/user/')
    )) {
      // Make sure it's not a video URL
      if (!href.includes('/watch') && !href.includes('/embed')) {
        return href;
      }
    }
  }

  // Method 3: Try to extract from page metadata
  const metaChannel = document.querySelector('meta[property="og:url"]');
  if (metaChannel && metaChannel.content) {
    const content = metaChannel.content;
    if (content.includes('/channel/') || content.includes('/@') || content.includes('/c/') || content.includes('/user/')) {
      return content;
    }
  }

  // Method 4: Try to extract from JSON-LD structured data
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      if (data && data.author && data.author.url) {
        const authorUrl = data.author.url;
        if (authorUrl.includes('youtube.com') && (
          authorUrl.includes('/channel/') ||
          authorUrl.includes('/@') ||
          authorUrl.includes('/c/') ||
          authorUrl.includes('/user/')
        )) {
          return authorUrl;
        }
      }
    } catch (e) {
      // Ignore JSON parsing errors
    }
  }

  // Method 5: Try to extract from YouTube's internal data
  try {
    // Look for YouTube's internal data in the page
    const ytInitialData = window.ytInitialData;
    if (ytInitialData && ytInitialData.contents && ytInitialData.contents.twoColumnWatchNextResults) {
      const results = ytInitialData.contents.twoColumnWatchNextResults;
      if (results.results && results.results.results) {
        const contents = results.results.results.contents;
        for (const content of contents) {
          if (content.videoPrimaryInfoRenderer && content.videoPrimaryInfoRenderer.owner) {
            const owner = content.videoPrimaryInfoRenderer.owner;
            if (owner.videoOwnerRenderer && owner.videoOwnerRenderer.navigationEndpoint) {
              const endpoint = owner.videoOwnerRenderer.navigationEndpoint;
              if (endpoint.commandMetadata && endpoint.commandMetadata.webCommandMetadata) {
                const url = endpoint.commandMetadata.webCommandMetadata.url;
                if (url && url.startsWith('/')) {
                  return 'https://www.youtube.com' + url;
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    // Ignore errors accessing YouTube's internal data
  }

  return null;
}

// Function to extract channel ID from URL
function extractChannelId(url) {
  if (!url) return null;
  
  // Handle different YouTube URL formats
  const patterns = [
    /youtube\.com\/channel\/([^\/\?]+)/,  // /channel/UC...
    /youtube\.com\/c\/([^\/\?]+)/,        // /c/channelname
    /youtube\.com\/@([^\/\?]+)/,          // /@channelname
    /youtube\.com\/user\/([^\/\?]+)/      // /user/username
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

// Function to skip video with better timing
function skipVideo() {
  if (!isEnabled) {
    console.log('YouTube Video Skipper: Extension is disabled');
    return;
  }
  
  const video = document.querySelector('video');
  if (!video) {
    console.log('YouTube Video Skipper: No video element found');
    return;
  }
  
  const currentChannelUrl = getCurrentChannelUrl();
  if (!currentChannelUrl) {
    console.log('YouTube Video Skipper: Channel URL not found');
    return;
  }
  
  const currentChannelId = extractChannelId(currentChannelUrl);
  if (!currentChannelId) {
    console.log('YouTube Video Skipper: Could not extract channel ID from:', currentChannelUrl);
    return;
  }
  
  console.log('YouTube Video Skipper: Found channel:', currentChannelUrl, 'ID:', currentChannelId);
  console.log('YouTube Video Skipper: Target channels:', targetChannels);
  
  // Check if current channel is in target channels
  const isTargetChannel = targetChannels.some(channelUrl => {
    const targetChannelId = extractChannelId(channelUrl);
    return targetChannelId && targetChannelId === currentChannelId;
  });
  
  if (!isTargetChannel) {
    console.log('YouTube Video Skipper: Channel not in target list:', currentChannelId);
    return;
  }
  
  console.log('YouTube Video Skipper: Channel is in target list, checking video time...');
  console.log('YouTube Video Skipper: Current video time:', video.currentTime, 'Skip time:', skipSeconds);
  
  // Skip if video is in first few seconds and not already skipped
  if (video.currentTime < skipSeconds && !video.hasAttribute('data-skipped')) {
    video.currentTime = skipSeconds;
    video.setAttribute('data-skipped', 'true');
    console.log(`YouTube Video Skipper: SUCCESS! Skipped to ${skipSeconds} seconds for channel: ${currentChannelId}`);
    
    // Show visual feedback
    showNotification(`Skipped intro (${skipSeconds}s)`);
    
    // Remove the skipped attribute after a delay to allow for manual seeking
    setTimeout(() => {
      video.removeAttribute('data-skipped');
    }, 5000);
  } else if (video.hasAttribute('data-skipped')) {
    console.log('YouTube Video Skipper: Video already skipped');
  } else {
    console.log('YouTube Video Skipper: Video time is already past skip point');
  }
}

// Function to handle video loading with multiple attempts
function handleVideoLoad() {
  console.log('YouTube Video Skipper: Starting video load handler');
  
  // Initial check after a short delay
  setTimeout(() => {
    skipVideo();
  }, 500);
  
  // Check multiple times with increasing delays
  const delays = [1000, 2000, 3000, 5000, 8000, 12000];
  delays.forEach((delay, index) => {
    setTimeout(() => {
      console.log(`YouTube Video Skipper: Attempt ${index + 1} to skip video`);
      skipVideo();
    }, delay);
  });
  
  // Also check periodically for the first 15 seconds
  let checkCount = 0;
  const maxChecks = 30;
  const checkInterval = setInterval(() => {
    skipVideo();
    checkCount++;
    if (checkCount >= maxChecks) {
      clearInterval(checkInterval);
      console.log('YouTube Video Skipper: Stopped periodic checks');
    }
  }, 500);
}

// Function to initialize the extension
function initialize() {
  if (isInitialized) return;
  isInitialized = true;
  
  console.log('YouTube Video Skipper: Initializing...');
  
  if (window.location.pathname === '/watch') {
    // Try to find video element with multiple attempts
    let video = document.querySelector('video');
    if (video) {
      video.setAttribute('data-skipper-initialized', 'true');
      handleVideoLoad();
    } else {
      // If video not found immediately, wait and try again
      setTimeout(() => {
        video = document.querySelector('video');
        if (video && !video.hasAttribute('data-skipper-initialized')) {
          video.setAttribute('data-skipper-initialized', 'true');
          handleVideoLoad();
        }
      }, 2000);
    }
  }
  
  setupObserver();
}

// Observer to watch for video changes
let observer;
function setupObserver() {
  if (observer) {
    observer.disconnect();
  }
  
  observer = new MutationObserver((mutations) => {
    let shouldCheckVideo = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        // Check if any added nodes contain video elements or channel info
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'VIDEO' || 
                node.querySelector && node.querySelector('video') ||
                node.querySelector && node.querySelector('ytd-video-owner-renderer')) {
              shouldCheckVideo = true;
            }
          }
        });
      }
    });
    
    // Check if we're on a video page and need to handle video
    if (shouldCheckVideo && window.location.pathname === '/watch') {
      const video = document.querySelector('video');
      if (video && !video.hasAttribute('data-skipper-initialized')) {
        console.log('YouTube Video Skipper: New video detected, initializing...');
        video.setAttribute('data-skipper-initialized', 'true');
        handleVideoLoad();
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'href']
  });
}

// Start the extension with multiple initialization attempts
function startExtension() {
  // Try to initialize immediately
  initialize();
  
  // Also try after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  }
  
  // And after a short delay
  setTimeout(initialize, 1000);
  setTimeout(initialize, 3000);
}

// Handle navigation changes (YouTube is a SPA)
let currentUrl = location.href;
let urlObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== currentUrl) {
    currentUrl = url;
    isInitialized = false; // Reset initialization flag
    
    if (url.includes('/watch')) {
      console.log('YouTube Video Skipper: Navigation detected, reinitializing...');
      // Multiple attempts to handle the new page
      const attempts = [500, 1000, 2000, 3000, 5000];
      attempts.forEach((delay, index) => {
        setTimeout(() => {
          const video = document.querySelector('video');
          if (video && !video.hasAttribute('data-skipper-initialized')) {
            console.log(`YouTube Video Skipper: Initializing video on attempt ${index + 1}`);
            video.setAttribute('data-skipper-initialized', 'true');
            handleVideoLoad();
          }
        }, delay);
      });
    }
  }
});

urlObserver.observe(document, { subtree: true, childList: true });

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getChannelInfo') {
    const channelUrl = getCurrentChannelUrl();
    const channelId = extractChannelId(channelUrl);
    sendResponse({
      channelUrl: channelUrl,
      channelId: channelId
    });
  } else if (request.action === 'checkVideo') {
    const video = document.querySelector('video');
    sendResponse({
      videoFound: !!video
    });
  }
});

// Start the extension
startExtension();

// Additional fallback: check periodically for new videos
setInterval(() => {
  if (window.location.pathname === '/watch') {
    const video = document.querySelector('video');
    if (video && !video.hasAttribute('data-skipper-initialized')) {
      console.log('YouTube Video Skipper: Periodic check found new video');
      video.setAttribute('data-skipper-initialized', 'true');
      handleVideoLoad();
    }
  }
}, 3000); // Check more frequently

// Also add a more aggressive check for the first 30 seconds after page load
let aggressiveCheckCount = 0;
const aggressiveCheckInterval = setInterval(() => {
  if (window.location.pathname === '/watch') {
    const video = document.querySelector('video');
    if (video && !video.hasAttribute('data-skipper-initialized')) {
      console.log('YouTube Video Skipper: Aggressive check found new video');
      video.setAttribute('data-skipper-initialized', 'true');
      handleVideoLoad();
    }
  }
  
  aggressiveCheckCount++;
  if (aggressiveCheckCount >= 10) { // Stop after 10 seconds
    clearInterval(aggressiveCheckInterval);
  }
}, 1000); 