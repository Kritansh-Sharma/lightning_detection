/* ══════════════════════════════════════════════════════════════
   Bhu-Drishti — Frontend Application Logic
   Camera, GPS, LULC selection, offline queue, GIS map, exports
   ══════════════════════════════════════════════════════════════ */

// ── LULC Class Data ──
const LULC = {
    1: { name: 'Cropland', nameHi: 'कृषि भूमि', icon: 'crop', color: '#A3B86B' },
    2: { name: 'Forest', nameHi: 'वन / हरित आवरण', icon: 'forest', color: '#426B57' },
    3: { name: 'Urban / Built-up', nameHi: 'शहरी / निर्माण', icon: 'building', color: '#7B8188' },
    4: { name: 'Water Body', nameHi: 'जल निकाय', icon: 'water', color: '#6796A3' },
    5: { name: 'Barren / Fallow', nameHi: 'बंजर / परती', icon: 'land', color: '#B98754' },
};

function iconMarkup(name, className = 'icon-sm') {
    return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="/static/icons.svg#icon-${name}"></use></svg>`;
}

const ROLE_LABELS = {
    farmer: 'Farmer / Field Surveyor',
    analyst: 'GIS Analyst',
    admin: 'District Nodal Officer',
};

const SAMPLE_SURVEYOR_NAMES = {
    Kisan_Mitra_3210: { name: 'Ramesh Yadav', role: 'Farmer' },
    AgriStudent_Mohan: { name: 'Mohan Singh', role: 'Agriculture Student' },
    NCC_Cadet_Raj: { name: 'Raj Malhotra', role: 'NCC Cadet' },
    NSS_Volunteer_Anita: { name: 'Anita Sharma', role: 'NSS Volunteer' },
    Cadet_Tester: { name: 'Rohan Mehta', role: 'Field Surveyor' },
};

function formatSurveyorName(surveyorId, role = 'citizen') {
    if (!surveyorId) return 'Unknown surveyor';
    const sampleProfile = SAMPLE_SURVEYOR_NAMES[surveyorId];
    const name = sampleProfile?.name || surveyorId.replace(/_/g, ' ');
    const roleLabel = sampleProfile?.role || (role === 'analyst'
        ? ROLE_LABELS.analyst
        : role === 'admin'
            ? ROLE_LABELS.admin
            : 'Citizen Surveyor');
    return `${name} (${roleLabel})`;
}

// ── Global State ──
const state = {
    user: null,
    authToken: null,
    currentTab: 'field',
    cameraStream: null,
    capturedBlob: null,
    imageSource: null,
    imagePreviewUrl: null,
    imageDimensions: null,
    imageFileName: null,
    photoGps: null,
    photoGpsImage: null,
    gpsRefreshPending: false,
    selectedClass: null,
    gps: { lat: null, lon: null, accuracy: null, altitude: null },
    gpsWatchId: null,
    qualityResult: null,
    map: null,
    markers: [],
    accuracyCircles: [],
    showcaseMarkers: [],
    showcaseMarkersLoaded: false,
    previewMarker: null,
    inspectedId: null,
    otpCountdownTimer: null,
    activeChips: {
        'crop-season': 'Kharif',
        'crop-stage': 'Vegetative',
        'irrigation': 'Rainfed',
        'parcel-homo': 'Homogeneous',
    },
    gridEnabled: false,
    watermarkEnabled: false,
};

// ══════════════════════════════════════════
//  AUTHENTICATION & OTP FLOW
// ══════════════════════════════════════════

async function requestOTP() {
    const phoneInput = document.getElementById('login-phone');
    const phone = phoneInput.value.trim().replace(/\D/g, '');
    if (!phone || phone.length < 10) {
        return toast('Please enter a valid 10-digit mobile number', 'warning');
    }

    const role = document.querySelector('input[name="role"]:checked')?.value || 'farmer';
    const btn = document.getElementById('btn-send-otp');
    btn.disabled = true;
    btn.textContent = 'Sending OTP via SMS…';

    try {
        const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mobile: phone, role: role })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to dispatch OTP');

        // Reveal Step 2 (OTP Input)
        document.getElementById('login-step-phone').style.display = 'none';
        document.getElementById('login-step-otp').style.display = 'block';
        document.getElementById('otp-phone-display').textContent = '+91 ' + phone;

        // Auto-fill or show simulated SMS banner with code
        showSmsPopup(data.demo_otp || '123456', phone);
        document.getElementById('login-otp-code').value = data.demo_otp || '';

        // Start 45s countdown timer
        startOtpCountdown(45);
        toast('SMS OTP dispatched successfully.', 'success');
    } catch (e) {
        toast('OTP Request Failed: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `${iconMarkup('message')} Send OTP via SMS`;
    }
}

function startOtpCountdown(seconds) {
    if (state.otpCountdownTimer) clearInterval(state.otpCountdownTimer);
    let remaining = seconds;
    const countdownEl = document.getElementById('otp-countdown');
    const resendBtn = document.getElementById('btn-resend-otp');
    countdownEl.style.display = 'inline';
    resendBtn.style.display = 'none';

    state.otpCountdownTimer = setInterval(() => {
        remaining--;
        countdownEl.innerHTML = `Resend OTP in <strong>${remaining}s</strong>`;
        if (remaining <= 0) {
            clearInterval(state.otpCountdownTimer);
            countdownEl.style.display = 'none';
            resendBtn.style.display = 'inline-block';
        }
    }, 1000);
}

function editPhoneNumber() {
    if (state.otpCountdownTimer) clearInterval(state.otpCountdownTimer);
    document.getElementById('login-step-otp').style.display = 'none';
    document.getElementById('login-step-phone').style.display = 'block';
    closeSmsPopup();
}

function showSmsPopup(otp, phone) {
    const popup = document.getElementById('sms-notification-popup');
    const text = document.getElementById('sms-body-text');
    text.innerHTML = `Your Bhu-Drishti verification OTP is <strong class="sms-highlight">${otp}</strong>. Valid for 10 minutes. Do not share.`;
    popup.style.display = 'flex';
}

function closeSmsPopup() {
    const popup = document.getElementById('sms-notification-popup');
    if (popup) popup.style.display = 'none';
}

async function verifyOTPAndLogin() {
    const phone = document.getElementById('login-phone').value.trim().replace(/\D/g, '');
    const otp = document.getElementById('login-otp-code').value.trim();
    const role = document.querySelector('input[name="role"]:checked')?.value || 'farmer';

    if (!otp || otp.length < 4) {
        return toast('Please enter the verification code received via SMS', 'warning');
    }

    try {
        const res = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mobile: phone, otp: otp, role: role })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'OTP verification failed');

        closeSmsPopup();
        doLogin(role, data.user?.name || `User ${phone.slice(-4)}`, data.access_token, data.user?.id);
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function demoLogin(role) {
    try {
        const res = await fetch('/api/auth/demo-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Demo sign-in failed');
        closeSmsPopup();
        doLogin(role, data.user.name, data.access_token, data.user.id);
    } catch (e) {
        toast(e.message, 'error');
    }
}

function doLogin(role, name, accessToken, userId = name) {
    const displayName = name.replace(/_/g, ' ');
    const roleLabel = ROLE_LABELS[role] || 'Portal User';
    state.user = { id: userId, name: displayName, role: role };
    state.authToken = accessToken || null;
    document.getElementById('user-name').textContent = `${displayName} (${roleLabel})`;
    document.getElementById('user-role-badge').textContent = role.toUpperCase();
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('dashboard').classList.add('active');

    // Apply role-based visibility and default views
    applyRolePermissions(role);

    loadStatistics();
    if (role === 'farmer') loadFarmerRewards();
    syncOfflineQueue();
    toast(`Welcome, ${state.user.name} (${roleLabel}).`, 'success');
}

function applyRolePermissions(role) {
    const tabField = document.getElementById('tab-btn-field');
    const tabRewards = document.getElementById('tab-btn-rewards');
    const tabMap = document.getElementById('tab-btn-map');
    const tabExport = document.getElementById('tab-btn-export');
    const tabAnalytics = document.getElementById('tab-btn-analytics');
    const tabGuidelines = document.getElementById('tab-btn-guidelines');

    const farmerCard = document.getElementById('farmer-params-card');
    const analystCard = document.getElementById('analyst-params-card');
    const cameraTag = document.getElementById('camera-role-tag');

    if (role === 'farmer') {
        // Farmer view: Clean, streamlined, focused on agriculture
        tabField.style.display = 'block';
        tabRewards.style.display = 'block';
        tabMap.style.display = 'none';       // Hide complex GIS map
        tabExport.style.display = 'none';    // Hide raw export tools
        tabAnalytics.style.display = 'none'; // Hide multi-district analytics
        tabGuidelines.style.display = 'block';

        if (farmerCard) farmerCard.style.display = 'block';
        if (analystCard) analystCard.style.display = 'none';
        if (cameraTag) cameraTag.innerHTML = `${iconMarkup('crop')} Farmer Crop Survey View`;

        switchTab('field');
    } else if (role === 'analyst') {
        // Analyst view: Satellite review & GIS validation
        tabField.style.display = 'block';
        tabRewards.style.display = 'none';
        tabMap.style.display = 'block';
        tabExport.style.display = 'block';
        tabAnalytics.style.display = 'block';
        tabGuidelines.style.display = 'block';

        if (farmerCard) farmerCard.style.display = 'none';
        if (analystCard) analystCard.style.display = 'block';
        if (cameraTag) cameraTag.innerHTML = `${iconMarkup('satellite')} Satellite Field Calibration`;

        switchTab('map');
    } else {
        // Admin view: Full administrative control
        tabField.style.display = 'block';
        tabRewards.style.display = 'none';
        tabMap.style.display = 'block';
        tabExport.style.display = 'block';
        tabAnalytics.style.display = 'block';
        tabGuidelines.style.display = 'block';

        if (farmerCard) farmerCard.style.display = 'block';
        if (analystCard) analystCard.style.display = 'block';
        if (cameraTag) cameraTag.innerHTML = `${iconMarkup('building')} Nodal Officer Inspection`;

        switchTab('analytics');
    }
}

function handleLogout() {
    stopCamera();
    stopGPS();
    if (state.otpCountdownTimer) clearInterval(state.otpCountdownTimer);
    state.user = null;
    state.authToken = null;
    state.capturedBlob = null;
    state.selectedClass = null;
    closeSmsPopup();
    document.getElementById('login-step-otp').style.display = 'none';
    document.getElementById('login-step-phone').style.display = 'block';
    document.getElementById('dashboard').classList.remove('active');
    document.getElementById('login-page').classList.add('active');
}

// ── Role card selection on login page ──
document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        card.querySelector('input').checked = true;
    });
});

// ── Interactive Chips for Parameters ──
function selectChip(el, group) {
    const parent = el.closest('.chip-group');
    if (!parent) return;
    parent.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    state.activeChips[group] = el.dataset.val || el.textContent.trim();
}

// ── Camera Overlay Toggles ──
function toggleCameraGrid() {
    state.gridEnabled = !state.gridEnabled;
    const overlay = document.getElementById('camera-grid-overlay');
    const btn = document.getElementById('btn-toggle-grid');
    if (overlay) overlay.style.display = state.gridEnabled ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', state.gridEnabled);
}

function toggleWatermark() {
    state.watermarkEnabled = !state.watermarkEnabled;
    const wm = document.getElementById('camera-watermark');
    const btn = document.getElementById('btn-toggle-watermark');
    if (wm) {
        wm.style.display = state.watermarkEnabled ? 'block' : 'none';
        if (state.watermarkEnabled && Number.isFinite(state.gps.lat) && Number.isFinite(state.gps.lon)) {
            document.getElementById('wm-coords').textContent = `${state.gps.lat.toFixed(4)}°N, ${state.gps.lon.toFixed(4)}°E (±${state.gps.accuracy?.toFixed(0) || 4}m)`;
            document.getElementById('wm-time').textContent = new Date().toISOString().slice(0, 19).replace('T', ' ');
        } else if (state.watermarkEnabled) {
            document.getElementById('wm-coords').textContent = 'Waiting for GPS';
            document.getElementById('wm-time').textContent = 'Capture time pending';
        }
    }
    if (btn) btn.classList.toggle('active', state.watermarkEnabled);
}

// ══════════════════════════════════════════
//  TAB NAVIGATION
// ══════════════════════════════════════════

function switchTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));

    if (tab === 'field') { startCamera(); startGPS(); }
    else { stopCamera(); }

    if (tab === 'map') { initMap(); reloadMapMarkers(); }
    if (tab === 'export') { loadExportPreview(); }
    if (tab === 'analytics') { loadAnalytics(); }
    if (tab === 'rewards' && state.user?.role === 'farmer') { loadFarmerRewards(); }
}

// ══════════════════════════════════════════
//  CAMERA MODULE
// ══════════════════════════════════════════

async function startCamera() {
    if (state.cameraStream) return;
    const video = document.getElementById('camera-video');
    try {
        state.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        video.srcObject = state.cameraStream;
        video.style.display = 'block';
        document.getElementById('camera-preview').style.display = 'none';
        document.getElementById('btn-capture').style.display = '';
        document.getElementById('btn-retake').style.display = 'none';
    } catch (e) {
        console.warn('Camera not available:', e);
        toast('Camera access denied or unavailable. You can upload a field photo instead.', 'warning');
    }
}

function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(t => t.stop());
        state.cameraStream = null;
    }
}

async function captureFrame() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    const preview = document.getElementById('camera-preview');

    if (!video.srcObject) {
        document.getElementById('photo-upload-input').click();
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) return toast('Could not capture an image. Please try again.', 'error');
    setSelectedPhoto(blob, 'camera', 'camera_capture.jpg');
    preview.src = state.imagePreviewUrl;
    preview.style.display = 'block';
    video.style.display = 'none';
    document.getElementById('btn-capture').style.display = 'none';
    document.getElementById('btn-retake').style.display = '';

    await runQualityCheck(blob);
}

function setSelectedPhoto(file, source, fileName = file.name || 'field_photo.jpg') {
    if (state.imagePreviewUrl) URL.revokeObjectURL(state.imagePreviewUrl);
    state.capturedBlob = file;
    state.imageSource = source;
    state.imageFileName = fileName;
    state.photoGps = null;
    state.photoGpsImage = null;
    document.getElementById('photo-gps-status').textContent =
        'Refresh GPS to link a fresh device location to this photo.';
    document.getElementById('photo-gps-status').className = 'photo-gps-status';
    state.imageDimensions = null;
    state.imagePreviewUrl = URL.createObjectURL(file);

    const thumbnail = document.getElementById('photo-thumbnail');
    const selection = document.getElementById('photo-selection');
    selection.hidden = false;
    document.getElementById('photo-file-name').textContent = fileName;
    document.getElementById('photo-dimensions').textContent = 'Reading image dimensions…';
    document.getElementById('photo-file-size').textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    thumbnail.onload = () => {
        state.imageDimensions = { width: thumbnail.naturalWidth, height: thumbnail.naturalHeight };
        document.getElementById('photo-dimensions').textContent =
            `${thumbnail.naturalWidth.toLocaleString()} × ${thumbnail.naturalHeight.toLocaleString()} px`;
    };
    thumbnail.onerror = () => {
        document.getElementById('photo-dimensions').textContent = 'Could not read image dimensions';
    };
    thumbnail.src = state.imagePreviewUrl;
}

async function handlePhotoFile(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        toast('Choose an image file such as JPG, PNG, or WebP.', 'warning');
        return;
    }
    if (file.size > 15 * 1024 * 1024) {
        toast('Photo is too large. Choose an image smaller than 15 MB.', 'warning');
        return;
    }
    setSelectedPhoto(file, 'upload');
    if (state.imageSource === 'upload') {
        const video = document.getElementById('camera-video');
        if (!state.cameraStream) video.style.display = 'none';
        document.getElementById('camera-preview').style.display = 'none';
        document.getElementById('btn-capture').style.display = '';
        document.getElementById('btn-retake').style.display = 'none';
    }
    await runQualityCheck(file);
}

function retakePhoto() {
    const source = state.imageSource;
    if (state.imagePreviewUrl) URL.revokeObjectURL(state.imagePreviewUrl);
    state.capturedBlob = null;
    state.imageSource = null;
    state.imagePreviewUrl = null;
    state.imageDimensions = null;
    state.imageFileName = null;
    state.photoGps = null;
    state.photoGpsImage = null;
    state.qualityResult = null;
    document.getElementById('photo-gps-status').textContent =
        'Select a photo, then refresh to link a fresh device location to it.';
    document.getElementById('photo-gps-status').className = 'photo-gps-status';
    document.getElementById('photo-selection').hidden = true;
    document.getElementById('photo-thumbnail').removeAttribute('src');
    document.getElementById('photo-upload-input').value = '';
    document.getElementById('camera-preview').style.display = 'none';
    document.getElementById('camera-video').style.display = state.cameraStream ? 'block' : 'none';
    document.getElementById('btn-capture').style.display = '';
    document.getElementById('btn-retake').style.display = 'none';
    document.getElementById('quality-panel').style.display = 'none';
    if (source === 'camera' && !state.cameraStream) startCamera();
}

const photoInput = document.getElementById('photo-upload-input');
const photoDropzone = document.getElementById('photo-dropzone');
photoInput.addEventListener('change', event => {
    handlePhotoFile(event.target.files[0]);
    photoInput.value = '';
});
photoDropzone.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        photoInput.click();
    }
});
['dragenter', 'dragover'].forEach(type => photoDropzone.addEventListener(type, event => {
    event.preventDefault();
    photoDropzone.classList.add('is-dragging');
}));
['dragleave', 'drop'].forEach(type => photoDropzone.addEventListener(type, event => {
    event.preventDefault();
    photoDropzone.classList.remove('is-dragging');
}));
photoDropzone.addEventListener('drop', event => handlePhotoFile(event.dataTransfer.files[0]));
document.getElementById('photo-remove').addEventListener('click', retakePhoto);

async function runQualityCheck(blob) {
    const panel = document.getElementById('quality-panel');
    panel.style.display = 'block';
    try {
        const fd = new FormData();
        fd.append('image', blob);
        const res = await fetch('/api/quality-check', { method: 'POST', body: fd });
        const data = await res.json();
        state.qualityResult = data;

        document.getElementById('q-blur-val').textContent = data.blur_score?.toFixed(1) ?? '—';
        const blurBadge = document.getElementById('q-blur-badge');
        blurBadge.textContent = data.blur_passed ? 'SHARP ✓' : 'BLURRY ✗';
        blurBadge.className = 'badge ' + (data.blur_passed ? 'pass' : 'fail');

        document.getElementById('q-bright-val').textContent = data.brightness?.toFixed(1) ?? '—';
        const brightBadge = document.getElementById('q-bright-badge');
        brightBadge.textContent = data.brightness_passed ? 'GOOD ✓' : 'BAD ✗';
        brightBadge.className = 'badge ' + (data.brightness_passed ? 'pass' : 'fail');

        const overall = document.getElementById('q-overall');
        if (data.is_valid) {
            overall.innerHTML = `${iconMarkup('check-circle')} Image quality passed — ready for submission`;
            overall.className = 'quality-overall pass';
        } else {
            overall.textContent = 'Quality check failed — ' + (data.failure_reasons || []).join('; ');
            overall.className = 'quality-overall fail';
        }
    } catch (e) {
        toast('Quality check failed: ' + e.message, 'error');
    }
}

// ══════════════════════════════════════════
//  GPS MODULE
// ══════════════════════════════════════════

function startGPS() {
    if (state.gpsWatchId) return;
    if (!navigator.geolocation) {
        document.getElementById('gps-badge').textContent = 'Geolocation not supported';
        document.getElementById('gps-status-pill').textContent = 'GPS: Unavailable';
        return;
    }
    state.gpsWatchId = navigator.geolocation.watchPosition(
        pos => {
            state.gps = {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude,
            };
            updateGPSDisplay();
        },
        err => {
            console.warn('GPS error:', err);
            state.gps = { lat: null, lon: null, accuracy: null, altitude: null };
            updateGPSDisplay();
            document.getElementById('gps-badge').textContent =
                err.code === 1 ? 'Location permission denied — allow location access' : 'Waiting for a reliable location fix…';
            document.getElementById('gps-badge').className = 'gps-accuracy-badge poor';
            document.getElementById('gps-status-pill').textContent = 'GPS: Unavailable';
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
}

function stopGPS() {
    if (state.gpsWatchId) {
        navigator.geolocation.clearWatch(state.gpsWatchId);
        state.gpsWatchId = null;
    }
}

function refreshPhotoGPS() {
    if (!state.capturedBlob) {
        return toast('Choose or capture a photo before refreshing its location.', 'warning');
    }
    if (!navigator.geolocation) {
        return toast('This browser does not support device geolocation.', 'error');
    }
    if (state.gpsRefreshPending) return;

    const button = document.getElementById('btn-refresh-photo-gps');
    const status = document.getElementById('photo-gps-status');
    state.gpsRefreshPending = true;
    button.disabled = true;
    button.textContent = 'Getting a fresh location…';
    status.textContent = 'Waiting for the device to return a high-accuracy location fix…';
    status.className = 'photo-gps-status';

    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude, accuracy, altitude } = position.coords;
        const acquiredAt = Number.isFinite(position.timestamp) ? position.timestamp : Date.now();
        state.photoGps = {
            lat: latitude,
            lon: longitude,
            accuracy,
            altitude,
            timestamp: acquiredAt,
        };
        state.photoGpsImage = state.capturedBlob;
        state.gps = { lat: latitude, lon: longitude, accuracy, altitude };
        updateGPSDisplay();

        const accuracyText = `Photo location set · ±${accuracy.toFixed(1)} m accuracy · ${new Date(acquiredAt).toLocaleTimeString()}`;
        status.textContent = accuracyText;
        status.className = `photo-gps-status ${accuracy <= 25 ? 'pass' : 'poor'}`;
        toast(accuracy <= 25
            ? 'Fresh location linked to this photo.'
            : 'Location acquired, but accuracy is over 25 m. Refresh again in an open area.', accuracy <= 25 ? 'success' : 'warning');
        state.gpsRefreshPending = false;
        button.disabled = false;
        button.innerHTML = `${iconMarkup('pin')} Refresh GPS for this photo`;
    }, error => {
        const message = error.code === 1
            ? 'Location permission denied. Allow location access in browser settings.'
            : error.code === 3
                ? 'Location request timed out. Move to an open area and try again.'
                : 'Could not get the device location. Check location services and try again.';
        status.textContent = message;
        status.className = 'photo-gps-status poor';
        state.gpsRefreshPending = false;
        button.disabled = false;
        button.innerHTML = `${iconMarkup('pin')} Refresh GPS for this photo`;
        toast(message, 'error');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
}

function updateGPSDisplay() {
    const g = state.gps;
    document.getElementById('gps-lat').textContent = Number.isFinite(g.lat) ? g.lat.toFixed(6) + '°' : '—';
    document.getElementById('gps-lon').textContent = Number.isFinite(g.lon) ? g.lon.toFixed(6) + '°' : '—';
    document.getElementById('gps-acc').textContent = Number.isFinite(g.accuracy) ? '± ' + g.accuracy.toFixed(1) + ' m' : '—';
    document.getElementById('gps-alt').textContent = Number.isFinite(g.altitude) ? g.altitude.toFixed(0) + ' m' : '—';

    const badge = document.getElementById('gps-badge');
    const pill = document.getElementById('gps-status-pill');
    if (!Number.isFinite(g.accuracy)) {
        badge.textContent = 'Waiting for GPS lock…';
        badge.className = 'gps-accuracy-badge';
        pill.textContent = 'GPS: Waiting';
    } else if (g.accuracy <= 10) {
        badge.innerHTML = `${iconMarkup('check-circle')} Optimal — ± ${g.accuracy.toFixed(1)}m (Sentinel-2 pixel match)`;
        badge.className = 'gps-accuracy-badge optimal';
        pill.innerHTML = `${iconMarkup('pin')} GPS: ± ${g.accuracy.toFixed(0)}m`;
    } else if (g.accuracy <= 25) {
        badge.innerHTML = `${iconMarkup('clock')} Acceptable — ± ${g.accuracy.toFixed(1)}m (Wait for better lock)`;
        badge.className = 'gps-accuracy-badge acceptable';
        pill.innerHTML = `${iconMarkup('pin')} GPS: ± ${g.accuracy.toFixed(0)}m`;
    } else {
        badge.innerHTML = `${iconMarkup('close-circle')} Poor — ± ${g.accuracy.toFixed(1)}m (Move to open area)`;
        badge.className = 'gps-accuracy-badge poor';
        pill.innerHTML = `${iconMarkup('pin')} GPS: Poor`;
    }
}

// ══════════════════════════════════════════
//  LULC SELECTION
// ══════════════════════════════════════════

function selectLULC(id) {
    state.selectedClass = id;
    document.querySelectorAll('.lulc-card').forEach(c => {
        c.classList.toggle('selected', parseInt(c.dataset.id) === id);
    });
}

// ══════════════════════════════════════════
//  SUBMISSION
// ══════════════════════════════════════════

async function submitGroundTruth() {
    if (!state.capturedBlob) return toast('Please capture a photo first', 'warning');
    if (!state.selectedClass) return toast('Please select a LULC category', 'warning');
    if (!state.photoGps || state.photoGpsImage !== state.capturedBlob) {
        return toast('Refresh GPS for this photo before submitting.', 'warning');
    }
    if (!Number.isFinite(state.photoGps.lat) || !Number.isFinite(state.photoGps.lon) || !Number.isFinite(state.photoGps.accuracy)) {
        return toast('The photo does not have a valid device location fix. Refresh GPS and try again.', 'warning');
    }
    if (state.photoGps.accuracy <= 0 || state.photoGps.accuracy > 25) {
        return toast('GPS accuracy must be 25 m or better before submitting. Move to open sky and wait for a better fix.', 'warning');
    }

    const cls = LULC[state.selectedClass];
    const fd = new FormData();
    fd.append('latitude', state.photoGps.lat);
    fd.append('longitude', state.photoGps.lon);
    fd.append('accuracy', state.photoGps.accuracy);
    fd.append('lulc_class_id', state.selectedClass);
    fd.append('lulc_class', cls.name);
    fd.append('notes', document.getElementById('field-notes').value);
    fd.append('surveyor_id', state.user?.id || 'anonymous');
    fd.append('compass_heading', 0);
    fd.append('altitude', state.photoGps.altitude || 0);
    fd.append('image', state.capturedBlob, state.imageFileName || 'ground_truth.jpg');

    try {
        const res = await fetch('/api/submit', {
            method: 'POST',
            headers: { Authorization: `Bearer ${state.authToken || ''}` },
            body: fd,
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Submission failed');
        }
        const data = await res.json();
        toast(
            `Ground truth submitted · ${data.latitude.toFixed(6)}°, ${data.longitude.toFixed(6)}° · ±${data.accuracy.toFixed(1)} m reported accuracy · ID: ${data.id?.slice(0, 8)}`,
            'success'
        );
        retakePhoto();
        state.selectedClass = null;
        document.querySelectorAll('.lulc-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('field-notes').value = '';
        loadStatistics();
        if (state.user?.role === 'farmer') loadFarmerRewards();
    } catch (e) {
        toast('Submission failed: ' + e.message, 'error');
    }
}

// ── Offline Queue ──
function saveOffline() {
    if (!state.capturedBlob) return toast('Capture a photo first', 'warning');
    if (!state.selectedClass) return toast('Select a LULC category first', 'warning');
    if (!state.photoGps || state.photoGpsImage !== state.capturedBlob) {
        return toast('Refresh GPS for this photo before saving the survey.', 'warning');
    }
    if (!Number.isFinite(state.photoGps.lat) || !Number.isFinite(state.photoGps.lon) ||
        !Number.isFinite(state.photoGps.accuracy) || state.photoGps.accuracy <= 0 || state.photoGps.accuracy > 25) {
        return toast('A real GPS fix with accuracy of 25 m or better is required to save this survey.', 'warning');
    }

    // We can't easily store blobs in localStorage, so we use a simple counter
    const queue = JSON.parse(localStorage.getItem('dp_offline_queue') || '[]');
    const reader = new FileReader();
    reader.onload = () => {
        queue.push({
            imageData: reader.result, // base64
            latitude: state.photoGps.lat,
            longitude: state.photoGps.lon,
            accuracy: state.photoGps.accuracy,
            lulc_class_id: state.selectedClass,
            lulc_class: LULC[state.selectedClass].name,
            notes: document.getElementById('field-notes').value,
            surveyor_id: state.user?.id || 'anonymous',
            timestamp: new Date().toISOString(),
            location_timestamp: new Date(state.photoGps.timestamp).toISOString(),
        });
        localStorage.setItem('dp_offline_queue', JSON.stringify(queue));
        document.getElementById('cache-status').innerHTML = `${iconMarkup('database')} Cached: ${queue.length}`;
        toast('Saved offline. It will sync when you are online.', 'info');
        retakePhoto();
    };
    reader.readAsDataURL(state.capturedBlob);
}

async function syncOfflineQueue() {
    const queue = JSON.parse(localStorage.getItem('dp_offline_queue') || '[]');
    if (queue.length === 0) return;
    if (!navigator.onLine) return;

    let synced = 0;
    const remaining = [];
    for (const item of queue) {
        if (!state.user || item.surveyor_id !== state.user.id) {
            remaining.push(item);
            continue;
        }
        try {
            // Convert base64 back to blob
            const resp = await fetch(item.imageData);
            const blob = await resp.blob();

            const fd = new FormData();
            fd.append('latitude', item.latitude);
            fd.append('longitude', item.longitude);
            fd.append('accuracy', item.accuracy);
            fd.append('lulc_class_id', item.lulc_class_id);
            fd.append('lulc_class', item.lulc_class);
            fd.append('notes', item.notes || '');
            fd.append('surveyor_id', item.surveyor_id);
            fd.append('compass_heading', 0);
            fd.append('altitude', 0);
            fd.append('image', blob, 'offline_sync.jpg');

            const res = await fetch('/api/submit', {
                method: 'POST',
                headers: { Authorization: `Bearer ${state.authToken || ''}` },
                body: fd,
            });
            if (res.ok) synced++;
            else remaining.push(item);
        } catch (e) {
            remaining.push(item);
            console.error('Sync failed for item:', e);
        }
    }

    if (synced > 0 || remaining.length !== queue.length) {
        localStorage.setItem('dp_offline_queue', JSON.stringify(remaining));
        document.getElementById('cache-status').innerHTML = `${iconMarkup('database')} Cached: ${remaining.length}`;
        if (synced > 0) toast(`Synced ${synced} offline records.`, 'success');
        loadStatistics();
        if (state.user?.role === 'farmer') loadFarmerRewards();
    }
}

window.addEventListener('online', syncOfflineQueue);
setInterval(() => { if (navigator.onLine) syncOfflineQueue(); }, 30000);

// ══════════════════════════════════════════
//  GIS MAP (Leaflet)
// ══════════════════════════════════════════

function initMap() {
    if (state.map) { state.map.invalidateSize(); return; }

    state.map = L.map('gis-map').setView([22.5, 79], 5);

    // ESRI Satellite
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; ESRI World Imagery', maxZoom: 18,
    });

    // OpenStreetMap
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19,
    });

    esri.addTo(state.map);
    L.control.layers({ 'Satellite (ESRI)': esri, 'Street Map (OSM)': osm }).addTo(state.map);
    state.map.getContainer().addEventListener('click', event => {
        const photoButton = event.target.closest('.map-popup-photo');
        if (photoButton) {
            zoomToMapPoint(Number(photoButton.dataset.latitude), Number(photoButton.dataset.longitude));
        }
    }, true);
    state.map.on('popupclose', event => {
        setTimeout(() => {
            if (state.previewMarker === event.popup._source) state.previewMarker = null;
        }, 0);
    });
}

async function reloadMapMarkers() {
    if (!state.map) return;

    // Clear existing
    state.markers.forEach(m => state.map.removeLayer(m));
    state.markers = [];
    state.accuracyCircles.forEach(circle => state.map.removeLayer(circle));
    state.accuracyCircles = [];
    await loadShowcaseMapMarkers();

    // Get filter state
    const checkedClasses = [];
    document.querySelectorAll('#map-class-filters input:checked').forEach(cb => checkedClasses.push(cb.value));
    const statusFilter = document.getElementById('map-status-filter').value;

    try {
        let url = '/api/submissions?limit=500';
        if (statusFilter) url += '&status=' + statusFilter;
        const res = await fetch(url);
        const data = await res.json();
        const showDemoPoints = document.getElementById('map-demo-points-toggle')?.checked === true;

        data.forEach(s => {
            if (!checkedClasses.includes(String(s.lulc_class_id))) return;
            if (!s.image_url && !showDemoPoints) return;

            const cls = LULC[s.lulc_class_id] || {};
            const isPhotoSubmission = Boolean(s.image_url);
            const marker = L.circleMarker([s.latitude, s.longitude], {
                radius: 8,
                fillColor: isPhotoSubmission ? (cls.color || '#999') : '#7B8188',
                color: '#fff',
                weight: 2,
                fillOpacity: isPhotoSubmission ? 0.85 : 0.6,
                dashArray: isPhotoSubmission ? null : '3 3',
            }).addTo(state.map);
            if (Number.isFinite(s.accuracy) && s.accuracy > 0) {
                const accuracyCircle = L.circle([s.latitude, s.longitude], {
                    radius: s.accuracy,
                    color: isPhotoSubmission ? (cls.color || '#555') : '#7B8188',
                    weight: 1,
                    fillOpacity: 0.08,
                }).addTo(state.map);
                state.accuracyCircles.push(accuracyCircle);
            }

            // Popup
            let popupHtml = `<div class="map-popup" style="min-width:180px">
                <strong>${iconMarkup(cls.icon || 'map')} ${s.lulc_class}</strong><br>
                <small>${s.latitude?.toFixed(6)}°N, ${s.longitude?.toFixed(6)}°E</small><br>
                <small>Reported GPS uncertainty: ±${s.accuracy?.toFixed(1)} m</small><br>`;
            if (s.image_url) {
                popupHtml += '<small class="map-popup-label">Photo-backed submission · device GPS recorded for this upload</small>';
                popupHtml += `<button type="button" class="map-popup-photo" data-latitude="${Number(s.latitude)}" data-longitude="${Number(s.longitude)}" aria-label="Zoom to this survey point"><img src="${escapeHtml(s.image_url)}" alt="Survey photo" loading="lazy"></button>`;
            } else {
                popupHtml += '<small class="map-popup-no-photo">Synthetic demo coordinate — not a live photo upload or device location.</small>';
            }
            const zoomHint = s.image_url
                ? 'Click the point or photo again to zoom in.'
                : 'Click the point again to zoom in.';
            popupHtml += `<small>Status: ${escapeHtml(s.verification_status)} | ${escapeHtml(s.created_at)}</small>
                <small class="map-popup-hint">${zoomHint}</small></div>`;
            marker.bindPopup(popupHtml);

            marker.on('click', () => {
                inspectPoint(s);
            });
            bindTwoStepMapInteraction(marker, s.latitude, s.longitude);
            state.markers.push(marker);
        });

    } catch (e) {
        toast('Failed to load map data: ' + e.message, 'error');
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[character]));
}

async function loadShowcaseMapMarkers() {
    if (state.showcaseMarkersLoaded) return;

    try {
        const res = await fetch('/static/showcase-farms.json');
        if (!res.ok) throw new Error('Could not load farm photo references');
        const examples = await res.json();
        if (!Array.isArray(examples)) throw new Error('Farm photo reference data is invalid');

        const showMarkers = document.getElementById('showcase-map-toggle')?.checked !== false;
        examples.forEach(example => {
            const lat = Number(example.latitude);
            const lon = Number(example.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 6 || lat > 38 || lon < 68 || lon > 98) {
                throw new Error('A showcase photo has invalid India coordinates');
            }

            const marker = L.circleMarker([lat, lon], {
                radius: 9,
                fillColor: '#C77932',
                color: '#fff',
                weight: 2,
                fillOpacity: 0.95,
            });

            const caption = escapeHtml(example.caption);
            const image = escapeHtml(example.image);
            const creator = escapeHtml(example.creator);
            const license = escapeHtml(example.license);
            const licenseUrl = escapeHtml(example.license_url);
            const sourcePage = escapeHtml(example.source_page);
            const region = escapeHtml(example.region);
            marker.bindPopup(`<div class="showcase-popup">
                <strong>${caption}</strong>
                <small class="showcase-popup-label">Publicly licensed showcase photo · not a survey submission</small>
                <button type="button" class="map-popup-photo" data-latitude="${lat}" data-longitude="${lon}" aria-label="Zoom to this photo location"><img src="${image}" alt="${caption}" loading="lazy"></button>
                <small>${region}</small>
                <small>${lat.toFixed(6)}°N, ${lon.toFixed(6)}°E · photo GPS metadata, not a parcel boundary</small>
                <small>Photo: ${creator} · <a href="${licenseUrl}" target="_blank" rel="noopener noreferrer">${license}</a></small>
                <a href="${sourcePage}" target="_blank" rel="noopener noreferrer">View source and attribution</a>
                <small class="map-popup-hint">Click the point or photo again to zoom in.</small>
            </div>`);
            bindTwoStepMapInteraction(marker, lat, lon);
            if (showMarkers) marker.addTo(state.map);
            state.showcaseMarkers.push(marker);
        });
        if (showMarkers && state.showcaseMarkers.length) {
            state.map.fitBounds(L.featureGroup(state.showcaseMarkers).getBounds(), {
                padding: [24, 24],
                maxZoom: 6,
            });
        }
        state.showcaseMarkersLoaded = true;
    } catch (e) {
        toast('Failed to load showcase map photos: ' + e.message, 'error');
    }
}

function bindTwoStepMapInteraction(marker, latitude, longitude) {
    marker.on('click', () => {
        if (state.previewMarker === marker) {
            zoomToMapPoint(latitude, longitude);
            return;
        }
        state.previewMarker = marker;
    });
}

function zoomToMapPoint(latitude, longitude) {
    state.map.flyTo([latitude, longitude], Math.max(state.map.getZoom(), 16), { duration: 0.8 });
}

function toggleShowcaseMarkers() {
    if (!state.map) return;
    const visible = document.getElementById('showcase-map-toggle').checked;
    state.showcaseMarkers.forEach(marker => {
        if (visible) marker.addTo(state.map);
        else state.map.removeLayer(marker);
    });
}

function inspectPoint(s) {
    state.inspectedId = s.id;
    const card = document.getElementById('inspector-card');
    card.style.display = 'block';

    const photo = document.getElementById('insp-photo');
    if (s.image_url) { photo.src = s.image_url; photo.style.display = 'block'; }
    else { photo.style.display = 'none'; }

    document.getElementById('insp-id').textContent = s.id?.slice(0, 12) + '…';
    const cls = LULC[s.lulc_class_id] || {};
    document.getElementById('insp-class').innerHTML = `${iconMarkup(cls.icon || 'map')} ${s.lulc_class}`;
    document.getElementById('insp-coords').textContent = s.latitude?.toFixed(6) + '°N, ' + s.longitude?.toFixed(6) + '°E';
    document.getElementById('insp-acc').textContent = '± ' + s.accuracy?.toFixed(1) + ' m';
    document.getElementById('insp-blur').textContent = s.blur_score?.toFixed(1) + (s.blur_score >= 100 ? ' (Sharp ✓)' : ' (Blurry ✗)');
    document.getElementById('insp-status').innerHTML = `<span class="badge ${s.verification_status}">${s.verification_status?.toUpperCase()}</span>`;
    document.getElementById('insp-surveyor').textContent = formatSurveyorName(s.surveyor_id, s.surveyor_role);
    document.getElementById('insp-notes').textContent = s.notes || '—';
    document.getElementById('insp-time').textContent = s.created_at || '—';

    // Show approve/reject only for analyst/admin
    const actions = document.getElementById('insp-actions');
    actions.style.display = (state.user?.role === 'analyst' || state.user?.role === 'admin') ? 'flex' : 'none';
    document.getElementById('insp-delete').style.display = actions.style.display;
}

async function deletePoint() {
    if (!state.inspectedId || !['analyst', 'admin'].includes(state.user?.role)) return;
    if (!window.confirm('Permanently delete this submission and its uploaded photo? This cannot be undone.')) return;
    try {
        const res = await fetch(`/api/submissions/${encodeURIComponent(state.inspectedId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${state.authToken || ''}` },
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || 'Could not delete submission');
        }
        document.getElementById('inspector-card').style.display = 'none';
        document.getElementById('insp-photo').removeAttribute('src');
        state.inspectedId = null;
        toast('Submission and its uploaded photo deleted.', 'success');
        await reloadMapMarkers();
        loadStatistics();
        if (state.currentTab === 'analytics') loadAnalytics();
    } catch (e) {
        toast('Delete failed: ' + e.message, 'error');
    }
}

async function verifyPoint(status) {
    if (!state.inspectedId) return;
    try {
        const res = await fetch(`/api/submissions/${state.inspectedId}/verify`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${state.authToken || ''}`,
            },
            body: JSON.stringify({ status, reviewer_id: state.user?.id }),
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || 'Could not update verification status');
        }
        toast(`Point ${status === 'verified' ? 'approved' : 'rejected'}.`, 'success');
        reloadMapMarkers();
        loadStatistics();
    } catch (e) { toast('Verification failed: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════

function downloadExport(type) {
    window.location.href = `/api/export/${type}`;
}

async function loadSTAC() {
    try {
        const res = await fetch('/api/export/stac');
        const data = await res.json();
        document.getElementById('stac-json').textContent = JSON.stringify(data, null, 2);
        document.getElementById('stac-viewer').style.display = 'block';
    } catch (e) { toast('Failed to load STAC metadata', 'error'); }
}

async function loadExportPreview() {
    try {
        const res = await fetch('/api/submissions?limit=10');
        const data = await res.json();
        const tbody = document.getElementById('export-preview-body');
        tbody.innerHTML = data.map(s => `<tr>
            <td>${s.id?.slice(0, 8)}…</td>
            <td>${s.latitude?.toFixed(4)}</td>
            <td>${s.longitude?.toFixed(4)}</td>
            <td>${iconMarkup(LULC[s.lulc_class_id]?.icon || 'map')} ${s.lulc_class || ''}</td>
            <td>± ${s.accuracy?.toFixed(1)}m</td>
            <td>${s.blur_score?.toFixed(0)}</td>
            <td><span class="badge ${s.verification_status}">${s.verification_status}</span></td>
            <td>${s.created_at?.slice(0, 16) || ''}</td>
        </tr>`).join('');
    } catch (e) {}
}

// ══════════════════════════════════════════
//  STATISTICS & ANALYTICS
// ══════════════════════════════════════════

async function loadStatistics() {
    try {
        const res = await fetch('/api/statistics');
        const s = await res.json();
        document.getElementById('kpi-total').textContent = s.total?.toLocaleString() || '0';
        document.getElementById('kpi-verified').textContent = s.verified + (s.total > 0 ? ` (${((s.verified/s.total)*100).toFixed(0)}%)` : '');
        document.getElementById('kpi-accuracy').textContent = s.mean_accuracy ? '± ' + s.mean_accuracy.toFixed(1) + 'm' : '—';
        document.getElementById('kpi-surveyors').textContent = s.unique_surveyors || '0';
    } catch (e) {}
}

async function loadFarmerRewards() {
    if (state.user?.role !== 'farmer') return;
    try {
        const res = await fetch('/api/farmer/rewards', {
            headers: { Authorization: `Bearer ${state.authToken || ''}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Could not load your field journey');
        renderFarmerRewards(data);
    } catch (e) {
        document.getElementById('field-quiz-feedback').textContent = e.message;
        toast('Rewards could not be loaded: ' + e.message, 'error');
    }
}

function renderFarmerRewards(data) {
    const points = Number(data.points) || 0;
    const level = Math.floor(points / 100) + 1;
    const levelPoints = points % 100;
    document.getElementById('reward-submissions').textContent = data.submissions ?? 0;
    document.getElementById('reward-accepted').textContent = data.accepted ?? 0;
    document.getElementById('reward-points').textContent = points.toLocaleString();
    document.getElementById('reward-level').textContent = `Level ${level}`;
    document.getElementById('reward-level-progress-label').textContent = `${levelPoints} / 100 XP to next level`;
    document.getElementById('reward-level-progress').setAttribute('aria-valuenow', String(levelPoints));
    document.getElementById('reward-level-progress-fill').style.width = `${levelPoints}%`;

    const badges = document.getElementById('reward-badges');
    badges.replaceChildren(...(data.badges || []).map(badge => {
        const article = document.createElement('article');
        article.className = `reward-badge ${badge.earned ? 'is-earned' : 'is-locked'}`;
        const icon = document.createElement('span');
        icon.className = 'reward-badge-icon';
        icon.innerHTML = iconMarkup(badge.earned ? 'check-circle' : 'award');
        const text = document.createElement('span');
        text.className = 'reward-badge-copy';
        const title = document.createElement('strong');
        title.textContent = badge.title;
        const progress = document.createElement('small');
        progress.textContent = badge.earned ? 'Badge earned' : `${badge.progress} / ${badge.goal} toward badge`;
        text.append(title, progress);
        article.append(icon, text);
        return article;
    }));

    const quizOptions = document.getElementById('field-quiz-options');
    const quizButton = document.getElementById('field-quiz-submit');
    const feedback = document.getElementById('field-quiz-feedback');
    quizOptions.disabled = Boolean(data.quiz_played_today);
    quizButton.disabled = Boolean(data.quiz_played_today);
    if (data.quiz_played_today) {
        feedback.textContent = 'Challenge complete for today. Come back tomorrow for another field-scout question.';
    }
}

async function submitFieldQuiz() {
    if (state.user?.role !== 'farmer') return;
    const answer = document.querySelector('input[name="field-quiz"]:checked')?.value;
    if (!answer) {
        document.getElementById('field-quiz-feedback').textContent = 'Choose an answer before submitting.';
        return;
    }

    const button = document.getElementById('field-quiz-submit');
    const feedback = document.getElementById('field-quiz-feedback');
    button.disabled = true;
    try {
        const res = await fetch('/api/farmer/rewards/quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${state.authToken || ''}`,
            },
            body: JSON.stringify({ answer }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Could not submit your answer');
        feedback.textContent = data.correct
            ? 'Correct! Crop rows and visible soil or vegetation make useful land-cover evidence. +5 points earned.'
            : 'Not quite. Crop rows and visible soil or vegetation make the most useful land-cover evidence. Try tomorrow.';
        renderFarmerRewards(data.rewards);
    } catch (e) {
        feedback.textContent = e.message;
        button.disabled = false;
    }
}

async function loadAnalytics() {
    await loadStatistics();
    try {
        const res = await fetch('/api/statistics');
        const s = await res.json();

        // Class distribution chart
        const chartDiv = document.getElementById('chart-class-dist');
        const maxCount = Math.max(...Object.values(s.by_class || {}).map(c => c.count || 0), 1);
        let chartHtml = '<div class="bar-chart">';
        for (const [name, info] of Object.entries(s.by_class || {})) {
            const cls = Object.values(LULC).find(l => l.name === name) || {};
            const pct = ((info.count / maxCount) * 100).toFixed(0);
            chartHtml += `<div class="bar-row">
                <div class="bar-label">${iconMarkup(cls.icon || 'map')} ${name}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${cls.color || '#999'}"><span>${info.count}</span></div></div>
            </div>`;
        }
        chartHtml += '</div>';
        chartDiv.innerHTML = chartHtml;

        // Status breakdown
        const statusDiv = document.getElementById('chart-status-dist');
        const statusData = [
            { label: 'Verified', count: s.verified, color: '#2D6A54' },
            { label: 'Pending', count: s.pending, color: '#805411' },
            { label: 'Rejected', count: s.rejected, color: '#A33D3D' },
        ];
        const sMax = Math.max(...statusData.map(d => d.count), 1);
        let statusHtml = '<div class="bar-chart">';
        statusData.forEach(d => {
            const pct = ((d.count / sMax) * 100).toFixed(0);
            statusHtml += `<div class="bar-row">
                <div class="bar-label">${d.label}</div>
                <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${d.color}"><span>${d.count}</span></div></div>
            </div>`;
        });
        statusHtml += '</div>';
        statusDiv.innerHTML = statusHtml;

        // Leaderboard (from submissions)
        const subRes = await fetch('/api/submissions?limit=500');
        const subs = await subRes.json();
        const counts = {};
        subs.forEach(sub => { counts[sub.surveyor_id] = (counts[sub.surveyor_id] || 0) + 1; });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        const lbody = document.getElementById('leaderboard-body');
        lbody.innerHTML = sorted.map(([name, cnt], i) =>
            `<tr><td>${i + 1}</td><td>${formatSurveyorName(name)}</td><td><strong>${cnt}</strong></td></tr>`
        ).join('');

    } catch (e) { console.error('Analytics load error:', e); }
}

// ══════════════════════════════════════════
//  GUIDELINES ACCORDION
// ══════════════════════════════════════════

const GUIDELINE_LOCALES = {
    en: {
        languageLabel: 'Guideline language',
        tabTitle: 'Guidelines',
        tabSubtitle: 'Choose your language',
        sections: [
            '1. LULC Classification Reference (Bhuvan Level-1)',
            '2. How to Capture Ground Truth',
            '3. GPS Accuracy Guidelines',
            '4. Image Quality Requirements',
            '5. About Bhu-Drishti and ISRO',
        ],
        classHeaders: ['ID', 'Land-cover class', 'Description', 'Photo tips'],
        classes: [
            ['Cropland', 'Active fields, plantations, orchards, and fallow cropland.', 'Photograph at eye level so both soil and crop rows or vegetation are visible.'],
            ['Forest', 'Natural or planted forests, dense tree cover, and scrubland taller than 1 metre.', 'Show the canopy from ground level; angle the camera upward where appropriate.'],
            ['Urban / Built-up', 'Buildings, roads, paved surfaces, construction sites, and industrial areas.', 'Include building fronts, rooftops, or road surfaces.'],
            ['Water body', 'Rivers, lakes, ponds, reservoirs, canals, and wetlands with standing water.', 'Include the water edge or bank to provide context.'],
            ['Barren / Fallow', 'Sandy, rocky, or bare soil; salt flats; and land without vegetation.', 'Show ground texture clearly and include the horizon for context.'],
        ],
        captureSteps: [
            ['Stand where the sky is open', 'Wait 5–10 seconds for GPS to settle; aim for a reported accuracy under 10 m.'],
            ['Point the camera at the land cover', 'Hold the phone around chest height and frame the terrain horizontally.'],
            ['Hold steady for 2 seconds', 'Avoid motion blur; the portal checks photo sharpness.'],
            ['Choose the matching LULC class', 'Use the picture cards. If unsure, choose the cover type occupying most of the visible scene (over 50%).'],
            ['Add useful notes', 'Name the crop (such as wheat or rice), describe water clarity or building type, or note the season.'],
            ['Submit or save offline', 'Submit when connected; otherwise save the survey offline and sync it later.'],
        ],
        gpsHeaders: ['Level', 'Reported accuracy', 'Indicator', 'What to do'],
        gpsRows: [
            ['Optimal', '≤ 10 metres', 'Green', 'A strong device location fix. Useful for field reference; it is not a surveyed parcel boundary.'],
            ['Acceptable', '10–25 metres', 'Amber', 'Usable, but try waiting in an open area for a better location fix.'],
            ['Poor', '> 25 metres', 'Red', 'The portal will not accept it. Move away from buildings or trees and refresh GPS.'],
        ],
        quality: [
            ['Blur check:', 'Laplacian variance ≥ 100 is the portal threshold for sharpness. Hold the phone steady.'],
            ['Brightness:', 'Mean grayscale should be between 40 and 220. Avoid very dark scenes and harsh glare.'],
            ['Use a real field photo:', 'Capture or upload a photo of the land. Show crop rows, soil, or other land-cover detail; avoid people and unrelated objects.'],
            ['Location and limits:', 'The portal records the device GPS position and its reported accuracy. A ground-level photo documents visible land cover; by itself it cannot calculate parcel area or boundaries.'],
        ],
        about: [
            'Bhu-Drishti is a citizen-science project created for the ORBITRON Space Technology Hackathon (PS-24, Domain 6). It invites citizens, NCC/NSS cadets, agricultural students, and forest officers to contribute reviewed ground observations for land-use and land-cover (LULC) research.',
            'The portal checks image sharpness and brightness and records the device-reported GPS accuracy. These checks support data review; they do not guarantee a survey-grade position, parcel boundary, or an official partnership with any agency.',
        ],
    },
    hi: {
        languageLabel: 'दिशानिर्देशों की भाषा',
        tabTitle: 'दिशानिर्देश',
        tabSubtitle: 'अपनी भाषा चुनें',
        sections: [
            '1. भूमि उपयोग एवं आवरण वर्गीकरण (भुवन स्तर-1)',
            '2. ज़मीनी जानकारी के लिए फोटो कैसे लें',
            '3. GPS सटीकता के दिशानिर्देश',
            '4. फोटो गुणवत्ता की आवश्यकताएँ',
            '5. भू-दृष्टि और ISRO के बारे में',
        ],
        classHeaders: ['क्रमांक', 'भूमि आवरण वर्ग', 'विवरण', 'फोटो लेने के सुझाव'],
        classes: [
            ['कृषि भूमि', 'सक्रिय खेत, बागान, फलोद्यान और परती कृषि भूमि।', 'ऐसा फोटो लें जिसमें मिट्टी और फसल की कतारें या वनस्पति साफ़ दिखें।'],
            ['वन', 'प्राकृतिक या लगाए गए वन, घना वृक्ष आवरण और 1 मीटर से ऊँची झाड़ियाँ।', 'ज़मीन से वृक्ष-छत्र दिखाएँ; ज़रूरत हो तो कैमरा ऊपर की ओर रखें।'],
            ['शहरी / निर्मित क्षेत्र', 'इमारतें, सड़कें, पक्की सतहें, निर्माण स्थल और औद्योगिक क्षेत्र।', 'इमारत का सामने का भाग, छत या सड़क की सतह दिखाएँ।'],
            ['जल निकाय', 'नदियाँ, झीलें, तालाब, जलाशय, नहरें और स्थिर पानी वाली आर्द्रभूमियाँ।', 'संदर्भ के लिए पानी का किनारा या तट भी शामिल करें।'],
            ['बंजर / परती भूमि', 'रेतीली, पथरीली या खाली मिट्टी, नमक के मैदान और वनस्पति रहित भूमि।', 'ज़मीन की बनावट साफ़ दिखाएँ और संदर्भ के लिए क्षितिज भी रखें।'],
        ],
        captureSteps: [
            ['खुले आसमान वाली जगह पर खड़े हों', 'GPS स्थिर होने के लिए 5–10 सेकंड प्रतीक्षा करें; सटीकता 10 मीटर से कम रखने का प्रयास करें।'],
            ['कैमरा भूमि आवरण की ओर रखें', 'फोन को लगभग छाती की ऊँचाई पर रखकर सामने का भू-दृश्य फ्रेम करें।'],
            ['2 सेकंड तक स्थिर रखें', 'हाथ न हिलाएँ ताकि फोटो धुंधला न हो; पोर्टल फोटो की स्पष्टता जाँचता है।'],
            ['सही LULC वर्ग चुनें', 'चित्र वाले कार्ड देखें। संदेह होने पर दृश्य के आधे से अधिक भाग में मौजूद आवरण चुनें।'],
            ['काम की टिप्पणी जोड़ें', 'फसल का नाम (जैसे गेहूँ या धान), पानी की स्थिति, इमारत का प्रकार या मौसम लिखें।'],
            ['जमा करें या ऑफलाइन सहेजें', 'इंटरनेट होने पर जमा करें; अन्यथा सर्वे ऑफलाइन सहेजकर बाद में सिंक करें।'],
        ],
        gpsHeaders: ['स्तर', 'दर्शाई गई सटीकता', 'संकेत', 'क्या करें'],
        gpsRows: [
            ['उत्तम', '≤ 10 मीटर', 'हरा', 'डिवाइस का अच्छा लोकेशन फिक्स। यह खेत का संदर्भ है, सर्वेक्षित सीमा नहीं।'],
            ['स्वीकार्य', '10–25 मीटर', 'पीला', 'उपयोग योग्य है; बेहतर GPS फिक्स के लिए खुली जगह पर प्रतीक्षा करें।'],
            ['कमज़ोर', '> 25 मीटर', 'लाल', 'पोर्टल इसे स्वीकार नहीं करेगा। इमारतों या पेड़ों से दूर जाकर GPS फिर से लें।'],
        ],
        quality: [
            ['धुंधलापन जाँच:', 'स्पष्ट फोटो के लिए पोर्टल की सीमा Laplacian variance ≥ 100 है। फोन स्थिर रखें।'],
            ['रोशनी:', 'औसत grayscale मान 40 से 220 के बीच होना चाहिए। बहुत अँधेरे दृश्य और तेज़ चमक से बचें।'],
            ['वास्तविक खेत का फोटो लें:', 'भूमि का फोटो खींचें या अपलोड करें। फसल की कतारें, मिट्टी या भूमि आवरण दिखाएँ; लोगों और असंबंधित वस्तुओं से बचें।'],
            ['स्थान और सीमाएँ:', 'पोर्टल डिवाइस का GPS स्थान और बताई गई सटीकता दर्ज करता है। ज़मीन से लिया फोटो दिखाई देने वाले भूमि आवरण का प्रमाण है; अकेले इससे खेत का क्षेत्रफल या सीमा नहीं मापी जा सकती।'],
        ],
        about: [
            'भू-दृष्टि ORBITRON Space Technology Hackathon (PS-24, Domain 6) के लिए बनाया गया नागरिक-विज्ञान प्रोजेक्ट है। यह नागरिकों, NCC/NSS कैडेटों, कृषि विद्यार्थियों और वन अधिकारियों को भूमि उपयोग एवं आवरण (LULC) अनुसंधान के लिए समीक्षा योग्य ज़मीनी अवलोकन साझा करने का अवसर देता है।',
            'पोर्टल फोटो की स्पष्टता और रोशनी जाँचता है तथा डिवाइस द्वारा बताई गई GPS सटीकता दर्ज करता है। ये जाँच डेटा की समीक्षा में मदद करती हैं; ये सर्वेक्षण-स्तर का स्थान, खेत की सीमा या किसी संस्था के साथ आधिकारिक साझेदारी की गारंटी नहीं हैं।',
        ],
    },
    mr: {
        languageLabel: 'मार्गदर्शक सूचनांची भाषा',
        tabTitle: 'मार्गदर्शक सूचना',
        tabSubtitle: 'तुमची भाषा निवडा',
        sections: [
            '1. भू-वापर व भू-आच्छादन वर्गीकरण (भुवन स्तर-1)',
            '2. जमिनीवरील माहितीचे छायाचित्र कसे घ्यावे',
            '3. GPS अचूकतेसाठी मार्गदर्शक सूचना',
            '4. छायाचित्राच्या गुणवत्तेच्या अटी',
            '5. भू-दृष्टी आणि ISRO विषयी',
        ],
        classHeaders: ['क्रमांक', 'भू-आच्छादन वर्ग', 'वर्णन', 'छायाचित्रासाठी सूचना'],
        classes: [
            ['शेती जमीन', 'लागवडीखालील शेत, मळे, फळबागा आणि पडीक शेती जमीन.', 'माती आणि पिकांच्या ओळी किंवा वनस्पती स्पष्ट दिसतील असे छायाचित्र घ्या.'],
            ['वन', 'नैसर्गिक किंवा लावलेली वने, दाट वृक्षाच्छादन आणि 1 मीटरपेक्षा उंच झुडपे.', 'जमिनीवरून वृक्षछत्र दाखवा; गरजेनुसार कॅमेरा वरच्या दिशेने ठेवा.'],
            ['शहरी / बांधकाम क्षेत्र', 'इमारती, रस्ते, पक्के पृष्ठभाग, बांधकाम स्थळे आणि औद्योगिक क्षेत्रे.', 'इमारतीचा दर्शनी भाग, छत किंवा रस्त्याचा पृष्ठभाग दाखवा.'],
            ['जलसाठा', 'नद्या, तलाव, तळी, जलाशय, कालवे आणि स्थिर पाणी असलेल्या पाणथळ जागा.', 'संदर्भासाठी पाण्याची कड किंवा किनारा छायाचित्रात घ्या.'],
            ['ओसाड / पडीक जमीन', 'वाळूमय, खडकाळ किंवा उघडी माती, क्षारभूमी आणि वनस्पती नसलेली जमीन.', 'जमिनीचा पोत स्पष्ट दाखवा आणि संदर्भासाठी क्षितिजही ठेवा.'],
        ],
        captureSteps: [
            ['मोकळे आकाश असलेल्या ठिकाणी उभे राहा', 'GPS स्थिर होण्यासाठी 5–10 सेकंद थांबा; अचूकता 10 मीटरपेक्षा कमी मिळवण्याचा प्रयत्न करा.'],
            ['कॅमेरा भू-आच्छादनाकडे ठेवा', 'फोन छातीच्या उंचीवर धरून समोरील भूभाग छायाचित्रात घ्या.'],
            ['2 सेकंद स्थिर धरा', 'हात हलवू नका; त्यामुळे छायाचित्र धूसर होऊ शकते. पोर्टल छायाचित्राची स्पष्टता तपासते.'],
            ['योग्य LULC वर्ग निवडा', 'चित्रांसह दिलेली कार्डे वापरा. शंका असल्यास दृश्याच्या अर्ध्यापेक्षा जास्त भाग व्यापणारा वर्ग निवडा.'],
            ['उपयुक्त नोंद लिहा', 'पिकाचे नाव (उदा. गहू किंवा भात), पाण्याची स्थिती, इमारतीचा प्रकार किंवा हंगाम नमूद करा.'],
            ['जमा करा किंवा ऑफलाइन जतन करा', 'इंटरनेट असल्यास लगेच जमा करा; अन्यथा सर्वेक्षण ऑफलाइन जतन करून नंतर सिंक करा.'],
        ],
        gpsHeaders: ['स्तर', 'दर्शवलेली अचूकता', 'सूचक', 'काय करावे'],
        gpsRows: [
            ['उत्तम', '≤ 10 मीटर', 'हिरवा', 'डिव्हाइसचे चांगले स्थान-निर्धारण. हे शेतासाठी संदर्भ आहे, मोजलेली हद्द नाही.'],
            ['स्वीकार्य', '10–25 मीटर', 'पिवळा', 'वापरण्यायोग्य; अधिक चांगल्या GPS स्थानासाठी मोकळ्या जागेत थांबा.'],
            ['कमी', '> 25 मीटर', 'लाल', 'पोर्टल हे स्वीकारणार नाही. इमारती किंवा झाडांपासून दूर जाऊन GPS पुन्हा घ्या.'],
        ],
        quality: [
            ['धूसरपणा तपासणी:', 'स्पष्टतेसाठी पोर्टलची मर्यादा Laplacian variance ≥ 100 आहे. फोन स्थिर धरा.'],
            ['प्रकाशमानता:', 'सरासरी grayscale मूल्य 40 ते 220 दरम्यान असावे. खूप अंधार आणि तीव्र चकाकी टाळा.'],
            ['खऱ्या शेताचे छायाचित्र वापरा:', 'जमिनीचे छायाचित्र घ्या किंवा अपलोड करा. पिकांच्या ओळी, माती किंवा भू-आच्छादन दाखवा; व्यक्ती आणि असंबंधित वस्तू टाळा.'],
            ['स्थान आणि मर्यादा:', 'पोर्टल डिव्हाइसचे GPS स्थान आणि त्याने दर्शवलेली अचूकता नोंदवते. जमिनीवरून घेतलेले छायाचित्र दिसणाऱ्या भू-आच्छादनाचा पुरावा आहे; त्यावरून एकट्याने क्षेत्रफळ किंवा शेताची हद्द मोजता येत नाही.'],
        ],
        about: [
            'भू-दृष्टी हा ORBITRON Space Technology Hackathon (PS-24, Domain 6) साठी तयार केलेला नागरिक-विज्ञान प्रकल्प आहे. नागरिक, NCC/NSS कॅडेट, कृषी विद्यार्थी आणि वन अधिकारी यांना भू-वापर व भू-आच्छादन (LULC) संशोधनासाठी तपासता येणारी जमिनीवरील निरीक्षणे देण्याची संधी यात मिळते.',
            'पोर्टल छायाचित्राची स्पष्टता व प्रकाशमानता तपासते आणि डिव्हाइसने दर्शवलेली GPS अचूकता नोंदवते. या तपासण्या डेटाच्या पुनरावलोकनासाठी मदत करतात; त्या सर्वेक्षण-स्तरीय स्थान, शेताची हद्द किंवा कोणत्याही संस्थेसोबत अधिकृत भागीदारीची हमी देत नाहीत.',
        ],
    },
    kn: {
        languageLabel: 'ಮಾರ್ಗಸೂಚಿಗಳ ಭಾಷೆ',
        tabTitle: 'ಮಾರ್ಗಸೂಚಿಗಳು',
        tabSubtitle: 'ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ',
        sections: [
            '1. ಭೂ ಬಳಕೆ ಮತ್ತು ಭೂ ಆವರಣ ವರ್ಗೀಕರಣ (ಭುವನ್ ಹಂತ-1)',
            '2. ನೆಲಮಟ್ಟದ ಮಾಹಿತಿ ಪಡೆಯಲು ಚಿತ್ರ ತೆಗೆಯುವುದು',
            '3. GPS ನಿಖರತೆಯ ಮಾರ್ಗಸೂಚಿಗಳು',
            '4. ಚಿತ್ರದ ಗುಣಮಟ್ಟದ ಅಗತ್ಯಗಳು',
            '5. ಭೂ-ದೃಷ್ಟಿ ಮತ್ತು ISRO ಕುರಿತು',
        ],
        classHeaders: ['ಸಂಖ್ಯೆ', 'ಭೂ ಆವರಣ ವರ್ಗ', 'ವಿವರಣೆ', 'ಚಿತ್ರ ತೆಗೆಯುವ ಸಲಹೆಗಳು'],
        classes: [
            ['ಕೃಷಿಭೂಮಿ', 'ಬೆಳೆ ಬೆಳೆಯುವ ಹೊಲಗಳು, ತೋಟಗಳು, ಹಣ್ಣಿನ ತೋಟಗಳು ಮತ್ತು ಪಾಳು ಕೃಷಿಭೂಮಿ.', 'ಮಣ್ಣು ಮತ್ತು ಬೆಳೆ ಸಾಲುಗಳು ಅಥವಾ ಸಸ್ಯಗಳು ಸ್ಪಷ್ಟವಾಗಿ ಕಾಣುವಂತೆ ಚಿತ್ರ ತೆಗೆಯಿರಿ.'],
            ['ಅರಣ್ಯ', 'ನೈಸರ್ಗಿಕ ಅಥವಾ ನೆಟ್ಟ ಕಾಡುಗಳು, ದಟ್ಟ ಮರಗಳ ಹೊದಿಕೆ ಮತ್ತು 1 ಮೀಟರ್‌ಗಿಂತ ಎತ್ತರದ ಪೊದೆಗಳು.', 'ನೆಲಮಟ್ಟದಿಂದ ಮರಗಳ ಮೇಲ್ಛಾವಣಿಯನ್ನು ತೋರಿಸಿ; ಅಗತ್ಯವಿದ್ದರೆ ಕ್ಯಾಮೆರಾವನ್ನು ಮೇಲಕ್ಕೆ ತಿರುಗಿಸಿ.'],
            ['ನಗರ / ನಿರ್ಮಿತ ಪ್ರದೇಶ', 'ಕಟ್ಟಡಗಳು, ರಸ್ತೆಗಳು, ಪಕ್ಕಾ ಮೇಲ್ಮೈಗಳು, ನಿರ್ಮಾಣ ಸ್ಥಳಗಳು ಮತ್ತು ಕೈಗಾರಿಕಾ ಪ್ರದೇಶಗಳು.', 'ಕಟ್ಟಡದ ಮುಂಭಾಗ, ಮೇಲ್ಛಾವಣಿ ಅಥವಾ ರಸ್ತೆ ಮೇಲ್ಮೈಯನ್ನು ತೋರಿಸಿ.'],
            ['ಜಲಮೂಲ', 'ನದಿಗಳು, ಸರೋವರಗಳು, ಕೆರೆಗಳು, ಜಲಾಶಯಗಳು, ಕಾಲುವೆಗಳು ಮತ್ತು ನಿಂತ ನೀರಿರುವ ಜೌಗು ಪ್ರದೇಶಗಳು.', 'ಸ್ಥಳದ ಹಿನ್ನೆಲೆಗಾಗಿ ನೀರಿನ ಅಂಚು ಅಥವಾ ದಡವನ್ನು ಸೇರಿಸಿ.'],
            ['ಬಂಜರು / ಪಾಳು ಭೂಮಿ', 'ಮರಳು, ಕಲ್ಲು ಅಥವಾ ಬಯಲು ಮಣ್ಣು, ಉಪ್ಪುಮೈದಾನಗಳು ಮತ್ತು ಸಸ್ಯವಿಲ್ಲದ ಭೂಮಿ.', 'ನೆಲದ ಮೇಲ್ಮೈ ಸ್ಪಷ್ಟವಾಗಿ ಕಾಣುವಂತೆ ಮಾಡಿ; ಹಿನ್ನೆಲೆಗಾಗಿ ದಿಗಂತವನ್ನೂ ಸೇರಿಸಿ.'],
        ],
        captureSteps: [
            ['ತೆರೆದ ಆಕಾಶವಿರುವ ಸ್ಥಳದಲ್ಲಿ ನಿಲ್ಲಿ', 'GPS ಸ್ಥಿರವಾಗಲು 5–10 ಸೆಕೆಂಡು ಕಾಯಿರಿ; 10 ಮೀಟರ್‌ಗಿಂತ ಕಡಿಮೆ ನಿಖರತೆಯನ್ನು ಪಡೆಯಲು ಪ್ರಯತ್ನಿಸಿ.'],
            ['ಕ್ಯಾಮೆರಾವನ್ನು ಭೂ ಆವರಣದ ಕಡೆಗೆ ತಿರುಗಿಸಿ', 'ಫೋನ್ ಅನ್ನು ಎದೆಯ ಎತ್ತರದಲ್ಲಿ ಹಿಡಿದು ಎದುರಿನ ಭೂದೃಶ್ಯವನ್ನು ಚಿತ್ರದಲ್ಲಿ ಸೇರಿಸಿ.'],
            ['2 ಸೆಕೆಂಡು ಸ್ಥಿರವಾಗಿ ಹಿಡಿಯಿರಿ', 'ಚಿತ್ರ ಮಸುಕಾಗದಂತೆ ಕೈಯನ್ನು ಸ್ಥಿರವಾಗಿಡಿ; ಪೋರ್ಟಲ್ ಚಿತ್ರದ ಸ್ಪಷ್ಟತೆಯನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ.'],
            ['ಸರಿಯಾದ LULC ವರ್ಗವನ್ನು ಆಯ್ಕೆಮಾಡಿ', 'ಚಿತ್ರ ಕಾರ್ಡ್‌ಗಳನ್ನು ಬಳಸಿ. ಖಚಿತವಿಲ್ಲದಿದ್ದರೆ, ಕಾಣುವ ಪ್ರದೇಶದ ಅರ್ಧಕ್ಕಿಂತ ಹೆಚ್ಚಿನ ಭಾಗದಲ್ಲಿರುವ ಆವರಣವನ್ನು ಆಯ್ಕೆಮಾಡಿ.'],
            ['ಉಪಯುಕ್ತ ಟಿಪ್ಪಣಿ ಸೇರಿಸಿ', 'ಬೆಳೆಯ ಹೆಸರು (ಉದಾ. ಗೋಧಿ ಅಥವಾ ಭತ್ತ), ನೀರಿನ ಸ್ಥಿತಿ, ಕಟ್ಟಡದ ವಿಧ ಅಥವಾ ಋತುವನ್ನು ತಿಳಿಸಿ.'],
            ['ಸಲ್ಲಿಸಿ ಅಥವಾ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಉಳಿಸಿ', 'ಜಾಲ ಸಂಪರ್ಕವಿದ್ದರೆ ತಕ್ಷಣ ಸಲ್ಲಿಸಿ; ಇಲ್ಲದಿದ್ದರೆ ಸಮೀಕ್ಷೆಯನ್ನು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿ ಉಳಿಸಿ ನಂತರ ಸಿಂಕ್ ಮಾಡಿ.'],
        ],
        gpsHeaders: ['ಮಟ್ಟ', 'ತೋರಿಸಲಾದ ನಿಖರತೆ', 'ಸೂಚಕ', 'ಏನು ಮಾಡಬೇಕು'],
        gpsRows: [
            ['ಉತ್ತಮ', '≤ 10 ಮೀಟರ್', 'ಹಸಿರು', 'ಸಾಧನದ ಉತ್ತಮ ಸ್ಥಳ ನಿರ್ಧಾರ. ಇದು ಹೊಲದ ಉಲ್ಲೇಖ ಮಾತ್ರ; ಸಮೀಕ್ಷೆ ಮಾಡಿದ ಗಡಿ ಅಲ್ಲ.'],
            ['ಸ್ವೀಕಾರಾರ್ಹ', '10–25 ಮೀಟರ್', 'ಹಳದಿ', 'ಬಳಸಬಹುದು; ಉತ್ತಮ GPS ಸ್ಥಳಕ್ಕಾಗಿ ತೆರೆದ ಜಾಗದಲ್ಲಿ ಕಾಯಿರಿ.'],
            ['ಕಡಿಮೆ', '> 25 ಮೀಟರ್', 'ಕೆಂಪು', 'ಪೋರ್ಟಲ್ ಇದನ್ನು ಸ್ವೀಕರಿಸುವುದಿಲ್ಲ. ಕಟ್ಟಡ ಅಥವಾ ಮರಗಳಿಂದ ದೂರ ಹೋಗಿ GPS ಅನ್ನು ಮತ್ತೆ ಪಡೆಯಿರಿ.'],
        ],
        quality: [
            ['ಮಸುಕು ಪರಿಶೀಲನೆ:', 'ಸ್ಪಷ್ಟ ಚಿತ್ರಕ್ಕಾಗಿ ಪೋರ್ಟಲ್‌ನ ಮಿತಿ Laplacian variance ≥ 100. ಫೋನ್ ಅನ್ನು ಸ್ಥಿರವಾಗಿ ಹಿಡಿಯಿರಿ.'],
            ['ಬೆಳಕು:', 'ಸರಾಸರಿ grayscale ಮೌಲ್ಯ 40 ರಿಂದ 220ರ ನಡುವೆ ಇರಬೇಕು. ತುಂಬಾ ಕತ್ತಲೆ ಮತ್ತು ತೀವ್ರ ಹೊಳಪನ್ನು ತಪ್ಪಿಸಿ.'],
            ['ನೈಜ ಹೊಲದ ಚಿತ್ರ ಬಳಸಿ:', 'ಭೂಮಿಯ ಚಿತ್ರವನ್ನು ತೆಗೆಯಿರಿ ಅಥವಾ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ. ಬೆಳೆ ಸಾಲುಗಳು, ಮಣ್ಣು ಅಥವಾ ಭೂ ಆವರಣವನ್ನು ತೋರಿಸಿ; ಜನರು ಮತ್ತು ಸಂಬಂಧವಿಲ್ಲದ ವಸ್ತುಗಳನ್ನು ತಪ್ಪಿಸಿ.'],
            ['ಸ್ಥಳ ಮತ್ತು ಮಿತಿಗಳು:', 'ಪೋರ್ಟಲ್ ಸಾಧನದ GPS ಸ್ಥಳ ಮತ್ತು ಅದು ತೋರಿಸಿದ ನಿಖರತೆಯನ್ನು ದಾಖಲಿಸುತ್ತದೆ. ನೆಲಮಟ್ಟದ ಚಿತ್ರವು ಕಾಣುವ ಭೂ ಆವರಣದ ಸಾಕ್ಷಿ; ಅದರಿಂದ ಮಾತ್ರ ಹೊಲದ ವಿಸ್ತೀರ್ಣ ಅಥವಾ ಗಡಿಯನ್ನು ಲೆಕ್ಕಿಸಲಾಗುವುದಿಲ್ಲ.'],
        ],
        about: [
            'ಭೂ-ದೃಷ್ಟಿ ORBITRON Space Technology Hackathon (PS-24, Domain 6) ಗಾಗಿ ರೂಪಿಸಿದ ನಾಗರಿಕ ವಿಜ್ಞಾನ ಯೋಜನೆ. ನಾಗರಿಕರು, NCC/NSS ಕೆಡೆಟ್‌ಗಳು, ಕೃಷಿ ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಅರಣ್ಯ ಅಧಿಕಾರಿಗಳು ಭೂ ಬಳಕೆ ಮತ್ತು ಭೂ ಆವರಣ (LULC) ಸಂಶೋಧನೆಗಾಗಿ ಪರಿಶೀಲಿಸಬಹುದಾದ ನೆಲಮಟ್ಟದ ವೀಕ್ಷಣೆಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಬಹುದು.',
            'ಪೋರ್ಟಲ್ ಚಿತ್ರದ ಸ್ಪಷ್ಟತೆ ಮತ್ತು ಬೆಳಕನ್ನು ಪರಿಶೀಲಿಸಿ, ಸಾಧನ ತೋರಿಸಿದ GPS ನಿಖರತೆಯನ್ನು ದಾಖಲಿಸುತ್ತದೆ. ಈ ಪರಿಶೀಲನೆಗಳು ಡೇಟಾ ಪರಿಶೀಲನೆಗೆ ನೆರವಾಗುತ್ತವೆ; ಆದರೆ ಸಮೀಕ್ಷಾ-ಮಟ್ಟದ ಸ್ಥಳ, ಹೊಲದ ಗಡಿ ಅಥವಾ ಯಾವುದೇ ಸಂಸ್ಥೆಯ ಅಧಿಕೃತ ಪಾಲುದಾರಿಕೆಯನ್ನು ಖಚಿತಪಡಿಸುವುದಿಲ್ಲ.',
        ],
    },
    as: {
        languageLabel: 'নিৰ্দেশনাৰ ভাষা',
        tabTitle: 'নিৰ্দেশনা',
        tabSubtitle: 'আপোনাৰ ভাষা বাছনি কৰক',
        sections: [
            '1. ভূমি ব্যৱহাৰ আৰু আৱৰণৰ শ্ৰেণীবিভাজন (ভুৱন স্তৰ-1)',
            '2. ভূমিৰ তথ্যৰ বাবে ফটো কেনেকৈ তুলিব',
            '3. GPS সঠিকতাৰ নিৰ্দেশনা',
            '4. ফটোৰ গুণগত মানৰ প্ৰয়োজনীয়তা',
            '5. ভূ-দৃষ্টি আৰু ISRO-ৰ বিষয়ে',
        ],
        classHeaders: ['ক্ৰমিক', 'ভূমি আৱৰণৰ শ্ৰেণী', 'বিৱৰণ', 'ফটো তোলাৰ পৰামৰ্শ'],
        classes: [
            ['কৃষিভূমি', 'খেতি কৰা পথাৰ, বাগিচা, ফলৰ বাগিচা আৰু পৰিত্যক্ত কৃষিভূমি।', 'মাটি আৰু শস্যৰ শাৰী বা গছ-গছনি স্পষ্টকৈ দেখা পোৱাকৈ ফটো তুলিব।'],
            ['বনাঞ্চল', 'প্ৰাকৃতিক বা ৰোপণ কৰা বন, ঘন গছৰ আৱৰণ আৰু 1 মিটাৰতকৈ ওখ জোপোহা।', 'ভূমিৰ পৰা গছৰ ছাঁ দেখুৱাওক; প্ৰয়োজন হ’লে কেমেৰাটো ওপৰলৈ ৰাখক।'],
            ['নগৰীয়া / নিৰ্মিত অঞ্চল', 'ঘৰ-নিৰ্মাণ, পথ, পকী পৃষ্ঠ, নিৰ্মাণস্থলী আৰু ঔদ্যোগিক অঞ্চল।', 'ঘৰৰ সন্মুখভাগ, চাল বা পথৰ পৃষ্ঠ দেখুৱাওক।'],
            ['জলাশয়', 'নদী, হ্ৰদ, পুখুৰী, জলাধাৰ, খাল আৰু স্থিৰ পানী থকা জলভূমি।', 'পৰিপ্ৰেক্ষিতৰ বাবে পানীৰ কাষ বা পাৰটোও ফটোত ৰাখক।'],
            ['অনুৰ্বৰ / পৰিত্যক্ত ভূমি', 'বালিময়, শিলাময় বা উদং মাটি, লৱণাক্ত সমতল আৰু গছ-গছনি নথকা ভূমি।', 'মাটিৰ গঠন স্পষ্টকৈ দেখুৱাওক আৰু পৰিপ্ৰেক্ষিতৰ বাবে দিগন্তও ৰাখক।'],
        ],
        captureSteps: [
            ['মুকলি আকাশ থকা ঠাইত থিয় হওক', 'GPS স্থিৰ হ’বলৈ 5–10 ছেকেণ্ড অপেক্ষা কৰক; 10 মিটাৰতকৈ কম সঠিকতা পাবলৈ চেষ্টা কৰক।'],
            ['কেমেৰাটো ভূমি আৱৰণৰ ফালে ৰাখক', 'ফোনটো বুকুৰ উচ্চতাত ধৰি সন্মুখৰ ভূ-দৃশ্য ফ্ৰেমত ৰাখক।'],
            ['2 ছেকেণ্ড স্থিৰকৈ ধৰক', 'ফটো অস্পষ্ট নহ’বলৈ হাত স্থিৰ ৰাখক; প’ৰ্টেলে ফটোৰ স্পষ্টতা পৰীক্ষা কৰে।'],
            ['সঠিক LULC শ্ৰেণী বাছনি কৰক', 'চিত্ৰ থকা কাৰ্ডসমূহ ব্যৱহাৰ কৰক। নিশ্চিত নহ’লে, দৃশ্যমান অংশৰ আধাতকৈ অধিক ঠাই জুৰি থকা আৱৰণ বাছক।'],
            ['প্ৰয়োজনীয় টোকা যোগ কৰক', 'শস্যৰ নাম (যেনে ঘেঁহু বা ধান), পানীৰ অৱস্থা, ঘৰৰ ধৰণ বা ঋতুৰ তথ্য লিখক।'],
            ['দাখিল কৰক বা অফলাইনত সাঁচি ৰাখক', 'ইণ্টাৰনেট থাকিলে তৎক্ষণাৎ দাখিল কৰক; নাথাকিলে অফলাইনত সাঁচি পিছত ছিংক কৰক।'],
        ],
        gpsHeaders: ['স্তৰ', 'দেখুওৱা সঠিকতা', 'চিহ্ন', 'কি কৰিব'],
        gpsRows: [
            ['উত্তম', '≤ 10 মিটাৰ', 'সেউজীয়া', 'ডিভাইচৰ ভাল স্থান-নিৰ্ধাৰণ। ই পথাৰৰ অৱস্থানৰ উল্লেখ, জৰীপ কৰা সীমা নহয়।'],
            ['গ্ৰহণযোগ্য', '10–25 মিটাৰ', 'হালধীয়া', 'ব্যৱহাৰ কৰিব পাৰি; উন্নত GPS স্থানৰ বাবে মুকলি ঠাইত অপেক্ষা কৰক।'],
            ['দুৰ্বল', '> 25 মিটাৰ', 'ৰঙা', 'প’ৰ্টেলে ইয়াক গ্ৰহণ নকৰে। ঘৰ বা গছৰ পৰা আঁতৰি গৈ GPS পুনৰ লওক।'],
        ],
        quality: [
            ['অস্পষ্টতা পৰীক্ষা:', 'স্পষ্টতাৰ বাবে প’ৰ্টেলৰ সীমা Laplacian variance ≥ 100। ফোনটো স্থিৰকৈ ধৰক।'],
            ['পোহৰ:', 'গড় grayscale মান 40ৰ পৰা 220ৰ ভিতৰত হ’ব লাগে। অতি আন্ধাৰ আৰু তীব্ৰ প্ৰতিফলিত পোহৰ এৰাই চলক।'],
            ['প্ৰকৃত পথাৰৰ ফটো ব্যৱহাৰ কৰক:', 'ভূমিৰ ফটো তুলি বা আপলোড কৰক। শস্যৰ শাৰী, মাটি বা ভূমি আৱৰণ দেখুৱাওক; মানুহ আৰু অসংলগ্ন বস্তু এৰাই চলক।'],
            ['স্থান আৰু সীমাবদ্ধতা:', 'প’ৰ্টেলে ডিভাইচৰ GPS স্থান আৰু দেখুওৱা সঠিকতা সংৰক্ষণ কৰে। ভূমিৰ পৰা তোলা ফটো দৃশ্যমান ভূমি আৱৰণৰ প্ৰমাণ; কেৱল ইয়াৰ পৰা পথাৰৰ মাটিকালি বা সীমা গণনা কৰিব নোৱাৰি।'],
        ],
        about: [
            'ভূ-দৃষ্টি ORBITRON Space Technology Hackathon (PS-24, Domain 6)-ৰ বাবে সৃষ্টি কৰা নাগৰিক-বিজ্ঞান প্ৰকল্প। নাগৰিক, NCC/NSS কেডেট, কৃষি শিক্ষাৰ্থী আৰু বন বিষয়াসকলে ভূমি ব্যৱহাৰ আৰু ভূমি আৱৰণ (LULC) গৱেষণাৰ বাবে পৰীক্ষা কৰিব পৰা ভূমিস্তৰৰ পৰ্যবেক্ষণ আগবঢ়াব পাৰে।',
            'প’ৰ্টেলে ফটোৰ স্পষ্টতা আৰু পোহৰ পৰীক্ষা কৰে আৰু ডিভাইচে দেখুওৱা GPS সঠিকতা সংৰক্ষণ কৰে। এই পৰীক্ষাসমূহে তথ্য পৰ্যালোচনাত সহায় কৰে; কিন্তু জৰীপ-স্তৰৰ স্থান, পথাৰৰ সীমা বা কোনো সংস্থাৰ সৈতে আনুষ্ঠানিক অংশীদাৰিত্বৰ নিশ্চয়তা নিদিয়ে।',
        ],
    },
};

function renderGuidelines(localeCode, preserveOpenSection = false) {
    const locale = GUIDELINE_LOCALES[localeCode] || GUIDELINE_LOCALES.en;
    const container = document.getElementById('guidelines-content');
    const openIndex = preserveOpenSection
        ? Array.from(container.querySelectorAll('.acc-content')).findIndex(content => content.classList.contains('open'))
        : -1;
    const table = (headers, rows, rowClassNames = []) => `
        <div class="table-wrap"><table class="data-table">
            <thead><tr>${headers.map(header => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((row, rowIndex) => `<tr>${row.map((cell, cellIndex) => {
                const statusClass = rowClassNames[rowIndex];
                const prefix = statusClass && cellIndex === 0
                    ? `<span class="status-dot ${statusClass}" aria-hidden="true"></span>`
                    : '';
                return `<td>${prefix}${escapeHtml(cell)}</td>`;
            }).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
    const icons = ['book', 'camera', 'location', 'pulse', 'satellite'];
    const classRows = locale.classes.map((row, index) => [
        String(index + 1),
        row[0],
        row[1],
        row[2],
    ]);
    const stepMarkup = locale.captureSteps.map(step =>
        `<li><strong>${escapeHtml(step[0])}</strong> — ${escapeHtml(step[1])}</li>`
    ).join('');
    const qualityMarkup = locale.quality.map(item =>
        `<li><strong>${escapeHtml(item[0])}</strong> ${escapeHtml(item[1])}</li>`
    ).join('');
    const aboutMarkup = locale.about.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('');

    container.innerHTML = `<div class="accordion">
        <section class="acc-item">
            <h2><button class="acc-btn" type="button" aria-expanded="false" onclick="toggleAccordion(this)">${iconMarkup(icons[0])} ${escapeHtml(locale.sections[0])}</button></h2>
            <div class="acc-content">${table(locale.classHeaders, classRows)}</div>
        </section>
        <section class="acc-item">
            <h2><button class="acc-btn" type="button" aria-expanded="false" onclick="toggleAccordion(this)">${iconMarkup(icons[1])} ${escapeHtml(locale.sections[1])}</button></h2>
            <div class="acc-content"><ol>${stepMarkup}</ol></div>
        </section>
        <section class="acc-item">
            <h2><button class="acc-btn" type="button" aria-expanded="false" onclick="toggleAccordion(this)">${iconMarkup(icons[2])} ${escapeHtml(locale.sections[2])}</button></h2>
            <div class="acc-content">${table(locale.gpsHeaders, locale.gpsRows, ['optimal', 'acceptable', 'poor'])}</div>
        </section>
        <section class="acc-item">
            <h2><button class="acc-btn" type="button" aria-expanded="false" onclick="toggleAccordion(this)">${iconMarkup(icons[3])} ${escapeHtml(locale.sections[3])}</button></h2>
            <div class="acc-content"><ul>${qualityMarkup}</ul></div>
        </section>
        <section class="acc-item">
            <h2><button class="acc-btn" type="button" aria-expanded="false" onclick="toggleAccordion(this)">${iconMarkup(icons[4])} ${escapeHtml(locale.sections[4])}</button></h2>
            <div class="acc-content">${aboutMarkup}</div>
        </section>
    </div>`;

    document.getElementById('guidelines-language-label').textContent = locale.languageLabel;
    document.getElementById('guidelines-tab-label').textContent = locale.tabTitle;
    document.getElementById('guidelines-tab-subtitle').textContent = locale.tabSubtitle;
    document.documentElement.lang = localeCode;

    if (openIndex >= 0) {
        const button = container.querySelectorAll('.acc-btn')[openIndex];
        if (button) toggleAccordion(button);
    }
}

function toggleAccordion(btn) {
    const content = btn.closest('.acc-item').querySelector('.acc-content');
    const isOpen = content.classList.contains('open');

    // Close all
    document.querySelectorAll('#guidelines-content .acc-content').forEach(c => c.classList.remove('open'));
    document.querySelectorAll('#guidelines-content .acc-btn').forEach(b => {
        b.classList.remove('open');
        b.setAttribute('aria-expanded', 'false');
    });

    if (!isOpen) {
        content.classList.add('open');
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
    }
}

// ══════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ══════════════════════════════════════════

function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.remove(); }, 4000);
}

// ══════════════════════════════════════════
//  ONLINE/OFFLINE STATUS
// ══════════════════════════════════════════

function updateOnlineStatus() {
    const pill = document.getElementById('sync-status');
    if (navigator.onLine) {
        pill.innerHTML = `${iconMarkup('check-circle')} Online`;
        pill.className = 'status-pill online';
    } else {
        pill.innerHTML = `${iconMarkup('cloud')} Offline`;
        pill.className = 'status-pill';
    }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

function applyColorTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    const colorMeta = document.getElementById('browser-theme-color');
    const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    document.querySelectorAll('.theme-toggle').forEach(toggle => {
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
    });
    if (colorMeta) colorMeta.setAttribute('content', isDark ? '#0D1117' : '#F2F2F7');
}

function toggleColorTheme() {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyColorTheme(nextTheme);
    localStorage.setItem('dp_color_theme', nextTheme);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    applyColorTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    updateOnlineStatus();
    const cached = JSON.parse(localStorage.getItem('dp_offline_queue') || '[]');
    document.getElementById('cache-status').innerHTML = `${iconMarkup('database')} Cached: ${cached.length}`;
    const languageSelect = document.getElementById('guidelines-language-select');
    const savedLanguage = localStorage.getItem('dp_guidelines_language');
    if (Object.prototype.hasOwnProperty.call(GUIDELINE_LOCALES, savedLanguage)) {
        languageSelect.value = savedLanguage;
    }
    renderGuidelines(languageSelect.value);
    languageSelect.addEventListener('change', () => {
        renderGuidelines(languageSelect.value, true);
        localStorage.setItem('dp_guidelines_language', languageSelect.value);
    });
});
