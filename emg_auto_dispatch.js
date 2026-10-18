const roleNames = Object.freeze({
  user: 'User',
  technician: 'Technician',
  admin: 'Admin'
});

const roleDescriptions = Object.freeze({
  user: 'Your customer account is ready to request and keep track of emergency auto help.',
  technician: 'Your technician account is signed in and ready for your service workspace.',
  admin: 'Your administrator account is signed in and ready for the administration workspace.'
});

const selectedRole = new URLSearchParams(window.location.search).get('role');
const roleLinks = document.querySelectorAll('.role-btn');
const authPanel = document.getElementById('authPanel');
const rolePrompt = document.getElementById('rolePrompt');
const roleLabel = document.getElementById('roleLabel');
const authHeading = document.getElementById('authHeading');
const authSubtitle = document.getElementById('authSubtitle');
const authForm = document.getElementById('authForm');
const statusMessage = document.getElementById('statusMessage');
const submitButton = document.getElementById('submitButton');
const loginTab = document.getElementById('loginTab');
const signupTab = document.getElementById('signupTab');
const adminNote = document.getElementById('adminNote');
const passwordInput = document.getElementById('password');
const confirmPasswordField = document.getElementById('confirmPasswordField');
const confirmPasswordInput = document.getElementById('confirmPassword');
const dashboardPanel = document.getElementById('dashboardPanel');
const dashboardRole = document.getElementById('dashboardRole');
const dashboardHeading = document.getElementById('dashboardHeading');
const dashboardSubtitle = document.getElementById('dashboardSubtitle');
const dashboardUsername = document.getElementById('dashboardUsername');
const dashboardRoleName = document.getElementById('dashboardRoleName');
const dashboardStatus = document.getElementById('dashboardStatus');
const signOutButton = document.getElementById('signOutButton');
const technicianLocationPanel = document.getElementById('technicianLocationPanel');
const startLocationSharingButton = document.getElementById('startLocationSharingButton');
const technicianLocationStatus = document.getElementById('technicianLocationStatus');
const technicianMapStatus = document.getElementById('technicianMapStatus');
const technicianMapElement = document.getElementById('technicianMap');
const technicianProfilePanel = document.getElementById('technicianProfilePanel');
const technicianAvailabilityBadge = document.getElementById('technicianAvailabilityBadge');
const technicianOnlineBadge = document.getElementById('technicianOnlineBadge');
const technicianProfileForm = document.getElementById('technicianProfileForm');
const technicianProfileImage = document.getElementById('technicianProfileImage');
const technicianProfilePreview = document.getElementById('technicianProfilePreview');
const technicianProfileInitials = document.getElementById('technicianProfileInitials');
const technicianPhoneInput = document.getElementById('technicianPhone');
const technicianServiceAreaInput = document.getElementById('technicianServiceArea');
const technicianSkillCategoryInput = document.getElementById('technicianSkillCategory');
const technicianServiceRateInput = document.getElementById('technicianServiceRate');
const technicianIsAvailableInput = document.getElementById('technicianIsAvailable');
const technicianSkillsInput = document.getElementById('technicianSkills');
const technicianAchievementsInput = document.getElementById('technicianAchievements');
const technicianEducationInput = document.getElementById('technicianEducation');
const saveTechnicianProfileButton = document.getElementById('saveTechnicianProfileButton');
const technicianProfileStatus = document.getElementById('technicianProfileStatus');
const technicianJobsPanel = document.getElementById('technicianJobsPanel');
const technicianJobsStatus = document.getElementById('technicianJobsStatus');
const technicianJobsList = document.getElementById('technicianJobsList');
const refreshTechnicianJobsButton = document.getElementById('refreshTechnicianJobsButton');
const userServicesPanel = document.getElementById('userServicesPanel');
const userServicesWelcome = document.getElementById('userServicesWelcome');
const userServiceSearch = document.getElementById('userServiceSearch');
const userServiceCategory = document.getElementById('userServiceCategory');
const userServicesStatus = document.getElementById('userServicesStatus');
const userServiceGrid = document.getElementById('userServiceGrid');
const userRequestForm = document.getElementById('userRequestForm');
const requestServiceId = document.getElementById('requestServiceId');
const requestServiceName = document.getElementById('requestServiceName');
const requestSubmitButton = document.getElementById('requestSubmitButton');
const userRequestStatus = document.getElementById('userRequestStatus');
const userSignOutButton = document.getElementById('userSignOutButton');
const cancelRequestButton = document.getElementById('cancelRequestButton');
const captureCustomerLocationButton = document.getElementById('captureCustomerLocationButton');
const customerLocationStatus = document.getElementById('customerLocationStatus');
const customerTrackingStatus = document.getElementById('customerTrackingStatus');
const customerJobsList = document.getElementById('customerJobsList');
const customerMapElement = document.getElementById('customerMap');
const refreshCustomerJobsButton = document.getElementById('refreshCustomerJobsButton');
const adminDashboard = document.getElementById('adminDashboard');
const adminWelcome = document.getElementById('adminWelcome');
const adminSignOutButton = document.getElementById('adminSignOutButton');
const servicesTab = document.getElementById('servicesTab');
const techniciansTab = document.getElementById('techniciansTab');
const jobsTab = document.getElementById('jobsTab');
const servicesSection = document.getElementById('servicesSection');
const techniciansSection = document.getElementById('techniciansSection');
const jobsSection = document.getElementById('jobsSection');
const serviceForm = document.getElementById('serviceForm');
const serviceIdInput = document.getElementById('serviceId');
const serviceNameInput = document.getElementById('serviceName');
const serviceCategoryInput = document.getElementById('serviceCategory');
const serviceDescriptionInput = document.getElementById('serviceDescription');
const serviceImageInput = document.getElementById('serviceImage');
const serviceImagePreview = document.getElementById('serviceImagePreview');
const serviceActiveInput = document.getElementById('serviceActive');
const serviceSubmitButton = document.getElementById('serviceSubmitButton');
const cancelServiceEditButton = document.getElementById('cancelServiceEditButton');
const serviceStatus = document.getElementById('serviceStatus');
const serviceGrid = document.getElementById('serviceGrid');
const jobsStatus = document.getElementById('jobsStatus');
const jobsList = document.getElementById('jobsList');
const refreshJobsButton = document.getElementById('refreshJobsButton');
const techniciansStatus = document.getElementById('techniciansStatus');
const techniciansList = document.getElementById('techniciansList');
const refreshTechniciansButton = document.getElementById('refreshTechniciansButton');
const adminMapStatus = document.getElementById('adminMapStatus');
const adminMapElement = document.getElementById('adminMap');
let isSigningUp = false;
const hasSelectedRole = typeof selectedRole === 'string' && Object.hasOwn(roleNames, selectedRole);
const reconnectDelays = [1000, 2000, 4000, 8000];
const jobStatuses = Object.freeze({
  requested: 'Requested',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
});
let services = [];
let userServices = [];
let jobs = [];
let technicians = [];
let customerJobs = [];
let customerCoordinates = null;
let currentImageUrl = '';
let previewObjectUrl = '';
let customerRefreshTimer = null;
let adminRefreshTimer = null;
let technicianRefreshTimer = null;
let technicianProfile = null;
let technicianPreviewObjectUrl = '';
let technicianJobEditPending = false;
let adminJobEditsPending = false;
let technicianWatchId = null;
let technicianLocationTimer = null;
let lastTechnicianLocationSentAt = null;
let latestTechnicianPosition = null;
let sendingTechnicianLocation = false;
let googleMapsPromise = null;
const googleMaps = new Map();

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function clearLocationRefreshTimers() {
  if (customerRefreshTimer !== null) window.clearInterval(customerRefreshTimer);
  if (adminRefreshTimer !== null) window.clearInterval(adminRefreshTimer);
  if (technicianRefreshTimer !== null) window.clearInterval(technicianRefreshTimer);
  customerRefreshTimer = null;
  adminRefreshTimer = null;
  technicianRefreshTimer = null;
}

async function fetchWithRetry(url, options = {}, retryOptions = {}) {
  const {
    maxAttempts = 5,
    retryStatusCodes = [408, 429, 500, 502, 503, 504],
    onRetry = null
  } = retryOptions;

  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      const response = await fetch(url, options);
      if (response.ok || !retryStatusCodes.includes(response.status)) {
        return response;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      const delay = reconnectDelays[Math.min(attempt, reconnectDelays.length - 1)];
      if (typeof onRetry === 'function') {
        onRetry({ attempt: attempt + 1, delay, error });
      }
      await wait(delay);
      attempt += 1;
    }
  }

  throw new Error('Request retry limit reached.');
}

function setAuthMode(signingUp) {
  if (signingUp && selectedRole === 'admin') return;
  isSigningUp = signingUp;
  loginTab.classList.toggle('active', !signingUp);
  signupTab.classList.toggle('active', signingUp);
  loginTab.setAttribute('aria-selected', String(!signingUp));
  signupTab.setAttribute('aria-selected', String(signingUp));
  authHeading.textContent = signingUp ? 'Create your account' : 'Sign in';
  authSubtitle.textContent = signingUp
    ? 'Create an account for this service role.'
    : 'Use your account credentials to continue.';
  submitButton.textContent = signingUp ? 'Create account' : 'Sign in';
  passwordInput.autocomplete = signingUp ? 'new-password' : 'current-password';
  passwordInput.minLength = signingUp ? 8 : 1;
  confirmPasswordField.hidden = !signingUp;
  confirmPasswordInput.required = signingUp;
  statusMessage.textContent = '';
  statusMessage.classList.remove('success');
}

function showAuthPanel(message = '') {
  clearLocationRefreshTimers();
  rolePrompt.hidden = true;
  dashboardPanel.hidden = true;
  userServicesPanel.hidden = true;
  adminDashboard.hidden = true;
  authPanel.hidden = false;
  statusMessage.textContent = message;
  statusMessage.classList.remove('success');
}

function showDashboard(user) {
  clearLocationRefreshTimers();
  rolePrompt.hidden = true;
  authPanel.hidden = true;
  userServicesPanel.hidden = user.role !== 'user';
  adminDashboard.hidden = user.role !== 'admin';
  dashboardPanel.hidden = user.role === 'admin' || user.role === 'user';
  technicianLocationPanel.hidden = user.role !== 'technician';
  technicianProfilePanel.hidden = user.role !== 'technician';
  technicianJobsPanel.hidden = user.role !== 'technician';
  if (user.role === 'admin') {
    adminWelcome.textContent = `Signed in as ${user.username}`;
    loadAdminWorkspace();
    adminRefreshTimer = window.setInterval(loadAdminLocationData, 5000);
    return;
  }
  if (user.role === 'user') {
    userServicesWelcome.textContent = `Welcome, ${user.username}. Browse by category and request the help you need.`;
    loadUserServices();
    loadUserJobs();
    customerRefreshTimer = window.setInterval(loadUserJobs, 5000);
    return;
  }
  dashboardRole.textContent = `${roleNames[user.role].toUpperCase()} WORKSPACE`;
  dashboardHeading.textContent = `Welcome, ${user.username}`;
  dashboardSubtitle.textContent = roleDescriptions[user.role];
  dashboardUsername.textContent = user.username;
  dashboardRoleName.textContent = roleNames[user.role];
  dashboardStatus.textContent = '';
  technicianLocationStatus.textContent = 'Location sharing is off.';
  startLocationSharingButton.textContent = 'Start sharing location';
  loadTechnicianWorkspace();
  technicianRefreshTimer = window.setInterval(() => {
    if (!technicianJobEditPending) loadTechnicianJobs();
  }, 10000);
}

async function adminRequest(url, options = {}) {
  const response = await fetch(url, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an invalid response. Check that the latest server is running.');
  }
  if (!response.ok) {
    throw new Error(data?.message || 'The request could not be completed.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('The server returned an invalid response.');
  }
  return data;
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

async function loadGoogleMapsApi() {
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = (async () => {
    const response = await fetch('/api/maps-config');
    const config = await response.json();
    if (!response.ok) throw new Error(config.message || 'Could not load Google Maps configuration.');
    if (!config.apiKey) {
      throw new Error('Google Maps is not configured. Add GOOGLE_MAPS_API_KEY to .env and restart the server.');
    }
    await new Promise((resolve, reject) => {
      window.emergencyMapsReady = resolve;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.apiKey)}&loading=async&callback=emergencyMapsReady`;
      script.async = true;
      script.onerror = () => reject(new Error('Google Maps could not be loaded. Check the API key and Maps JavaScript API settings.'));
      document.head.append(script);
    });
    return window.google;
  })();
  return googleMapsPromise;
}

async function renderLocationMap(element, mapId, statusElement, places, emptyMessage) {
  try {
    const mapsApi = await loadGoogleMapsApi();
    let mapState = googleMaps.get(mapId);
    if (!mapState) {
      const map = new mapsApi.maps.Map(element, {
        center: { lat: 20.5937, lng: 78.9629 },
        zoom: 5,
        mapTypeControl: false,
        streetViewControl: false
      });
      mapState = { map, markers: new Map() };
      googleMaps.set(mapId, mapState);
    }

    const visiblePlaces = places.filter(place => place.latitude !== null
      && place.latitude !== undefined
      && place.longitude !== null
      && place.longitude !== undefined
      && Number.isFinite(Number(place.latitude))
      && Number.isFinite(Number(place.longitude)));
    const nextMarkerIds = new Set(visiblePlaces.map(place => place.id));
    mapState.markers.forEach((marker, markerId) => {
      if (!nextMarkerIds.has(markerId)) {
        marker.setMap(null);
        mapState.markers.delete(markerId);
      }
    });

    const bounds = new mapsApi.maps.LatLngBounds();
    visiblePlaces.forEach(place => {
      const position = { lat: Number(place.latitude), lng: Number(place.longitude) };
      let marker = mapState.markers.get(place.id);
      if (!marker) {
        marker = new mapsApi.maps.Marker({
          map: mapState.map,
          position,
          title: place.title,
          label: { text: place.label, color: '#fff', fontWeight: '700' },
          icon: {
            path: mapsApi.maps.SymbolPath.CIRCLE,
            fillColor: place.type === 'technician' ? '#16786f' : '#3157b7',
            fillOpacity: 1,
            scale: 10,
            strokeColor: '#fff',
            strokeWeight: 2
          }
        });
        mapState.markers.set(place.id, marker);
      } else {
        marker.setPosition(position);
        marker.setTitle(place.title);
      }
      bounds.extend(position);
    });

    if (visiblePlaces.length > 0) {
      const currentBounds = mapState.map.getBounds();
      const hasOutsideMarker = visiblePlaces.some(place => !currentBounds
        || !currentBounds.contains({ lat: Number(place.latitude), lng: Number(place.longitude) }));
      if (hasOutsideMarker) {
        mapState.map.fitBounds(bounds, 48);
        if (visiblePlaces.length === 1) {
          mapsApi.maps.event.addListenerOnce(mapState.map, 'idle', () => {
            if (mapState.map.getZoom() > 15) mapState.map.setZoom(15);
          });
        }
      }
    }
    statusElement.textContent = visiblePlaces.length ? '' : emptyMessage;
    statusElement.classList.toggle('success', visiblePlaces.length === 0);
  } catch (error) {
    statusElement.textContent = error.message || 'Could not load the map.';
    statusElement.classList.remove('success');
  }
}

async function userRequest(url, options = {}) {
  const response = await fetch(url, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an invalid response. Check that the latest server is running.');
  }
  if (!response.ok) {
    throw new Error(data?.message || 'The request could not be completed.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('The server returned an invalid response.');
  }
  return data;
}

function updateTechnicianPresence(profile) {
  technicianAvailabilityBadge.textContent = profile.isAvailable ? 'Available' : 'Unavailable';
  technicianAvailabilityBadge.classList.toggle('available', profile.isAvailable);
  technicianAvailabilityBadge.classList.toggle('unavailable', !profile.isAvailable);
  technicianOnlineBadge.textContent = profile.locationOnline ? 'Online · GPS fresh' : 'Offline';
  technicianOnlineBadge.classList.toggle('online', profile.locationOnline);
  technicianOnlineBadge.classList.toggle('offline', !profile.locationOnline);
}

function renderTechnicianProfile(profile, categories) {
  technicianProfile = profile;
  technicianPhoneInput.value = profile.phone || '';
  technicianServiceAreaInput.value = profile.serviceArea || '';
  technicianServiceRateInput.value = profile.serviceRate ?? '';
  technicianIsAvailableInput.checked = profile.isAvailable;
  technicianSkillsInput.value = profile.skills || '';
  technicianAchievementsInput.value = profile.achievements || '';
  technicianEducationInput.value = profile.education || '';
  technicianSkillCategoryInput.replaceChildren();
  const chooseOption = createTextElement('option', '', 'Choose your main category');
  chooseOption.value = '';
  technicianSkillCategoryInput.append(chooseOption);
  categories.forEach(category => {
    const option = createTextElement('option', '', category);
    option.value = category;
    option.selected = category.toLowerCase() === (profile.skillCategory || '').toLowerCase();
    technicianSkillCategoryInput.append(option);
  });
  if (profile.skillCategory && !categories.some(category => category.toLowerCase() === profile.skillCategory.toLowerCase())) {
    const inactiveOption = createTextElement('option', '', `${profile.skillCategory} (inactive category)`);
    inactiveOption.value = profile.skillCategory;
    inactiveOption.selected = true;
    technicianSkillCategoryInput.append(inactiveOption);
  }
  const validImageUrl = typeof profile.profileImageUrl === 'string'
    && /^\/uploads\/[a-f0-9]{32}\.(?:jpg|png|webp)$/.test(profile.profileImageUrl);
  technicianProfilePreview.hidden = !validImageUrl;
  technicianProfileInitials.hidden = validImageUrl;
  if (validImageUrl) technicianProfilePreview.src = profile.profileImageUrl;
  technicianProfileInitials.textContent = (profile.username || 'T').slice(0, 1).toUpperCase();
  updateTechnicianPresence(profile);
  technicianProfileStatus.textContent = profile.profileComplete
    ? 'Your profile is ready for dispatch when you are available and sharing a fresh GPS location.'
    : 'Complete your required photo, phone, service area, rate and category to become eligible for automatic dispatch.';
  technicianProfileStatus.classList.toggle('success', profile.profileComplete);
}

async function loadTechnicianProfile() {
  const data = await userRequest('/api/technician/profile');
  if (!data.profile || !Array.isArray(data.categories)) {
    throw new Error('The server response did not include your technician profile.');
  }
  renderTechnicianProfile(data.profile, data.categories);
}

async function loadTechnicianJobs() {
  technicianJobsStatus.textContent = 'Loading assigned jobs...';
  technicianJobsStatus.classList.remove('success');
  try {
    const data = await userRequest('/api/technician/jobs');
    if (!Array.isArray(data.jobs)) {
      throw new Error('The server response did not include your assigned jobs.');
    }
    technicianJobsList.replaceChildren();
    if (data.jobs.length === 0) {
      technicianJobsList.append(createTextElement(
        'p',
        'empty-state',
        'No jobs are assigned to you right now. Your assigned work will appear here.'
      ));
      technicianJobsStatus.textContent = '';
      return;
    }
    data.jobs.forEach(job => {
      const card = createTextElement('article', 'job-card technician-job-card', '');
      const heading = createTextElement('div', 'job-heading', '');
      heading.append(
        createTextElement('h3', '', `Job #${job.id} · ${job.serviceName}`),
        createTextElement('span', `job-state-badge ${job.status}`, jobStatuses[job.status] || job.status)
      );
      const details = createTextElement('div', 'technician-job-details', '');
      details.append(
        createTextElement('p', '', `Customer: ${job.customerName}`),
        createTextElement('p', '', `Phone: ${job.customerPhone}`),
        createTextElement('p', '', `Address: ${job.address}`),
        createTextElement('p', '', job.details || 'No additional customer notes.')
      );
      card.append(heading, details);
      if (job.status === 'assigned') {
        const readyButton = createTextElement('button', 'submit-btn', 'Ready to work');
        readyButton.type = 'button';
        readyButton.addEventListener('click', () => updateTechnicianJob(job, 'in_progress', '', readyButton));
        card.append(readyButton);
      } else {
        const reportLabel = createTextElement('label', '', 'Work completion update for admin');
        const reportInput = document.createElement('textarea');
        reportInput.rows = 3;
        reportInput.minLength = 5;
        reportInput.maxLength = 2000;
        reportInput.required = true;
        reportInput.placeholder = 'Describe the work completed and any follow-up needed.';
        reportInput.setAttribute('aria-label', `Completion update for job ${job.id}`);
        reportInput.addEventListener('input', () => {
          technicianJobEditPending = true;
        });
        reportLabel.append(reportInput);
        const completeButton = createTextElement('button', 'submit-btn', 'Send completion update');
        completeButton.type = 'button';
        completeButton.addEventListener('click', () => {
          if (reportInput.value.trim().length < 5) {
            technicianJobsStatus.textContent = 'Write at least 5 characters describing the completed work.';
            technicianJobsStatus.classList.remove('success');
            reportInput.focus();
            return;
          }
          updateTechnicianJob(job, 'completed', reportInput.value, completeButton);
        });
        card.append(reportLabel, completeButton);
      }
      technicianJobsList.append(card);
    });
    technicianJobsStatus.textContent = '';
  } catch (error) {
    technicianJobsStatus.textContent = error.message || 'Could not load your assigned jobs.';
  }
}

async function updateTechnicianJob(job, status, completionReport, button) {
  button.disabled = true;
  technicianJobsStatus.textContent = '';
  technicianJobsStatus.classList.remove('success');
  try {
    const data = await userRequest(`/api/technician/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, completionReport })
    });
    technicianJobEditPending = false;
    await loadTechnicianJobs();
    technicianJobsStatus.textContent = data.message || 'Your work update was sent.';
    technicianJobsStatus.classList.add('success');
  } catch (error) {
    technicianJobsStatus.textContent = error.message || 'Could not update this job.';
  } finally {
    button.disabled = false;
  }
}

async function loadTechnicianWorkspace() {
  technicianProfileStatus.textContent = 'Loading your profile...';
  technicianJobsStatus.textContent = 'Loading assigned jobs...';
  const results = await Promise.allSettled([loadTechnicianProfile(), loadTechnicianJobs()]);
  const profileError = results[0].status === 'rejected' ? results[0].reason : null;
  if (profileError) {
    technicianProfileStatus.textContent = profileError.message || 'Could not load your profile.';
    technicianProfileStatus.classList.remove('success');
  }
}

technicianProfileImage.addEventListener('change', () => {
  if (technicianPreviewObjectUrl) URL.revokeObjectURL(technicianPreviewObjectUrl);
  technicianPreviewObjectUrl = '';
  const file = technicianProfileImage.files[0];
  if (!file) {
    const validImageUrl = typeof technicianProfile?.profileImageUrl === 'string'
      && /^\/uploads\/[a-f0-9]{32}\.(?:jpg|png|webp)$/.test(technicianProfile.profileImageUrl);
    technicianProfilePreview.hidden = !validImageUrl;
    technicianProfileInitials.hidden = technicianProfilePreview.hidden;
    if (validImageUrl) technicianProfilePreview.src = technicianProfile.profileImageUrl;
    return;
  }
  technicianPreviewObjectUrl = URL.createObjectURL(file);
  technicianProfilePreview.src = technicianPreviewObjectUrl;
  technicianProfilePreview.hidden = false;
  technicianProfileInitials.hidden = true;
});

technicianProfileForm.addEventListener('submit', async event => {
  event.preventDefault();
  technicianProfileStatus.textContent = '';
  technicianProfileStatus.classList.remove('success');
  saveTechnicianProfileButton.disabled = true;
  try {
    const data = await userRequest('/api/technician/profile', {
      method: 'PUT',
      body: new FormData(technicianProfileForm)
    });
    technicianProfileImage.value = '';
    if (technicianPreviewObjectUrl) URL.revokeObjectURL(technicianPreviewObjectUrl);
    technicianPreviewObjectUrl = '';
    await loadTechnicianProfile();
    technicianProfileStatus.textContent = data.message || 'Your technician profile has been saved.';
    technicianProfileStatus.classList.add('success');
  } catch (error) {
    technicianProfileStatus.textContent = error.message || 'Could not save your profile.';
  } finally {
    saveTechnicianProfileButton.disabled = false;
  }
});

refreshTechnicianJobsButton.addEventListener('click', () => {
  technicianJobEditPending = false;
  loadTechnicianJobs();
});

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser does not support location sharing.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000
    });
  });
}

function describeGeolocationError(error) {
  if (error.code === 1) return 'Location permission was denied. Allow location access in your browser settings and try again.';
  if (error.code === 2) return 'Your current location could not be determined. Try again in a moment.';
  if (error.code === 3) return 'Finding your location timed out. Try again.';
  return error.message || 'Could not access your current location.';
}

function formatRupeesFromPaise(amountPaise) {
  const value = Number(amountPaise);
  return Number.isSafeInteger(value) && value >= 0 ? `₹${(value / 100).toFixed(2)}` : null;
}

async function startRazorpayPayment(job, button) {
  button.disabled = true;
  customerTrackingStatus.textContent = 'Preparing secure payment...';
  customerTrackingStatus.classList.remove('success');
  try {
    if (typeof window.Razorpay !== 'function') {
      throw new Error('Razorpay Checkout did not load. Check your internet connection and try again.');
    }
    const order = await userRequest(`/api/jobs/${job.id}/payment/order`, { method: 'POST' });
    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'Emergency Auto Dispatch',
      description: `${order.serviceName} · Job #${job.id}`,
      order_id: order.orderId,
      prefill: { contact: order.customerPhone },
      theme: { color: '#156b68' },
      handler: async payment => {
        try {
          const result = await userRequest(`/api/jobs/${job.id}/payment/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: payment.razorpay_order_id,
              paymentId: payment.razorpay_payment_id,
              signature: payment.razorpay_signature
            })
          });
          await loadUserJobs();
          customerTrackingStatus.textContent = result.message || 'Payment received. Thank you.';
          customerTrackingStatus.classList.add('success');
        } catch (error) {
          customerTrackingStatus.textContent = error.message || 'Payment could not be verified. Refresh your requests before trying again.';
          customerTrackingStatus.classList.remove('success');
        } finally {
          button.disabled = false;
        }
      },
      modal: {
        ondismiss: () => {
          button.disabled = false;
          customerTrackingStatus.textContent = 'Payment was not completed. You can try again from this request.';
          customerTrackingStatus.classList.remove('success');
        }
      }
    });
    checkout.on('payment.failed', event => {
      button.disabled = false;
      customerTrackingStatus.textContent = event.error?.description || 'Payment failed. You can try again.';
      customerTrackingStatus.classList.remove('success');
    });
    checkout.open();
  } catch (error) {
    button.disabled = false;
    customerTrackingStatus.textContent = error.message || 'Could not start this payment.';
    customerTrackingStatus.classList.remove('success');
  }
}

function renderCustomerJobs() {
  customerJobsList.replaceChildren();
  const activeJobs = customerJobs.filter(job => !['completed', 'cancelled'].includes(job.status));
  const mapPlaces = [];
  activeJobs.forEach(job => {
    if (job.customerLatitude !== null && job.customerLatitude !== undefined) {
      mapPlaces.push({
        id: `customer-${job.id}`,
        type: 'customer',
        label: 'C',
        title: `Your location · Job #${job.id}`,
        latitude: job.customerLatitude,
        longitude: job.customerLongitude
      });
    }
    if (job.technicianLatitude !== null && job.technicianLatitude !== undefined) {
      mapPlaces.push({
        id: `technician-${job.id}`,
        type: 'technician',
        label: 'T',
        title: `${job.technicianName || 'Assigned technician'} · Job #${job.id}`,
        latitude: job.technicianLatitude,
        longitude: job.technicianLongitude
      });
    }
  });

  if (customerJobs.length === 0) {
    customerJobsList.append(createTextElement('p', 'empty-state', 'Your service requests will appear here.'));
  } else {
    customerJobs.forEach(job => {
      const card = createTextElement('article', 'tracking-job-card', '');
      card.append(createTextElement('strong', '', `Job #${job.id} · ${job.serviceName}`));
      card.append(createTextElement('p', '', `Status: ${jobStatuses[job.status] || job.status}`));
      card.append(createTextElement(
        'p',
        '',
        job.technicianName
          ? `Technician: ${job.technicianName}${job.technicianLatitude !== null && job.technicianLatitude !== undefined ? ' · sharing live location' : ' · location not currently shared'}`
          : 'A technician has not been assigned yet.'
      ));
      if (job.status === 'completed') {
        if (job.paymentStatus === 'paid') {
          card.append(createTextElement('p', 'payment-confirmed', 'Payment received.'));
        } else {
          const amountPaise = Number(job.paymentAmountPaise);
          const amount = Number.isSafeInteger(amountPaise) && amountPaise >= 100
            ? formatRupeesFromPaise(amountPaise)
            : null;
          card.append(createTextElement(
            'p',
            '',
            amount
              ? `Payment due (technician starting rate): ${amount}`
              : 'Online payment needs a technician starting rate of at least ₹1.00.'
          ));
          if (amount) {
            const payButton = createTextElement('button', 'submit-btn', `Pay ${amount} with Razorpay`);
            payButton.type = 'button';
            payButton.addEventListener('click', () => startRazorpayPayment(job, payButton));
            card.append(payButton);
          }
        }
      }
      customerJobsList.append(card);
    });
  }
  renderLocationMap(
    customerMapElement,
    'customer',
    customerTrackingStatus,
    mapPlaces,
    'No active request locations to show yet. Share your location when requesting a service.'
  );
}

async function loadUserJobs() {
  try {
    const data = await userRequest('/api/jobs');
    if (!Array.isArray(data.jobs)) {
      throw new Error('The server response did not include your requests list.');
    }
    customerJobs = data.jobs;
    renderCustomerJobs();
  } catch (error) {
    customerTrackingStatus.textContent = error.message || 'Could not load your service tracking details.';
    customerTrackingStatus.classList.remove('success');
  }
}

function renderTechnicianMap(position) {
  const places = position ? [{
    id: 'technician-self',
    type: 'technician',
    label: 'T',
    title: 'Your current location',
    latitude: position.latitude,
    longitude: position.longitude
  }] : [];
  renderLocationMap(
    technicianMapElement,
    'technician',
    technicianMapStatus,
    places,
    'Start sharing to preview your current location.'
  );
}

async function sendTechnicianLocation() {
  if (!latestTechnicianPosition || sendingTechnicianLocation) return;
  sendingTechnicianLocation = true;
  try {
    const data = await userRequest('/api/technician/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(latestTechnicianPosition)
    });
    lastTechnicianLocationSentAt = Date.now();
    technicianLocationStatus.textContent = data.message || 'Your location is being shared with dispatch.';
    technicianOnlineBadge.textContent = 'Online · GPS fresh';
    technicianOnlineBadge.classList.add('online');
    technicianOnlineBadge.classList.remove('offline');
  } catch (error) {
    technicianLocationStatus.textContent = error.message || 'Could not update your location.';
  } finally {
    sendingTechnicianLocation = false;
  }
}

async function stopTechnicianLocation(notifyServer = true) {
  if (technicianWatchId !== null) navigator.geolocation.clearWatch(technicianWatchId);
  if (technicianLocationTimer !== null) window.clearInterval(technicianLocationTimer);
  technicianWatchId = null;
  technicianLocationTimer = null;
  lastTechnicianLocationSentAt = null;
  latestTechnicianPosition = null;
  lastTechnicianLocationSentAt = null;
  startLocationSharingButton.textContent = 'Start sharing location';
  renderTechnicianMap(null);
  if (notifyServer) {
    try {
      await userRequest('/api/technician/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharing: false })
      });
      technicianLocationStatus.textContent = 'Location sharing stopped.';
      technicianOnlineBadge.textContent = 'Offline';
      technicianOnlineBadge.classList.remove('online');
      technicianOnlineBadge.classList.add('offline');
    } catch (error) {
      technicianLocationStatus.textContent = error.message || 'Could not stop location sharing.';
    }
  } else {
    technicianLocationStatus.textContent = 'Location sharing stopped.';
    technicianOnlineBadge.textContent = 'Offline';
    technicianOnlineBadge.classList.remove('online');
    technicianOnlineBadge.classList.add('offline');
  }
}

startLocationSharingButton.addEventListener('click', () => {
  if (technicianWatchId !== null) {
    stopTechnicianLocation();
    return;
  }
  if (!navigator.geolocation) {
    technicianLocationStatus.textContent = 'This browser does not support location sharing.';
    return;
  }
  startLocationSharingButton.disabled = true;
  technicianLocationStatus.textContent = 'Waiting for your current location...';
  technicianWatchId = navigator.geolocation.watchPosition(position => {
    latestTechnicianPosition = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    startLocationSharingButton.disabled = false;
    startLocationSharingButton.textContent = 'Stop sharing location';
    renderTechnicianMap(latestTechnicianPosition);
    sendTechnicianLocation();
    if (technicianLocationTimer === null) {
      technicianLocationTimer = window.setInterval(() => {
        if (lastTechnicianLocationSentAt !== null
          && Date.now() - lastTechnicianLocationSentAt >= 30000) {
          technicianOnlineBadge.textContent = 'Offline';
          technicianOnlineBadge.classList.remove('online');
          technicianOnlineBadge.classList.add('offline');
        }
        sendTechnicianLocation();
      }, 5000);
    }
  }, error => {
    startLocationSharingButton.disabled = false;
    technicianLocationStatus.textContent = describeGeolocationError(error);
    technicianOnlineBadge.textContent = 'Offline';
    technicianOnlineBadge.classList.remove('online');
    technicianOnlineBadge.classList.add('offline');
    if (technicianWatchId !== null) navigator.geolocation.clearWatch(technicianWatchId);
    technicianWatchId = null;
    technicianLocationTimer = null;
    latestTechnicianPosition = null;
    startLocationSharingButton.textContent = 'Start sharing location';
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
});

function renderUserServices() {
  userServiceGrid.replaceChildren();
  const searchTerm = userServiceSearch.value.trim().toLowerCase();
  const selectedCategory = userServiceCategory.value;
  const visibleServices = userServices.filter(service => {
    const matchesCategory = !selectedCategory || service.category === selectedCategory;
    const searchableText = `${service.serviceName} ${service.category} ${service.description || ''}`.toLowerCase();
    return matchesCategory && searchableText.includes(searchTerm);
  });

  if (visibleServices.length === 0) {
    userServiceGrid.append(createTextElement(
      'p',
      'empty-state',
      userServices.length === 0
        ? 'No services are available right now. Please check back soon.'
        : 'No services match your search. Try another name or category.'
    ));
    return;
  }

  const groupedServices = new Map();
  visibleServices.forEach(service => {
    if (!groupedServices.has(service.category)) groupedServices.set(service.category, []);
    groupedServices.get(service.category).push(service);
  });

  groupedServices.forEach((categoryServices, category) => {
    const group = createTextElement('section', 'user-service-group', '');
    group.setAttribute('aria-label', category);
    group.append(createTextElement('h2', 'user-service-category-heading', category));
    const grid = createTextElement('div', 'service-grid user-service-grid', '');

    categoryServices.forEach(service => {
      const card = createTextElement('article', 'service-card user-service-card', '');
      const imageArea = createTextElement('div', 'user-service-image', '');
      if (typeof service.imageUrl === 'string'
        && /^\/uploads\/[a-f0-9]{32}\.(?:jpg|png|webp)$/.test(service.imageUrl)) {
        const image = document.createElement('img');
        image.src = service.imageUrl;
        image.alt = '';
        image.loading = 'lazy';
        image.addEventListener('error', () => {
          imageArea.classList.add('image-unavailable');
          image.remove();
          imageArea.textContent = service.serviceName.slice(0, 1).toUpperCase();
        }, { once: true });
        imageArea.append(image);
      } else {
        imageArea.textContent = service.serviceName.slice(0, 1).toUpperCase();
      }
      const title = createTextElement('h3', '', service.serviceName);
      const description = createTextElement(
        'p',
        'service-description',
        service.description || 'Professional help, available when you need it.'
      );
      const requestButton = createTextElement('button', 'submit-btn user-request-button', 'Request service');
      requestButton.type = 'button';
      requestButton.addEventListener('click', () => {
        requestServiceId.value = String(service.id);
        requestServiceName.textContent = service.serviceName;
        userRequestStatus.textContent = '';
        userRequestStatus.classList.remove('success');
        customerCoordinates = null;
        customerLocationStatus.textContent = 'Share your current location for automatic dispatch; without it, your request remains unassigned.';
        userRequestForm.hidden = false;
        userRequestForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('requestPhone').focus({ preventScroll: true });
      });
      card.append(imageArea, title, description, requestButton);
      grid.append(card);
    });

    group.append(grid);
    userServiceGrid.append(group);
  });
}

async function loadUserServices() {
  userServicesStatus.textContent = '';
  userServiceGrid.replaceChildren();
  userServices = [];
  try {
    const data = await userRequest('/api/services');
    if (!Array.isArray(data.services)) {
      throw new Error('The server response did not include a services list. Restart the latest server code and try again.');
    }
    userServices = data.services;
    const selectedCategory = userServiceCategory.value;
    const categories = [...new Set(userServices.map(service => service.category))];
    userServiceCategory.replaceChildren(createTextElement('option', '', 'All categories'));
    userServiceCategory.firstElementChild.value = '';
    categories.forEach(category => {
      const option = createTextElement('option', '', category);
      option.value = category;
      userServiceCategory.append(option);
    });
    userServiceCategory.value = categories.includes(selectedCategory) ? selectedCategory : '';
    renderUserServices();
  } catch (error) {
    userServicesStatus.textContent = error.message || 'Could not load services.';
  }
}

userServiceSearch.addEventListener('input', renderUserServices);
userServiceCategory.addEventListener('change', renderUserServices);
cancelRequestButton.addEventListener('click', () => {
  userRequestForm.reset();
  userRequestForm.hidden = true;
  customerCoordinates = null;
  customerLocationStatus.textContent = 'Share your current location for automatic dispatch; without it, your request remains unassigned.';
  userRequestStatus.textContent = '';
  userRequestStatus.classList.remove('success');
});
captureCustomerLocationButton.addEventListener('click', async () => {
  captureCustomerLocationButton.disabled = true;
  customerLocationStatus.textContent = 'Finding your current location...';
  try {
    const position = await getBrowserPosition();
    customerCoordinates = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    customerLocationStatus.textContent = `Location attached (${customerCoordinates.latitude.toFixed(5)}, ${customerCoordinates.longitude.toFixed(5)}).`;
  } catch (error) {
    customerCoordinates = null;
    customerLocationStatus.textContent = describeGeolocationError(error);
  } finally {
    captureCustomerLocationButton.disabled = false;
  }
});
refreshCustomerJobsButton.addEventListener('click', loadUserJobs);
userRequestForm.addEventListener('submit', async event => {
  event.preventDefault();
  userRequestStatus.textContent = '';
  userRequestStatus.classList.remove('success');
  requestSubmitButton.disabled = true;
  const formData = new FormData(userRequestForm);
  const payload = {
    serviceId: Number(formData.get('serviceId')),
    customerPhone: formData.get('customerPhone'),
    address: formData.get('address'),
    details: formData.get('details'),
    customerLatitude: customerCoordinates?.latitude ?? null,
    customerLongitude: customerCoordinates?.longitude ?? null
  };
  try {
    const data = await userRequest('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    userRequestStatus.textContent = data.message || 'Your service request has been sent.';
    userRequestStatus.classList.add('success');
    userRequestForm.reset();
    userRequestForm.hidden = true;
    customerCoordinates = null;
    customerLocationStatus.textContent = 'Share your current location for automatic dispatch; without it, your request remains unassigned.';
    await loadUserJobs();
  } catch (error) {
    userRequestStatus.textContent = error.message || 'Could not send your service request.';
  } finally {
    requestSubmitButton.disabled = false;
  }
});

function setAdminTab(tab) {
  const showingServices = tab === 'services';
  const showingTechnicians = tab === 'technicians';
  servicesTab.classList.toggle('active', showingServices);
  techniciansTab.classList.toggle('active', showingTechnicians);
  jobsTab.classList.toggle('active', !showingServices && !showingTechnicians);
  servicesTab.setAttribute('aria-selected', String(showingServices));
  techniciansTab.setAttribute('aria-selected', String(showingTechnicians));
  jobsTab.setAttribute('aria-selected', String(!showingServices && !showingTechnicians));
  servicesSection.hidden = !showingServices;
  techniciansSection.hidden = !showingTechnicians;
  jobsSection.hidden = showingServices || showingTechnicians;
  if (showingTechnicians) loadTechnicians();
  if (!showingServices && !showingTechnicians) loadJobs();
}

function renderServices() {
  serviceGrid.replaceChildren();
  if (services.length === 0) {
    serviceGrid.append(createTextElement('p', 'empty-state', 'No services yet. Add one using the form above.'));
    return;
  }

  services.forEach(service => {
    const card = createTextElement('article', 'service-card', '');
    if (service.imageUrl) {
      const image = document.createElement('img');
      image.src = service.imageUrl;
      image.alt = service.serviceName;
      image.loading = 'lazy';
      card.append(image);
    }
    const title = createTextElement('h3', '', service.serviceName);
    const category = createTextElement('p', 'category', service.category);
    const description = createTextElement('p', 'service-description', service.description || 'No description provided.');
    const active = createTextElement(
      'span',
      service.isActive ? 'service-status active' : 'service-status inactive',
      service.isActive ? 'Active' : 'Inactive'
    );
    const actions = createTextElement('div', 'service-actions', '');
    const editButton = createTextElement('button', 'secondary-btn', 'Edit');
    editButton.type = 'button';
    editButton.addEventListener('click', () => editService(service));
    const toggleButton = createTextElement('button', 'secondary-btn', service.isActive ? 'Deactivate' : 'Activate');
    toggleButton.type = 'button';
    toggleButton.addEventListener('click', () => toggleService(service, toggleButton));
    actions.append(editButton, toggleButton);
    card.append(title, category, description, active, actions);
    serviceGrid.append(card);
  });
}

async function loadServices() {
  const response = await fetchWithRetry('/api/admin/services', {}, { maxAttempts: 3 });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Could not load services.');
  }
  if (!Array.isArray(data.services)) {
    throw new Error('The server response did not include a services list. Restart the latest server code and try again.');
  }
  services = data.services;
  renderServices();
}

function editService(service) {
  serviceIdInput.value = service.id;
  serviceNameInput.value = service.serviceName;
  serviceCategoryInput.value = service.category;
  serviceDescriptionInput.value = service.description || '';
  serviceActiveInput.checked = service.isActive;
  serviceImageInput.value = '';
  currentImageUrl = service.imageUrl || '';
  serviceImagePreview.src = currentImageUrl;
  serviceImagePreview.hidden = !currentImageUrl;
  cancelServiceEditButton.hidden = false;
  serviceSubmitButton.textContent = 'Save changes';
  serviceStatus.textContent = '';
  serviceForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetServiceForm() {
  serviceForm.reset();
  serviceIdInput.value = '';
  serviceActiveInput.checked = true;
  serviceImageInput.value = '';
  serviceImagePreview.removeAttribute('src');
  serviceImagePreview.hidden = true;
  currentImageUrl = '';
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = '';
  }
  cancelServiceEditButton.hidden = true;
  serviceSubmitButton.textContent = 'Add service';
}

function createServiceFormData(service) {
  const formData = new FormData();
  formData.set('serviceName', service.serviceName);
  formData.set('category', service.category);
  formData.set('description', service.description || '');
  formData.set('isActive', String(service.isActive));
  return formData;
}

async function toggleService(service, button) {
  button.disabled = true;
  serviceStatus.textContent = '';
  serviceStatus.classList.remove('success');
  try {
    const formData = createServiceFormData({ ...service, isActive: !service.isActive });
    const data = await adminRequest(`/api/admin/services/${service.id}`, {
      method: 'PUT',
      body: formData
    });
    services = services.map(item => item.id === service.id ? data.service : item);
    renderServices();
  } catch (error) {
    serviceStatus.textContent = error.message;
  }
}

serviceForm.addEventListener('submit', async event => {
  event.preventDefault();
  serviceStatus.textContent = '';
  const editingId = serviceIdInput.value;
  const formData = new FormData(serviceForm);
  formData.set('isActive', String(serviceActiveInput.checked));
  serviceSubmitButton.disabled = true;
  cancelServiceEditButton.disabled = true;

  try {
    const data = await adminRequest(
      editingId ? `/api/admin/services/${editingId}` : '/api/admin/services',
      { method: editingId ? 'PUT' : 'POST', body: formData }
    );
    serviceStatus.textContent = editingId ? 'Service updated.' : 'Service added.';
    serviceStatus.classList.add('success');
    resetServiceForm();
    await loadServices();
  } catch (error) {
    serviceStatus.textContent = error.message;
    serviceStatus.classList.remove('success');
  } finally {
    serviceSubmitButton.disabled = false;
    cancelServiceEditButton.disabled = false;
  }
});

serviceImageInput.addEventListener('change', () => {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = '';
  }
  const file = serviceImageInput.files[0];
  if (file) {
    previewObjectUrl = URL.createObjectURL(file);
    serviceImagePreview.src = previewObjectUrl;
    serviceImagePreview.hidden = false;
  } else {
    serviceImagePreview.src = currentImageUrl;
    serviceImagePreview.hidden = !currentImageUrl;
  }
});

cancelServiceEditButton.addEventListener('click', resetServiceForm);
servicesTab.addEventListener('click', () => setAdminTab('services'));
techniciansTab.addEventListener('click', () => setAdminTab('technicians'));
jobsTab.addEventListener('click', () => setAdminTab('jobs'));
refreshJobsButton.addEventListener('click', loadJobs);
refreshTechniciansButton.addEventListener('click', loadTechnicians);

function renderTechnicians() {
  techniciansList.replaceChildren();
  if (technicians.length === 0) {
    techniciansList.append(createTextElement('p', 'empty-state', 'No technician accounts are registered yet.'));
    return;
  }
  const categories = [...new Set(services
    .filter(service => service.isActive)
    .map(service => service.category.trim())
    .filter(Boolean))].sort();
  technicians.forEach(technician => {
    const card = createTextElement('article', 'job-card', '');
    card.dataset.technicianId = String(technician.id);
    const identity = createTextElement('div', 'technician-admin-identity', '');
    const validPhotoUrl = typeof technician.profileImageUrl === 'string'
      && /^\/uploads\/[a-f0-9]{32}\.(?:jpg|png|webp)$/.test(technician.profileImageUrl);
    const photo = validPhotoUrl
      ? document.createElement('img')
      : createTextElement('span', 'technician-admin-avatar-fallback', technician.username.slice(0, 1).toUpperCase());
    if (validPhotoUrl) {
      photo.src = technician.profileImageUrl;
      photo.alt = `${technician.username} profile`;
      photo.classList.add('technician-admin-avatar');
    }
    identity.append(photo, createTextElement('h3', '', technician.username));
    const statusBadges = createTextElement('div', 'technician-state-badges', '');
    statusBadges.dataset.locationBadges = '';
    statusBadges.append(
      createTextElement(
        'span',
        `availability-badge ${technician.isAvailable ? 'available' : 'unavailable'}`,
        technician.isAvailable ? 'Available' : 'Unavailable'
      ),
      createTextElement(
        'span',
        `availability-badge ${technician.isSharingLocation ? 'online' : 'offline'}`,
        technician.isSharingLocation ? 'Online · GPS fresh' : 'Offline'
      )
    );
    const profileSummary = createTextElement(
      'p',
      'section-description',
      technician.phone
        ? `${technician.phone} · ${technician.serviceArea || 'No service area'} · ${technician.serviceRate === null ? 'Rate not set' : `₹${technician.serviceRate} starting rate`}`
        : 'Profile incomplete · phone, service area, rate and photo are required for automatic dispatch'
    );
    const form = createTextElement('div', 'job-assignment-row', '');
    const categoryLabel = createTextElement('label', '', '');
    const categorySelect = document.createElement('select');
    categorySelect.setAttribute('aria-label', `Skill category for ${technician.username}`);
    const emptyOption = createTextElement('option', '', 'Choose a service category');
    emptyOption.value = '';
    categorySelect.append(emptyOption);
    categories.forEach(category => {
      const option = createTextElement('option', '', category);
      option.value = category;
      option.selected = category.toLowerCase() === (technician.skillCategory || '').trim().toLowerCase();
      categorySelect.append(option);
    });
    categoryLabel.append(createTextElement('span', '', 'Skill category'), categorySelect);

    const availabilityLabel = createTextElement('label', 'checkbox-label', '');
    const availabilityInput = document.createElement('input');
    availabilityInput.type = 'checkbox';
    availabilityInput.checked = technician.isAvailable;
    availabilityLabel.append(availabilityInput, document.createTextNode('Available for dispatch'));
    const locationStatus = createTextElement('p', 'section-description', !technician.locationSharingEnabled
      ? 'Location sharing is off'
      : technician.isSharingLocation
        ? `Location is fresh · updated ${new Date(technician.locationUpdatedAt).toLocaleString()}`
        : 'Location is stale; this technician is excluded from dispatch');
    locationStatus.dataset.locationStatus = '';
    const profileStatus = technician.profileComplete
      ? createTextElement('span', 'availability-badge available', 'Profile complete')
      : createTextElement('span', 'availability-badge unavailable', 'Profile incomplete');
    const saveButton = createTextElement('button', 'secondary-btn', 'Save technician');
    saveButton.type = 'button';
    saveButton.addEventListener('click', async () => {
      techniciansStatus.textContent = '';
      techniciansStatus.classList.remove('success');
      saveButton.disabled = true;
      try {
        const result = await adminRequest(`/api/admin/technicians/${technician.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skillCategory: categorySelect.value,
            isAvailable: availabilityInput.checked
          })
        });
        technicians = technicians.map(item => item.id === technician.id
          ? { ...item, ...result.technician }
          : item);
        techniciansStatus.textContent = `${technician.username}'s dispatch settings were saved.`;
        techniciansStatus.classList.add('success');
        renderTechnicians();
      } catch (error) {
        techniciansStatus.textContent = error.message;
        techniciansStatus.classList.remove('success');
      } finally {
        saveButton.disabled = false;
      }
    });
    form.append(categoryLabel, availabilityLabel, saveButton);
    const optionalDetails = [
      ['Skills', technician.skills],
      ['Achievements', technician.achievements],
      ['Education', technician.education]
    ].filter(([, value]) => Boolean(value))
      .map(([label, value]) => createTextElement(
        'p',
        'technician-optional-detail',
        `${label}: ${value}`
      ));
    card.append(identity, statusBadges, profileSummary, profileStatus);
    if (optionalDetails.length > 0) card.append(...optionalDetails);
    card.append(locationStatus, form);
    techniciansList.append(card);
  });
}

function refreshRenderedTechnicianLocations() {
  techniciansList.querySelectorAll('[data-technician-id]').forEach(card => {
    const technician = technicians.find(item => String(item.id) === card.dataset.technicianId);
    if (!technician) return;
    const statusBadge = card.querySelector('[data-location-badges]')?.children[1];
    if (statusBadge) {
      statusBadge.textContent = technician.isSharingLocation ? 'Online · GPS fresh' : 'Offline';
      statusBadge.className = `availability-badge ${technician.isSharingLocation ? 'online' : 'offline'}`;
    }
    const locationStatus = card.querySelector('[data-location-status]');
    if (locationStatus) {
      locationStatus.textContent = !technician.locationSharingEnabled
        ? 'Location sharing is off'
        : technician.isSharingLocation
          ? `Location is fresh · updated ${new Date(technician.locationUpdatedAt).toLocaleString()}`
          : 'Location is stale; this technician is excluded from dispatch';
    }
  });
}

async function loadTechnicians() {
  techniciansStatus.textContent = 'Loading technicians...';
  techniciansStatus.classList.remove('success');
  try {
    const data = await adminRequest('/api/admin/technicians');
    if (!Array.isArray(data.technicians)) {
      throw new Error('The server response did not include a technician list. Restart the latest server code and try again.');
    }
    technicians = data.technicians;
    renderTechnicians();
    techniciansStatus.textContent = technicians.length ? '' : 'No technicians are registered yet.';
  } catch (error) {
    techniciansStatus.textContent = error.message || 'Could not load technicians.';
  }
}

function renderJobs() {
  jobsList.replaceChildren();
  if (jobs.length === 0) {
    jobsList.append(createTextElement('p', 'empty-state', 'No job requests yet. Customer service requests will appear here.'));
    return;
  }

  jobs.forEach(job => {
    const card = createTextElement('article', 'job-card', '');
    const heading = createTextElement('div', 'job-heading', '');
    const title = createTextElement('h3', '', `Job #${job.id} · ${job.serviceName}`);
    const createdAt = new Date(job.createdAt);
    const date = createTextElement(
      'time',
      'job-date',
      Number.isNaN(createdAt.getTime()) ? '' : createdAt.toLocaleString()
    );
    heading.append(title, date);
    const customer = createTextElement('p', '', `Customer: ${job.customerName} · ${job.customerPhone}`);
    const address = createTextElement('p', '', `Address: ${job.address}`);
    const details = createTextElement('p', 'service-description', job.details || 'No additional details.');
    const completionReport = job.completionReport
      ? createTextElement('p', 'completion-report', `Technician update: ${job.completionReport}`)
      : null;
    const paymentStatus = job.status === 'completed'
      ? createTextElement(
        'p',
        job.paymentStatus === 'paid' ? 'payment-confirmed' : '',
        `Payment: ${job.paymentStatus === 'paid' ? 'Paid' : 'Awaiting customer'}${formatRupeesFromPaise(job.paymentAmountPaise) ? ` · ${formatRupeesFromPaise(job.paymentAmountPaise)}` : ''}`
      )
      : null;
    const assignmentRow = createTextElement('div', 'job-assignment-row', '');
    const statusLabel = createTextElement('label', '', '');
    const statusSelect = document.createElement('select');
    statusSelect.setAttribute('aria-label', `Status for job ${job.id}`);
    statusSelect.addEventListener('change', () => {
      adminJobEditsPending = true;
    });
    Object.entries(jobStatuses).forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === job.status;
      statusSelect.append(option);
    });
    statusLabel.append(createTextElement('span', '', 'Status'), statusSelect);
    const technicianLabel = createTextElement('label', '', 'Technician');
    const technicianSelect = document.createElement('select');
    technicianSelect.setAttribute('aria-label', `Technician for job ${job.id}`);
    technicianSelect.addEventListener('change', () => {
      adminJobEditsPending = true;
    });
    const unassignedOption = createTextElement('option', '', 'Unassigned');
    unassignedOption.value = '';
    unassignedOption.selected = job.technicianId === null || job.technicianId === undefined;
    technicianSelect.append(unassignedOption);
    technicians.forEach(technician => {
      const onlineStatus = technician.locationSharingEnabled
        ? technician.isSharingLocation ? 'online' : 'location stale'
        : 'offline';
      const option = createTextElement(
        'option',
        '',
        `${technician.username} · ${technician.isAvailable ? 'available' : 'unavailable'} · ${onlineStatus}`
      );
      option.value = String(technician.id);
      option.selected = Number(job.technicianId) === Number(technician.id);
      technicianSelect.append(option);
    });
    technicianLabel.append(createTextElement('span', '', 'Assigned technician'), technicianSelect);
    const saveButton = createTextElement('button', 'secondary-btn', 'Save assignment');
    saveButton.type = 'button';
    saveButton.addEventListener('click', async () => {
      saveButton.disabled = true;
      jobsStatus.textContent = '';
      try {
        await adminRequest(`/api/admin/jobs/${job.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: statusSelect.value === 'requested' && technicianSelect.value
              ? 'assigned'
              : statusSelect.value,
            technicianId: technicianSelect.value ? Number(technicianSelect.value) : null
          })
        });
        jobsStatus.textContent = `Job #${job.id} assignment and status updated.`;
        jobsStatus.classList.add('success');
        await loadJobs();
      } catch (error) {
        jobsStatus.textContent = error.message;
        jobsStatus.classList.remove('success');
      } finally {
        saveButton.disabled = false;
      }
    });
    assignmentRow.append(statusLabel, technicianLabel, saveButton);
    card.append(heading, customer, address, details);
    if (completionReport) card.append(completionReport);
    if (paymentStatus) card.append(paymentStatus);
    card.append(assignmentRow);
    jobsList.append(card);
  });
}

function renderAdminLocationMap() {
  if (jobsSection.hidden) return;
  const places = [];
  technicians.forEach(technician => {
    if (!technician.isSharingLocation) return;
    places.push({
      id: `technician-${technician.id}`,
      type: 'technician',
      label: 'T',
      title: `Technician: ${technician.username}`,
      latitude: technician.latitude,
      longitude: technician.longitude
    });
  });
  jobs.filter(job => !['completed', 'cancelled'].includes(job.status)).forEach(job => {
    if (job.customerLatitude === null || job.customerLatitude === undefined) return;
    places.push({
      id: `customer-${job.id}`,
      type: 'customer',
      label: 'C',
      title: `Customer: ${job.customerName} · Job #${job.id}`,
      latitude: job.customerLatitude,
      longitude: job.customerLongitude
    });
  });
  renderLocationMap(
    adminMapElement,
    'admin',
    adminMapStatus,
    places,
    'No active customer pins or technicians sharing their location right now.'
  );
}

async function loadAdminLocationData() {
  try {
    const [jobsData, techniciansData] = await Promise.all([
      adminRequest('/api/admin/jobs'),
      adminRequest('/api/admin/technicians')
    ]);
    if (!Array.isArray(jobsData.jobs) || !Array.isArray(techniciansData.technicians)) {
      throw new Error('The server response did not include location data. Restart the latest server code and try again.');
    }
    const previousJobs = new Map(jobs.map(job => [String(job.id), job]));
    const jobDisplayChanged = jobsData.jobs.length !== jobs.length
      || jobsData.jobs.some(job => {
        const previous = previousJobs.get(String(job.id));
        return !previous
          || previous.status !== job.status
          || previous.technicianId !== job.technicianId
          || previous.completionReport !== job.completionReport
          || previous.paymentStatus !== job.paymentStatus
          || previous.paymentAmountPaise !== job.paymentAmountPaise;
      });
    jobs = jobsData.jobs;
    technicians = techniciansData.technicians;
    if (!jobsSection.hidden && !adminJobEditsPending && jobDisplayChanged) renderJobs();
    if (!techniciansSection.hidden) refreshRenderedTechnicianLocations();
    renderAdminLocationMap();
  } catch (error) {
    adminMapStatus.textContent = error.message || 'Could not load live location data.';
    adminMapStatus.classList.remove('success');
  }
}

async function loadJobs() {
  adminJobEditsPending = false;
  jobsStatus.textContent = 'Loading jobs...';
  jobsStatus.classList.remove('success');
  try {
    const [jobsData, techniciansData] = await Promise.all([
      adminRequest('/api/admin/jobs'),
      adminRequest('/api/admin/technicians')
    ]);
    if (!Array.isArray(jobsData.jobs) || !Array.isArray(techniciansData.technicians)) {
      throw new Error('The server response did not include a jobs or technicians list. Restart the latest server code and try again.');
    }
    jobs = jobsData.jobs;
    technicians = techniciansData.technicians;
    renderJobs();
    renderAdminLocationMap();
    jobsStatus.textContent = jobs.length ? '' : 'No job requests yet.';
  } catch (error) {
    jobsStatus.textContent = error.message || 'Could not load jobs.';
  }
}

async function loadAdminWorkspace() {
  serviceStatus.textContent = '';
  try {
    await loadServices();
  } catch (error) {
    serviceStatus.textContent = error.message || 'Could not load services.';
  }
  await loadJobs();
  renderTechnicians();
}

if (hasSelectedRole) {
  showAuthPanel();
  rolePrompt.hidden = true;
  roleLabel.textContent = `${roleNames[selectedRole].toUpperCase()} ACCOUNT`;
  roleLinks.forEach(link => {
    const active = link.dataset.role === selectedRole;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
  });
  if (selectedRole === 'admin') {
    signupTab.hidden = true;
    adminNote.hidden = false;
    confirmPasswordField.hidden = true;
  }
} else {
  authPanel.hidden = true;
  rolePrompt.hidden = false;
  dashboardPanel.hidden = true;
  roleLinks.forEach(link => link.classList.remove('active'));
}

loginTab.addEventListener('click', () => setAuthMode(false));
signupTab.addEventListener('click', () => setAuthMode(true));

async function checkSessionStatus() {
  try {
    const response = await fetchWithRetry('/api/session', {
      headers: { 'cache-control': 'no-cache' }
    }, {
      maxAttempts: 5,
      onRetry: ({ delay }) => {
        if (hasSelectedRole) {
          showAuthPanel(`Connection lost. Reconnecting to the service in ${Math.round(delay / 1000)}s...`);
        }
      }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Could not check your sign-in status.');
    }
    if (!data.user) return;
    if (!hasSelectedRole || data.user.role === selectedRole) {
      showDashboard(data.user);
      return;
    }

    showAuthPanel(
      `This browser is signed in as ${roleNames[data.user.role]} (${data.user.username}). ` +
      `Signing in here will switch this browser to your ${roleNames[selectedRole]} account.`
    );
  } catch {
    if (hasSelectedRole) {
      showAuthPanel('Could not check your sign-in status. Reconnecting to the service...');
      window.setTimeout(checkSessionStatus, 5000);
    }
  }
}

checkSessionStatus();

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  statusMessage.textContent = '';
  submitButton.disabled = true;

  const username = document.getElementById('username').value.trim();
  const password = passwordInput.value;
  if (isSigningUp && password !== confirmPasswordInput.value) {
    statusMessage.textContent = 'The passwords do not match.';
    submitButton.disabled = false;
    return;
  }

  try {
    const response = await fetchWithRetry(`/api/${isSigningUp ? 'signup' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role: selectedRole })
    }, {
      maxAttempts: 5,
      onRetry: ({ delay }) => {
        statusMessage.textContent = `Connection lost. Reconnecting to the service in ${Math.round(delay / 1000)}s...`;
        statusMessage.classList.remove('success');
      }
    });
    const data = await response.json();
    statusMessage.textContent = data.message || 'The request could not be completed.';
    statusMessage.classList.toggle('success', response.ok);

    if (response.ok) {
      if (isSigningUp) {
        authForm.reset();
        setAuthMode(false);
        statusMessage.textContent = 'Account created. Sign in with your new credentials.';
        statusMessage.classList.add('success');
      } else {
        showDashboard(data.user);
      }
    }
  } catch {
    statusMessage.textContent = 'Could not connect to the service. Reconnect attempts have been exhausted. Please refresh or try again.';
    statusMessage.classList.remove('success');
  } finally {
    submitButton.disabled = false;
  }
});

async function signOut() {
  const isAdmin = !adminDashboard.hidden;
  const isCustomer = !userServicesPanel.hidden;
  const button = isAdmin ? adminSignOutButton : isCustomer ? userSignOutButton : signOutButton;
  const statusElement = isAdmin ? serviceStatus : isCustomer ? userServicesStatus : dashboardStatus;
  clearLocationRefreshTimers();
  if (!isAdmin && !isCustomer && technicianWatchId !== null) {
    await stopTechnicianLocation(false);
  }
  button.disabled = true;
  statusElement.textContent = '';
  try {
    const response = await fetchWithRetry('/api/logout', { method: 'POST' }, {
      maxAttempts: 5,
      onRetry: ({ delay }) => {
        statusElement.textContent = `Connection lost. Reconnecting to sign out in ${Math.round(delay / 1000)}s...`;
      }
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Could not sign out.');
    }
    if (hasSelectedRole) {
      setAuthMode(false);
      showAuthPanel('You have been signed out.');
    } else {
      dashboardPanel.hidden = true;
      rolePrompt.hidden = false;
    }
  } catch {
    statusElement.textContent = 'Could not sign out. Please try again.';
  } finally {
    button.disabled = false;
  }
}

signOutButton.addEventListener('click', signOut);
userSignOutButton.addEventListener('click', signOut);
adminSignOutButton.addEventListener('click', signOut);
document.getElementById('footerYear').textContent = String(new Date().getFullYear());