// transport-init.js - Initialize floating transport controls with patch save/load
// This script should be loaded after main.js initializes

(function() {
  // Wait for the app to be ready
  function initTransport() {
    const sidebar = document.getElementById('transportSidebar');
    const playBtn = document.getElementById('transportPlayBtn');
    const stopBtn = document.getElementById('transportStopBtn');
    const volumeSlider = document.getElementById('transportVolume');
    const volumeValue = document.getElementById('transportVolumeValue');
    const statusText = document.getElementById('transportStatus');
    const originalStartBtn = document.getElementById('startBtn');
    const originalVolumeSlider = document.getElementById('masterVolume');
    const originalVolumeValue = document.getElementById('masterVolumeValue');
    
    // Patch save/load elements
    const saveBtn = document.getElementById('transportSaveBtn');
    const loadBtn = document.getElementById('transportLoadBtn');
    const fileInput = document.getElementById('patchFileInput');
    
    if (!sidebar || !playBtn || !stopBtn) {
      console.warn('Transport elements not found, retrying...');
      setTimeout(initTransport, 500);
      return;
    }
    
    // Enable play button when original is enabled
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
          playBtn.disabled = originalStartBtn.disabled;
        }
      });
    });
    
    if (originalStartBtn) {
      observer.observe(originalStartBtn, { attributes: true });
      playBtn.disabled = originalStartBtn.disabled;
    }
    
    // Update UI state
    function updateTransportUI(isRunning) {
      sidebar.classList.toggle('running', isRunning);
      sidebar.classList.toggle('stopped', !isRunning);
      
      if (isRunning) {
        playBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        statusText.textContent = 'Running';
      } else {
        playBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        statusText.textContent = 'Stopped';
      }
    }
    
    // Play button click
    playBtn.addEventListener('click', () => {
      if (originalStartBtn && !originalStartBtn.disabled) {
        originalStartBtn.click();
        updateTransportUI(true);
      }
    });
    
    // Stop button click
    stopBtn.addEventListener('click', () => {
      if (originalStartBtn) {
        originalStartBtn.click();
        updateTransportUI(false);
      }
    });
    
    // Watch for changes to the original button text to sync state
    const textObserver = new MutationObserver(() => {
      const isRunning = originalStartBtn.textContent.includes('Stop');
      updateTransportUI(isRunning);
    });
    
    if (originalStartBtn) {
      textObserver.observe(originalStartBtn, { childList: true, subtree: true });
    }
    
    // Volume slider
    volumeSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      volumeValue.textContent = value.toFixed(2);
      
      // Sync with original volume slider
      if (originalVolumeSlider) {
        originalVolumeSlider.value = value;
        originalVolumeSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (originalVolumeValue) {
        originalVolumeValue.textContent = value.toFixed(2);
      }
    });
    
    // Sync original volume changes to transport
    if (originalVolumeSlider) {
      originalVolumeSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        volumeSlider.value = value;
        volumeValue.textContent = value.toFixed(2);
      });
    }
    
    // Initialize with current volume value
    if (originalVolumeSlider) {
      volumeSlider.value = originalVolumeSlider.value;
      volumeValue.textContent = parseFloat(originalVolumeSlider.value).toFixed(2);
    }
    
    // ========== PATCH SAVE/LOAD ==========
    
    // Save button click
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        // Access the app's patch manager
        if (window.phase5App && window.phase5App.patchManager) {
          window.phase5App.patchManager.savePatch();
          showPatchNotification('Patch saved!', 'success');
        } else {
          // Try to find the app through the module scope
          console.warn('Patch manager not found, attempting fallback...');
          showPatchNotification('Save not available yet', 'error');
        }
      });
    }
    
    // Load button click - trigger file input
    if (loadBtn && fileInput) {
      loadBtn.addEventListener('click', () => {
        fileInput.click();
      });
      
      // Handle file selection
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
          if (window.phase5App && window.phase5App.patchManager) {
            await window.phase5App.patchManager.loadPatch(file);
            showPatchNotification('Patch loaded!', 'success');
          } else {
            showPatchNotification('Load not available yet', 'error');
          }
        } catch (error) {
          console.error('Failed to load patch:', error);
          showPatchNotification('Failed to load patch', 'error');
        }
        
        // Reset file input so the same file can be selected again
        fileInput.value = '';
      });
    }
    
    console.log('✓ Floating transport initialized with patch save/load');
  }
  
  // Show a temporary notification
  function showPatchNotification(message, type = 'info') {
    // Remove any existing notification
    const existing = document.querySelector('.patch-notification');
    if (existing) existing.remove();
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `patch-notification ${type}`;
    notification.textContent = message;
    
    // Style it
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '12px 24px',
      borderRadius: '8px',
      backgroundColor: type === 'success' ? 'rgba(90, 196, 90, 0.95)' : 
                       type === 'error' ? 'rgba(196, 90, 90, 0.95)' :
                       'rgba(90, 90, 196, 0.95)',
      color: 'white',
      fontSize: '0.85rem',
      fontWeight: '600',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
      zIndex: '10000',
      transition: 'opacity 0.3s ease',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
    });
    
    document.body.appendChild(notification);
    
    // Auto-remove after 2 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initTransport, 1000); // Wait for main app to init
    });
  } else {
    setTimeout(initTransport, 1000);
  }
})();
