(() => {
  "use strict";

  const initialState = {
    role: "participant",
    session: "open",
    device: "registered",
    location: "pass",
    manual: "pending",
    attendance: false,
    emailVerified: false,
    deviceRequest: "none",
    photoStatus: "current",
    caseCreated: false,
    sessionExtended: false,
    returnToCheckin: false,
    autoAttemptStarted: false,
    auth: true,
    screen: "home"
  };

  const state = { ...initialState };
  const root = document.getElementById("screen-root");
  const breadcrumb = document.getElementById("breadcrumb");
  const desktopNav = document.getElementById("desktop-nav");
  const mobileNav = document.getElementById("mobile-nav");
  const toastRegion = document.getElementById("toast-region");

  const people = [
    { initials: "AO", name: "Amina Okafor", serial: "KSA-07", time: "10:14 AM", method: "QR", status: "Present" },
    { initials: "TB", name: "Tunde Balogun", serial: "KSA-12", time: "10:17 AM", method: "QR", status: "Present" },
    { initials: "CN", name: "Chinonso Nwosu", serial: "KSA-19", time: "10:21 AM", method: "Manual", status: "Present" },
    { initials: "FE", name: "Fatima Eze", serial: "KSA-24", time: "—", method: "—", status: "Waiting" }
  ];

  const screenNames = {
    login: "Log in",
    register: "Create account",
    "registration-success": "Account created",
    verify: "Email verification",
    forgot: "Password recovery",
    home: "Home",
    attendance: "Attendance",
    processing: "Verifying attendance",
    success: "Attendance confirmed",
    "not-open": "Attendance status",
    location: "Location review",
    device: "Device approval",
    "device-status": "Device status",
    history: "Attendance history",
    profile: "Profile",
    "ops-closed": "Operations overview",
    "session-form": "Session setup",
    "ops-open": "Attendance open",
    live: "Live attendance",
    "manual-queue": "Manual verification",
    "manual-detail": "Manual verification detail",
    "device-queue": "Device changes",
    "device-detail": "Device change detail",
    participants: "Participants",
    "session-history": "Session history",
    admin: "Administrator overview",
    roles: "Role management",
    config: "Course configuration",
    audit: "Audit log",
    correction: "Historical correction",
    sheets: "Google Sheets health",
    roster: "Authorized roster",
    photos: "Photo replacements",
    "closed-admin": "Closed-session administration",
    system: "System operations"
  };

  const roleNames = {
    participant: "Participant",
    rep: "Course Representative",
    admin: "Administrator"
  };

  const sessionMeta = {
    open: { label: "Attendance open", pill: "status-success", start: "10:00 AM", end: "1:00 PM" },
    scheduled: { label: "Scheduled", pill: "status-info", start: "10:00 AM", end: "1:00 PM" },
    closed: { label: "Attendance closed", pill: "status-neutral", start: "10:00 AM", end: "1:00 PM" },
    cancelled: { label: "Cancelled", pill: "status-danger", start: "10:00 AM", end: "1:00 PM" },
    missing: { label: "No session", pill: "status-neutral", start: "—", end: "—" }
  };

  const html = (strings, ...values) => strings.reduce((result, string, index) => result + string + (values[index] ?? ""), "");

  function session() {
    return sessionMeta[state.session];
  }

  function isOperator() {
    return state.role === "rep" || state.role === "admin";
  }

  function homeRoute() {
    if (state.role === "admin") return "admin";
    if (state.role === "rep") return state.session === "open" ? "ops-open" : "ops-closed";
    return "home";
  }

  function normalizeRoute(route) {
    return route === "check-in" ? "attendance" : route;
  }

  function status(text, tone) {
    return `<span class="status-pill ${tone}">${text}</span>`;
  }

  function button(label, route = "", className = "button-secondary", action = "") {
    const attributes = route ? `data-route="${route}"` : action ? `data-action="${action}"` : "";
    return `<button type="button" class="button ${className}" ${attributes}>${label}</button>`;
  }

  function page(title, description, actions = "") {
    return html`
      <div class="page-heading">
        <div>
          <p class="eyebrow">${isOperator() ? roleNames[state.role] : "Kora Sales Academy"}</p>
          <h1>${title}</h1>
          ${description ? `<p>${description}</p>` : ""}
        </div>
        ${actions ? `<div class="heading-actions">${actions}</div>` : ""}
      </div>
    `;
  }

  function card(title, content, className = "") {
    return `<section class="card ${className}"><div class="card-heading"><h2>${title}</h2></div>${content}</section>`;
  }

  function stat(label, value, note, icon = "•") {
    return `<article class="card stat-card"><div class="stat-top"><span class="stat-label">${label}</span><span class="metric-icon" aria-hidden="true">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`;
  }

  function person(personData, action = "") {
    return `<div class="identity-row"><span class="person-mark" aria-hidden="true">${personData.initials}</span><div><strong>${personData.name}</strong><span>${personData.serial}${action ? ` · ${action}` : ""}</span></div></div>`;
  }

  function field(label, type, value, note = "", name = "") {
    return `<div class="field"><label for="${name || label.toLowerCase().replaceAll(" ", "-")}">${label}</label><input id="${name || label.toLowerCase().replaceAll(" ", "-")}" type="${type}" value="${value}" />${note ? `<small>${note}</small>` : ""}</div>`;
  }

  function sessionCard() {
    const meta = session();
    const extra = state.sessionExtended ? " · extended" : "";
    return `<div class="status-line">${status(meta.label, meta.pill)}<span class="small muted">Today · Africa/Lagos${extra}</span></div><strong>${meta.start} – ${meta.end}</strong>`;
  }

  function attendanceStateCard() {
    const meta = session();
    if (state.session === "open" && state.attendance) {
      return `<div class="hero-card"><div class="status-line">${status("Present", "status-success")}<span class="small muted">Today</span></div><h2>You're already checked in</h2><p>Your attendance was recorded at 10:14 AM.</p>${button("View history", "history", "button-secondary")}</div>`;
    }
    if (state.session === "open") {
      return `<div class="hero-card"><div class="status-line">${status("Attendance open", "status-success")}<span class="small muted">${session().start} – ${session().end}</span></div><h2>Check in for today's class</h2><p>Use the attendance QR at the venue. We will ask for your browser location during check-in.</p><div class="hero-actions">${button("Check in", "attendance", "button-primary")}${button("How it works", "attendance", "button-secondary")}</div></div>`;
    }
    if (state.session === "scheduled") {
      return `<div class="hero-card"><div class="status-line">${status("Scheduled", "status-info")}<span class="small muted">${session().start} – ${session().end}</span></div><h2>Attendance is not open yet</h2><p>Your Course Representative has scheduled the session. Check-in will become available when it starts.</p>${button("View attendance", "attendance", "button-secondary")}</div>`;
    }
    if (state.session === "cancelled") {
      return `<div class="hero-card"><div class="status-line">${status("Cancelled", "status-danger")}<span class="small muted">Today</span></div><h2>This session was cancelled</h2><p>This session will not affect your attendance percentage.</p>${button("View history", "history", "button-secondary")}</div>`;
    }
    return `<div class="hero-card"><div class="status-line">${status("Attendance closed", "status-neutral")}<span class="small muted">Today</span></div><h2>Today's attendance has ended</h2><p>If you were physically present and need help, contact an Administrator.</p>${button("View history", "history", "button-secondary")}</div>`;
  }

  function renderNavigation() {
    const participantItems = [
      ["home", "Home", "⌂"],
      ["attendance", "Attendance", "✓"],
      ["history", "History", "◷"],
      ["profile", "Profile", "○"]
    ];
    const operatorItems = state.role === "admin"
      ? [["admin", "Overview", "⌂"], ["live", "Attendance", "✓"], ["participants", "Participants", "◎"], ["session-history", "History", "◷"], ["system", "More", "⋯"]]
      : [[state.session === "open" ? "ops-open" : "ops-closed", "Overview", "⌂"], ["live", "Attendance", "✓"], ["manual-queue", "Queues", "!"], ["participants", "People", "◎"], ["profile", "Profile", "○"]];
    const items = isOperator() ? operatorItems : participantItems;
    const markup = items.map(([route, label, icon]) => {
      const active = state.screen === route || (route === "home" && state.screen === "attendance") || (route === "admin" && ["roles", "config", "audit", "correction", "sheets", "roster", "photos", "closed-admin", "system"].includes(state.screen));
      return `<button type="button" class="nav-link ${active ? "active" : ""}" data-route="${route}" ${active ? "aria-current=\"page\"" : ""}><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>${route === "manual-queue" && state.manual === "pending" ? `<span class="nav-count">2</span>` : ""}</button>`;
    }).join("");
    desktopNav.innerHTML = markup;
    mobileNav.innerHTML = markup;
  }

  function renderBreadcrumb() {
    const current = screenNames[state.screen] || "Prototype";
    const parent = isOperator() ? roleNames[state.role] : "Participant";
    breadcrumb.innerHTML = state.screen === "home" || state.screen === "admin"
      ? `<span>${parent}</span>`
      : `<button type="button" data-route="${homeRoute()}">${parent}</button><span aria-hidden="true"> / </span><span>${current}</span>`;
  }

  function renderScreen() {
    if (!state.auth && !["login", "register", "forgot"].includes(state.screen)) state.screen = "login";
    const screens = {
      login: loginScreen,
      register: registerScreen,
      "registration-success": registrationSuccessScreen,
      verify: verificationScreen,
      forgot: forgotScreen,
      home: participantHomeScreen,
      attendance: attendanceScreen,
      processing: processingScreen,
      success: successScreen,
      "not-open": notOpenScreen,
      location: locationScreen,
      device: deviceScreen,
      "device-status": deviceStatusScreen,
      history: historyScreen,
      profile: profileScreen,
      "ops-closed": operatorClosedScreen,
      "session-form": sessionFormScreen,
      "ops-open": operatorOpenScreen,
      live: liveAttendanceScreen,
      "manual-queue": manualQueueScreen,
      "manual-detail": manualDetailScreen,
      "device-queue": deviceQueueScreen,
      "device-detail": deviceDetailScreen,
      participants: participantsScreen,
      "session-history": sessionHistoryScreen,
      admin: adminOverviewScreen,
      roles: rolesScreen,
      config: configScreen,
      audit: auditScreen,
      correction: correctionScreen,
      sheets: sheetsScreen,
      roster: rosterScreen,
      photos: photoQueueScreen,
      "closed-admin": closedAdminScreen,
      system: systemScreen
    };
    root.innerHTML = (screens[state.screen] || participantHomeScreen)();
    renderBreadcrumb();
    renderNavigation();

    if (state.screen === "attendance" && state.auth && state.session === "open" && state.device === "registered" && !state.attendance && !state.autoAttemptStarted) {
      state.autoAttemptStarted = true;
      window.setTimeout(startCheckin, 450);
    }
    if (state.screen === "registration-success" && state.returnToCheckin && !state.autoAttemptStarted) {
      state.autoAttemptStarted = true;
      window.setTimeout(() => {
        state.returnToCheckin = false;
        navigate("attendance");
      }, 900);
    }
  }

  function render() {
    document.getElementById("scenario-role").value = state.role;
    document.getElementById("scenario-session").value = state.session;
    document.getElementById("scenario-device").value = state.device;
    document.getElementById("scenario-location").value = state.location;
    document.getElementById("scenario-manual").value = state.manual;
    renderScreen();
  }

  function loginScreen() {
    return `<div class="auth-layout"><section class="card auth-card"><div class="auth-intro"><span class="brand-mark" aria-hidden="true">K</span><p class="eyebrow">Shared login</p><h1>Welcome back</h1><p>Log in to view attendance or continue your check-in.</p></div><div class="stack">${field("Email or serial number", "text", "amina@example.com", "You can use your email or KSA-XX serial.", "login-identifier")}${field("Password", "password", "••••••••", "", "login-password")}</div><div class="form-actions"><button type="button" class="button button-primary button-full" data-action="login">Log in</button></div><div class="auth-links"><button type="button" class="button button-link" data-route="forgot">Forgot password?</button><button type="button" class="button button-link" data-route="register">Create account</button></div><div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><p>Prototype state: a successful login returns you to the page you were trying to open.</p></div></section></div>`;
  }

  function registerScreen() {
    return `<div class="auth-layout"><section class="card auth-card auth-card-wide"><div class="auth-intro"><span class="brand-mark" aria-hidden="true">K</span><p class="eyebrow">Participant registration</p><h1>Create your account</h1><p>Use the details on your approved Kora Sales Academy roster.</p></div><div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><div><strong>Registration is roster-based</strong><p>Your serial number and one matching detail must be found on the approved class list. Disputes go to an Administrator.</p></div></div><div class="form-grid">${field("Full name", "text", "Amina Okafor")}${field("Phone number", "tel", "+234 801 234 5678", "Phone numbers are unique.")}${field("Email", "email", "amina@example.com")}${field("Serial number", "text", "KSA-07", "Example: KSA-07")}${field("Password", "password", "••••••••")}</div><div class="photo-upload"><div><strong>Upload a clear identification photo</strong><span>Maximum 8 MB · the server safely processes the image</span><br />${button("Choose photo", "", "button-secondary", "photo-selected")}</div></div><div class="notice notice-warning"><span class="notice-icon" aria-hidden="true">!</span><div><strong>This browser becomes your attendance browser</strong><p>Clearing site data or changing browsers may require a device-change request.</p></div></div><div class="form-actions"><button type="button" class="button button-primary button-full" data-action="register-account">Create account</button></div><div class="auth-links"><span class="small muted">Already have an account?</span><button type="button" class="button button-link" data-route="login">Log in</button></div></section></div>`;
  }

  function registrationSuccessScreen() {
    const followUp = state.returnToCheckin ? `<div class="notice notice-info"><span class="notice-icon" aria-hidden="true">→</span><p>Returning you to attendance automatically…</p></div>` : `<div class="form-actions">${button("Continue", "home", "button-primary button-full")}${button("View verification status", "verify", "button-secondary button-full")}</div>`;
    return `<div class="auth-layout"><section class="card auth-card center-copy-wrap"><div class="success-mark" aria-hidden="true">✓</div><p class="eyebrow">Account created</p><h1 class="big-status">You're ready to attend</h1><p class="center-copy">Amina Okafor · KSA-07</p><div class="stack success-stack"><div class="notice notice-success"><span class="notice-icon" aria-hidden="true">✓</span><div><strong>This browser is registered</strong><p>Use this browser for attendance. If you change browsers, request approval for the new one.</p></div></div><div class="notice notice-info"><span class="notice-icon" aria-hidden="true">✉</span><div><strong>Verification email sent</strong><p>Email verification is not required for attendance. It is required for self-service password recovery.</p></div></div></div>${followUp}</section></div>`;
  }

  function verificationScreen() {
    if (state.emailVerified) return `<div class="auth-layout"><section class="card auth-card center-copy-wrap"><div class="success-mark" aria-hidden="true">✓</div><p class="eyebrow">Email verification</p><h1 class="big-status">Email verified</h1><p class="center-copy">Your email can now be used for self-service password recovery.</p>${button("Continue to home", "home", "button-primary button-full")}</section></div>`;
    return `<div class="auth-layout"><section class="card auth-card"><div class="auth-intro"><p class="eyebrow">Email verification</p><h1>Check your inbox</h1><p>We sent a verification link to <strong>amina@example.com</strong>.</p></div><div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><div><strong>Attendance is not blocked</strong><p>You can still attend while your email is unverified. Verification is needed for password recovery.</p></div></div><div class="form-actions"><button type="button" class="button button-primary button-full" data-action="verify-email">Simulate opening verification link</button><button type="button" class="button button-secondary button-full" data-action="resend-email">Resend verification email</button></div><button type="button" class="button button-link" data-route="home">Back to home</button></section></div>`;
  }

  function forgotScreen() {
    return `<div class="auth-layout"><section class="card auth-card"><div class="auth-intro"><p class="eyebrow">Password recovery</p><h1>Reset your password</h1><p>Enter your verified email address. We will always show the same response.</p></div>${field("Email", "email", "amina@example.com") }<div class="form-actions"><button type="button" class="button button-primary button-full" data-action="forgot-password">Send recovery email</button></div><div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><p>For safety, we do not reveal whether an account or verified email exists.</p></div><button type="button" class="button button-link" data-route="login">Back to log in</button></section></div>`;
  }

  function participantHomeScreen() {
    const deviceNotice = state.device !== "registered" ? `<div class="notice notice-warning"><span class="notice-icon" aria-hidden="true">!</span><div><strong>This browser needs approval</strong><p>Your account works, but attendance requires your approved browser.</p>${button("Request device change", "device", "button-secondary")}</div></div>` : "";
    return page(`Good morning, Amina`, `KSA-07 · Participant`, "") + `<div class="stack">${attendanceStateCard()}${deviceNotice}<div class="grid grid-3">${stat("Attendance rate", "87%", "Across applicable sessions", "↗")}${stat("Sessions attended", "13", "Out of 15 applicable", "✓")}${stat("Pending reviews", state.manual === "pending" ? "1" : "0", "Manual verification", "!")}</div>${card("Recent attendance", `<ul class="list"><li class="list-item"><div class="list-main"><strong>Wednesday, 04 September</strong><span>10:14 AM · QR attendance</span></div>${status("Present", "status-success")}</li><li class="list-item"><div class="list-main"><strong>Monday, 02 September</strong><span>10:08 AM · QR attendance</span></div>${status("Present", "status-success")}</li><li class="list-item"><div class="list-main"><strong>Wednesday, 28 August</strong><span>Manual approval</span></div>${status("Present", "status-purple")}</li></ul>`)} </div>`;
  }

  function attendanceScreen() {
    const meta = session();
    if (state.session !== "open") return notOpenScreen();
    if (state.attendance) return successScreen(true);
    if (state.device !== "registered") return deviceScreen();
    return page("Attendance", "The QR route starts your check-in automatically. Your attendance is decided by the server.") + `<div class="grid grid-2"><div class="stack"><div class="process-card card"><div class="process-ring" aria-hidden="true"></div><p class="eyebrow">Attendance</p><h1>Starting check-in…</h1><p class="center-copy">Your browser will ask for location permission for this attendance attempt.</p></div>${card("Today's session", `${sessionCard()}<div class="divider"></div><p class="small">There is no extra Check in button. The QR visit is the attendance attempt, and the browser permission prompt is the required consent step.</p>`)}</div><div class="qr-card"><div class="qr-placeholder"><span>CHECK-IN<br />QR</span></div><p class="small muted">Permanent venue QR</p></div></div>`;
  }

  function processingScreen() {
    return `<div class="process-card card"><div class="process-ring" aria-hidden="true"></div><p class="eyebrow">Attendance</p><h1>Verifying attendance…</h1><p class="center-copy">This should only take a moment.</p></div>`;
  }

  function successScreen(already = false) {
    return `<div class="process-card card"><div class="success-mark" aria-hidden="true">✓</div><p class="eyebrow">Attendance confirmed</p><h1 class="big-status">${already ? "You're already checked in" : "You're present"}</h1><p class="center-copy">Amina Okafor · KSA-07</p><div class="notice notice-success"><span class="notice-icon" aria-hidden="true">✓</span><p>Recorded today at <strong>10:14 AM</strong>. You can close this page.</p></div><div class="form-actions">${button("View attendance history", "history", "button-primary button-full")}${button("Back to home", "home", "button-secondary button-full")}</div></div>`;
  }

  function notOpenScreen() {
    const meta = session();
    const message = state.session === "scheduled" ? "Attendance is not currently open." : state.session === "cancelled" ? "This attendance session was cancelled." : state.session === "missing" ? "There is no attendance session today." : "Today's attendance session has ended.";
    return page("Attendance status", "The permanent QR code stays available, even when a session is not accepting attendance.") + `<div class="process-card card"><div class="metric-icon" aria-hidden="true">i</div><h1 class="big-status">${message}</h1><p class="center-copy">${state.session === "scheduled" ? `It is scheduled for ${meta.start} – ${meta.end}.` : "No attendance record was created."}</p><div class="form-actions">${button("Back to home", "home", "button-primary button-full")}${state.role === "participant" ? button("View history", "history", "button-secondary button-full") : ""}</div></div>`;
  }

  function locationScreen() {
    const configs = {
      uncertain: { title: "We couldn't confirm your location", text: "Your attempt has been sent for manual review because the reading was not reliable enough.", tone: "notice-warning", code: "LOCATION_UNCERTAIN", auto: true },
      denied: { title: "Location permission is off", text: "Turn on location for this site and try again. If you are physically present, you can request manual verification.", tone: "notice-info", code: "LOCATION_PERMISSION_DENIED" },
      timeout: { title: "Location took too long", text: "Try again in a place with a clearer view of the sky. If you are physically present, you can request manual verification.", tone: "notice-info", code: "LOCATION_TIMEOUT" },
      remote: { title: "Attendance can only be recorded at the venue", text: "If you are physically present, tell the Course Representative what happened and request manual verification.", tone: "notice-warning", code: "CLEARLY_REMOTE" },
      pass: { title: "Location ready", text: "Try the attendance check again.", tone: "notice-info", code: "LOCATION_UNCERTAIN" }
    };
    const config = configs[state.location];
    const caseBlock = config.auto || state.caseCreated ? `<div class="notice notice-warning"><span class="notice-icon" aria-hidden="true">!</span><div><strong>${state.caseCreated || config.auto ? "Manual review pending" : "Manual review"}</strong><p>${state.caseCreated || config.auto ? "The Course Representative can see this in the review queue." : "Request help if you are physically present."}</p></div></div>` : "";
    const requestButton = config.auto || state.caseCreated ? button("Check approval status", "manual-detail", "button-secondary button-full") : button("Request Manual Verification", "", "button-primary button-full", "request-manual");
    return page("Location review", "We do not keep your exact coordinates. Choose the next safe step.") + `<div class="process-card card"><div class="metric-icon" aria-hidden="true">${config.code === "CLEARLY_REMOTE" ? "!" : "i"}</div><h1 class="big-status">${config.title}</h1><p class="center-copy">${config.text}</p>${caseBlock}<div class="form-actions">${button("Try again", "", "button-primary button-full", "retry-location")}${requestButton}</div><button type="button" class="button button-link" data-route="home">Back to home</button></div>`;
  }

  function deviceScreen() {
    return page("This browser needs approval", "Your account remains available, but attendance is limited to your approved browser.") + `<div class="grid grid-2"><div class="stack">${card("Attendance browser", `<div class="status-line">${status("Not approved", "status-warning")}</div><p>This browser is different from the one registered to your account.</p>${state.deviceRequest === "pending" ? `<div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><p>Your device-change request is pending review.</p></div>` : button("Request device change", "", "button-primary button-full", "request-device")}`)}${card("What happens next", `<ol class="small muted"><li>Submit the request from this browser.</li><li>Show your identity to the Course Representative.</li><li>After approval, this browser becomes active.</li></ol>`)}</div><div class="card card-quiet"><div class="person-mark large" aria-hidden="true">AO</div><h3 style="margin-top:14px">Amina Okafor</h3><p class="small">KSA-07 · Participant</p>${button("View request status", "device-status", "button-secondary button-full")}</div></div>`;
  }

  function deviceStatusScreen() {
    const request = state.deviceRequest === "pending" ? `<div class="notice notice-warning"><span class="notice-icon" aria-hidden="true">!</span><div><strong>Waiting for review</strong><p>Requested today at 10:25 AM. See the Course Representative in person.</p></div></div>` : state.deviceRequest === "approved" ? `<div class="notice notice-success"><span class="notice-icon" aria-hidden="true">✓</span><div><strong>Browser approved</strong><p>You can continue attendance while the session remains eligible.</p></div></div>` : `<div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><div><strong>No request yet</strong><p>Request approval when you are ready to use this browser for attendance.</p></div></div>`;
    return page("Device status", "Login and attendance-device approval are separate.") + `<div class="grid grid-2">${card("This browser", `${status(state.deviceRequest === "approved" ? "Registered browser" : "Unrecognized browser", state.deviceRequest === "approved" ? "status-success" : "status-warning")}<p class="small">The attendance browser credential is separate from your login session.</p>`)}${card("Request status", `${request}${button("Back to profile", "profile", "button-secondary")}`)}</div>`;
  }

  function historyScreen() {
    return page("Attendance history", "Your attendance record across applicable class sessions.") + `<div class="card"><div class="card-heading"><div><h2>September 2026</h2><p>13 present · 1 absent · 2 not applicable</p></div>${status("87%", "status-success")}</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Session</th><th>Result</th><th>Method</th></tr></thead><tbody><tr><td><strong>04 Sep 2026</strong></td><td>10:00 AM – 1:00 PM</td><td>${status("Present", "status-success")}</td><td>QR · 10:14 AM</td></tr><tr><td><strong>02 Sep 2026</strong></td><td>10:00 AM – 1:00 PM</td><td>${status("Present", "status-success")}</td><td>QR · 10:08 AM</td></tr><tr><td><strong>28 Aug 2026</strong></td><td>10:00 AM – 1:00 PM</td><td>${status("Present", "status-purple")}</td><td>Manual approval</td></tr><tr><td><strong>26 Aug 2026</strong></td><td>—</td><td>${status("N/A", "status-neutral")}</td><td>Before enrollment</td></tr></tbody></table></div><ul class="list mobile-list"><li class="list-item"><div class="list-main"><strong>04 Sep 2026</strong><span>10:00 AM – 1:00 PM · QR at 10:14 AM</span></div>${status("Present", "status-success")}</li><li class="list-item"><div class="list-main"><strong>28 Aug 2026</strong><span>10:00 AM – 1:00 PM · Manual approval</span></div>${status("Present", "status-purple")}</li><li class="list-item"><div class="list-main"><strong>26 Aug 2026</strong><span>Before enrollment · excluded from percentage</span></div>${status("N/A", "status-neutral")}</li></ul></div>`;
  }

  function profileScreen() {
    const verified = state.emailVerified ? status("Verified", "status-success") : status("Unverified", "status-warning");
    const photo = state.photoStatus === "pending" ? status("Replacement pending", "status-warning") : state.photoStatus === "approved" ? status("Updated", "status-success") : status("On file", "status-success");
    return page("Profile", "Manage your account and attendance browser.", button("Log out", "", "button-quiet", "logout")) + `<div class="grid grid-2">${card("Account details", `<div class="stack">${field("Full name", "text", "Amina Okafor")}${field("Phone number", "tel", "+234 801 234 5678")}${field("Email", "email", "amina@example.com")}${field("Serial number", "text", "KSA-07", "Your serial number cannot be changed here.")}</div><div class="divider"></div><div class="list-item"><div class="list-main"><strong>Email verification</strong><span>${state.emailVerified ? "Verified for password recovery." : "Verification does not block attendance."}</span></div>${verified}</div>${button("View verification status", "verify", "button-secondary")}`)}${card("Identity and browser", `<div class="list"><div class="list-item"><div class="list-main"><strong>Identification photo</strong><span>Private · only shown during an authorized review</span></div>${photo}</div><div class="list-item"><div class="list-main"><strong>Attendance browser</strong><span>${state.device === "registered" ? "This browser is approved." : "This browser needs approval."}</span></div>${state.device === "registered" ? status("Registered", "status-success") : status("Action needed", "status-warning")}</div></div><div class="form-actions">${button("Request photo replacement", "", "button-secondary", "request-photo")}${button("Manage device", "device-status", "button-secondary")}</div></section>`)} </div>`;
  }

  function operatorClosedScreen() {
    const scheduled = state.session === "scheduled";
    const cancelled = state.session === "cancelled";
    const title = scheduled ? "Session scheduled" : cancelled ? "Session cancelled" : "Attendance closed";
    const description = scheduled ? "The session is inert until its scheduled start time." : cancelled ? "The cancelled session is retained for audit and excluded from reporting." : "Prepare the next attendance session or review today's activity.";
    return page(title, description, button("Session history", "session-history", "button-secondary")) + `<div class="stack"><div class="hero-card"><div class="status-line">${status(session().label, session().pill)}<span class="small muted">Today · Africa/Lagos</span></div><h2>${scheduled ? "Upcoming session" : cancelled ? "No check-ins will be accepted" : "Ready for the next class"}</h2><p>${session().start} – ${session().end}. The default session duration is three hours, and these resolved clock times are what participants see.</p><div class="hero-actions">${scheduled ? button("Open session now", "", "button-primary", "open-session") : button("Open attendance", "session-form", "button-primary")}${!scheduled && !cancelled ? button("Schedule future session", "session-form", "button-secondary") : ""}</div></div><div class="grid grid-3">${stat("Registered participants", "28", "Approved roster", "◎")}${stat("Manual reviews", state.manual === "pending" ? "2" : "0", "Needs attention", "!")}${stat("Device requests", "1", "Waiting for review", "⌁")}</div>${card("Recent sessions", `<ul class="list"><li class="list-item"><div class="list-main"><strong>04 September 2026</strong><span>Closed · ${people.filter(p => p.status === "Present").length + 8} present</span></div>${status("Closed", "status-neutral")}</li><li class="list-item"><div class="list-main"><strong>02 September 2026</strong><span>Closed · 25 present</span></div>${status("Closed", "status-neutral")}</li></ul>`)}</div>`;
  }

  function sessionFormScreen() {
    return page("Set up attendance", "Create an open session now or schedule it for later.") + `<div class="grid grid-2"><section class="card"><div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><div><strong>Default duration: 3 hours</strong><p>Times are shown in Africa/Lagos and can be edited before saving.</p></div></div><div class="form-grid"><div class="field"><label for="session-date">Attendance date</label><input id="session-date" type="date" value="2026-09-04" /></div><div class="field"><label for="session-start">Start time</label><input id="session-start" type="time" value="10:00" /></div><div class="field"><label for="session-end">End time</label><input id="session-end" type="time" value="13:00" /><small>Resolved range: 10:00 AM – 1:00 PM</small></div><div class="field"><label for="session-mode">Start mode</label><select id="session-mode"><option>Open now</option><option>Schedule for later</option></select></div></div><div class="form-actions"><button type="button" class="button button-primary" data-action="open-session">Open attendance</button><button type="button" class="button button-secondary" data-action="schedule-session">Schedule attendance</button></div></section><div class="qr-card"><div class="qr-placeholder"><span>CHECK-IN<br />QR</span></div><p class="small muted">The permanent QR is public and never acts as a secret.</p></div></div>`;
  }

  function operatorOpenScreen() {
    const warning = state.sessionExtended ? `<div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><p>End time extended. The change was recorded in the audit history.</p></div>` : `<div class="notice notice-warning"><span class="notice-icon" aria-hidden="true">!</span><div><strong>Session closes soon</strong><p>Extend the open session now if the class needs more time.</p></div></div>`;
    return page("Attendance is open", "Monitor the current session and resolve exceptions.", button("View live attendance", "live", "button-primary")) + `<div class="stack"><div class="hero-card"><div class="status-line">${status("Attendance open", "status-success")}<span class="small muted">${session().start} – ${session().end} · Africa/Lagos</span></div><h2>Today's check-in is live</h2><p>Database records determine attendance. Google Sheets updates happen in the background.</p><div class="hero-actions">${button("Extend end time", "", "button-secondary", "extend-session")}${button("Close attendance", "", "button-secondary", "close-session")}${button("Cancel session", "", "button-danger", "cancel-session")}</div></div>${warning}<div class="grid grid-3">${stat("Present now", "24", "Live count · polling", "✓")}${stat("Manual reviews", state.manual === "pending" ? "2" : "0", "Pending cases", "!")}${stat("Device requests", "1", "Pending review", "⌁")}</div><div class="grid grid-2">${card("Manual verification", `<p class="small">Uncertain location results appear here automatically. Other location failures require an explicit participant request.</p>${button("Open review queue", "manual-queue", "button-primary")}`)}${card("Device changes", `<p class="small">Review the participant identity before approving a replacement browser.</p>${button("Open device queue", "device-queue", "button-secondary")}`)}</div></div>`;
  }

  function liveAttendanceScreen() {
    return page("Live attendance", "Current-session records, refreshed with simple polling.", button("Refresh", "", "button-secondary", "refresh")) + `<div class="card"><div class="card-heading"><div><h2>04 September 2026</h2><p>${session().start} – ${session().end} · ${people.filter(p => p.status === "Present").length + 21} present</p></div>${status("Live", "status-success")}</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Participant</th><th>Checked in</th><th>Method</th><th>Status</th></tr></thead><tbody>${people.map(p => `<tr><td>${person(p)}</td><td>${p.time}</td><td>${p.method}</td><td>${status(p.status, p.status === "Present" ? "status-success" : "status-warning")}</td></tr>`).join("")}</tbody></table></div><ul class="list mobile-list">${people.map(p => `<li class="list-item"><div class="list-main">${person(p)}<span>${p.time} · ${p.method}</span></div>${status(p.status, p.status === "Present" ? "status-success" : "status-warning")}</li>`).join("")}</ul></div>`;
  }

  function manualQueueScreen() {
    const pending = state.manual === "pending" || state.caseCreated;
    return page("Manual verification", "Review participants whose attendance needs a human decision.", button("Live attendance", "live", "button-secondary")) + `<div class="card"><div class="card-heading"><div><h2>Pending review</h2><p>Cases are saved in the queue so a missed notification does not lose work.</p></div>${status(pending ? "2 pending" : "No pending cases", pending ? "status-warning" : "status-success")}</div>${pending ? `<ul class="list"><li class="list-item"><div class="list-main">${person(people[3], "Location uncertain · expires 1:15 PM")}</div>${button("Review", "manual-detail", "button-secondary")}</li><li class="list-item"><div class="list-main">${person({ initials: "SM", name: "Sarah Mohammed", serial: "KSA-03" }, "Participant request · expires 1:15 PM")}</div>${button("Review", "manual-detail", "button-secondary")}</li></ul>` : `<div class="empty-state"><strong>No manual verifications are waiting.</strong><span>New uncertain results will appear here during an open session.</span></div>`}</div>`;
  }

  function manualDetailScreen() {
    const statusText = state.manual === "approved" ? "Approved" : state.manual === "rejected" ? "Rejected" : state.manual === "expired" ? "Expired" : "Pending";
    const tone = state.manual === "approved" ? "status-success" : state.manual === "rejected" || state.manual === "expired" ? "status-danger" : "status-warning";
    const decision = state.manual === "pending" ? `<div class="form-actions">${button("Approve attendance", "", "button-primary", "approve-case")}${button("Reject", "", "button-danger", "reject-case")}</div>` : `<div class="notice ${state.manual === "approved" ? "notice-success" : "notice-warning"}"><span class="notice-icon" aria-hidden="true">${state.manual === "approved" ? "✓" : "!"}</span><p>${state.manual === "approved" ? "Manual attendance was recorded and the participant can see the result." : state.manual === "expired" ? "This case expired at session close plus 15 minutes. Only Admin historical correction can address it." : "The participant was not marked present."}</p></div>`;
    return page("Manual verification detail", "Confirm physical presence using the protected identity information available to the reviewer.", button("Back to queue", "manual-queue", "button-secondary")) + `<div class="card"><div class="review-detail-grid"><div><div class="photo-review"><div><div class="photo-placeholder" aria-label="Fictional participant photo placeholder">FE</div><p class="photo-caption">Fictional photo placeholder<br />Private review access</p></div></div></div><div class="stack"><div class="status-line">${status(statusText, tone)}<span class="small muted">Expires 1:15 PM</span></div><div>${person(people[3])}</div><div class="divider"></div><dl class="detail-list"><div><dt>Reason</dt><dd>Location uncertain</dd></div><div><dt>Attempted</dt><dd>Today at 10:26 AM</dd></div><div><dt>Creation</dt><dd>Automatically created after an uncertain result</dd></div></dl><div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><p>This review is visible to the Course Rep and Administrator. A Course Rep cannot approve their own attendance.</p></div>${decision}</div></div></div>`;
  }

  function deviceQueueScreen() {
    return page("Device changes", "Review requests to use a different attendance browser.") + `<div class="card"><div class="card-heading"><div><h2>Pending requests</h2><p>Approval revokes the previous browser immediately.</p></div>${status("1 pending", "status-warning")}</div><ul class="list"><li class="list-item"><div class="list-main">${person({ initials: "FE", name: "Fatima Eze", serial: "KSA-24" }, "Requested today at 10:25 AM")}</div>${button("Review", "device-detail", "button-secondary")}</li></ul></div>`;
  }

  function deviceDetailScreen() {
    return page("Device change detail", "Review the participant before changing the approved attendance browser.", button("Back to queue", "device-queue", "button-secondary")) + `<div class="card"><div class="review-detail-grid"><div><div class="photo-review"><div><div class="photo-placeholder" aria-label="Fictional participant photo placeholder">FE</div><p class="photo-caption">Fictional photo placeholder<br />Private review access</p></div></div></div><div class="stack"><div class="status-line">${status("Pending", "status-warning")}<span class="small muted">Today at 10:25 AM</span></div>${person({ initials: "FE", name: "Fatima Eze", serial: "KSA-24" })}<div class="notice notice-warning"><span class="notice-icon" aria-hidden="true">!</span><p>Approval activates this browser and revokes the participant's previous one.</p></div><div class="field"><label for="device-review-reason">Decision reason</label><textarea id="device-review-reason">Identity confirmed in person.</textarea></div><div class="form-actions">${button("Approve browser", "", "button-primary", "approve-device")}${button("Reject", "", "button-danger", "reject-device")}</div></div></div></div>`;
  }

  function participantsScreen() {
    return page("Participants", "Search only the information needed for current operations.", `<button type="button" class="button button-secondary">Search</button>`) + `<div class="card"><div class="field"><label for="participant-search">Search by name, serial or email</label><input id="participant-search" type="search" value="" placeholder="Try Amina or KSA-07" /></div><div class="divider"></div><ul class="list">${people.map(p => `<li class="list-item"><div class="list-main">${person(p)}</div>${button("View", "manual-detail", "button-secondary")}</li>`).join("")}</ul></div>`;
  }

  function sessionHistoryScreen() {
    return page("Session history", "Actual class events, their status and their reporting impact.") + `<div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Time</th><th>Status</th><th>Present</th><th>Actions</th></tr></thead><tbody><tr><td><strong>04 Sep 2026</strong></td><td>10:00 AM – 1:00 PM</td><td>${status("Closed", "status-neutral")}</td><td>24</td><td>${button("Details", "live", "button-secondary")}</td></tr><tr><td><strong>02 Sep 2026</strong></td><td>10:00 AM – 1:00 PM</td><td>${status("Closed", "status-neutral")}</td><td>25</td><td>${button("Details", "live", "button-secondary")}</td></tr><tr><td><strong>28 Aug 2026</strong></td><td>10:00 AM – 1:00 PM</td><td>${status("Cancelled", "status-danger")}</td><td>—</td><td>${button("Details", "closed-admin", "button-secondary")}</td></tr></tbody></table></div><ul class="list mobile-list"><li class="list-item"><div class="list-main"><strong>04 Sep 2026</strong><span>10:00 AM – 1:00 PM · 24 present</span></div>${status("Closed", "status-neutral")}</li><li class="list-item"><div class="list-main"><strong>28 Aug 2026</strong><span>Cancelled · excluded from denominator</span></div>${status("Cancelled", "status-danger")}</li></ul></div>`;
  }

  function adminOverviewScreen() {
    return page("Administrator overview", "Full operational visibility for the single Kora Sales Academy course.", button("System operations", "system", "button-secondary")) + `<div class="stack"><div class="hero-card"><div class="status-line">${status(session().label, session().pill)}<span class="small muted">${session().start} – ${session().end}</span></div><h2>Today's attendance operations</h2><p>Use the same live workflow as the Course Rep, with access to configuration, audit, correction and recovery.</p><div class="hero-actions">${state.session === "open" ? button("View live attendance", "live", "button-primary") : button("Open attendance", "session-form", "button-primary")}${button("Review manual cases", "manual-queue", "button-secondary")}</div></div><div class="grid grid-4">${stat("Present", "24", "Today", "✓")}${stat("Pending review", "2", "Manual cases", "!")}${stat("Sheet backlog", "0", "Healthy", "↗")}${stat("Roster", "28", "26 claimed", "◎")}</div><div class="grid grid-2">${card("Administration", `<ul class="list"><li class="list-item"><div class="list-main"><strong>Authorized roster</strong><span>Import and manage participant eligibility.</span></div>${button("Open", "roster", "button-secondary")}</li><li class="list-item"><div class="list-main"><strong>Course configuration</strong><span>Venue, location policy, retention and limits.</span></div>${button("Open", "config", "button-secondary")}</li><li class="list-item"><div class="list-main"><strong>Historical correction</strong><span>Current state plus immutable before/after audit.</span></div>${button("Open", "correction", "button-secondary")}</li></ul>`)}${card("Health", `<ul class="list"><li class="list-item"><div class="list-main"><strong>Google Sheets</strong><span>Database remains authoritative.</span></div>${status("Healthy", "status-success")}</li><li class="list-item"><div class="list-main"><strong>Background worker</strong><span>PostgreSQL-backed queue.</span></div>${status("Healthy", "status-success")}</li></ul>${button("Open system operations", "system", "button-secondary")}`)}</div></div>`;
  }

  function rolesScreen() {
    return page("Role management", "Assign the single active Course Representative and protect Administrator access.") + `<div class="grid grid-2">${card("Course Representative", `${person({ initials: "DO", name: "David Okoro", serial: "KSA-02" })}<p class="small">Exactly one active Course Representative is allowed.</p>${button("Replace Course Rep", "", "button-secondary", "replace-rep")}`)}${card("Administrators", `<ul class="list"><li class="list-item"><div class="list-main"><strong>Grace Adeyemi</strong><span>Administrator · active</span></div>${status("Active", "status-success")}</li><li class="list-item"><div class="list-main"><strong>Final-admin protection</strong><span>The last active Administrator cannot be removed.</span></div>${status("Protected", "status-info")}</li></ul>${button("Grant Administrator", "", "button-secondary", "grant-admin")}`)}</div>`;
  }

  function configScreen() {
    return page("Course configuration", "Protected values are stored in CourseConfig and every change is audited.") + `<div class="card"><div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><div><strong>Current defaults</strong><p>Values are shown in Africa/Lagos. Pilot evidence may tune the location values later.</p></div></div><div class="form-grid">${field("Course label", "text", "Kora Sales Academy")}${field("Timezone", "text", "Africa/Lagos")}${field("Geofence radius (metres)", "number", "200")}${field("Maximum automatic accuracy (metres)", "number", "150")}${field("Clearly remote boundary (metres)", "number", "500")}${field("Location freshness (seconds)", "number", "30")}${field("Location timeout (seconds)", "number", "10")}${field("Default session duration (minutes)", "number", "180")}${field("Manual-case grace (minutes)", "number", "15")}${field("Photo retention after course (days)", "number", "90")}</div><div class="divider"></div><h3>Rate limits</h3><div class="form-grid" style="margin-top:15px">${field("Failed login / account+IP / 15 min", "number", "5")}${field("Password reset / email / hour", "number", "3")}${field("Registration / IP / hour", "number", "50")}${field("Registration / email or serial / hour", "number", "5")}${field("Attendance / account / minute", "number", "10")}${field("Admin actions / minute", "number", "20")}</div><div class="form-actions">${button("Save configuration", "", "button-primary", "save-config")}</div></div>`;
  }

  function auditScreen() {
    const events = [["Attendance recorded", "Amina Okafor · 04 Sep · 10:14 AM", "QR"], ["Manual verification approved", "David Okoro · Fatima Eze · 04 Sep · 10:31 AM", "MANUAL"], ["Session opened", "David Okoro · 04 Sep · 10:00 AM", "SESSION"], ["Course Rep assigned", "Grace Adeyemi · 02 Sep · 3:14 PM", "ROLE"]];
    return page("Audit log", "Append-oriented history for security-significant and corrective actions.") + `<div class="card"><div class="form-grid"><div class="field"><label for="audit-action">Action</label><select id="audit-action"><option>All actions</option><option>Attendance</option><option>Role changes</option><option>Corrections</option></select></div><div class="field"><label for="audit-date">Date</label><input id="audit-date" type="date" value="2026-09-04" /></div></div><div class="divider"></div><div class="timeline">${events.map(([title, detail, label]) => `<div class="timeline-item"><span class="timeline-dot" aria-hidden="true"></span><div><strong>${title}</strong><p>${detail} · ${label}</p></div></div>`).join("")}</div></div>`;
  }

  function correctionScreen() {
    return page("Historical correction", "Correct current attendance state only when justified; the before/after audit remains permanent.") + `<div class="grid grid-2"><section class="card"><div class="form-grid"><div class="field span-2"><label for="correction-session">Session</label><select id="correction-session"><option>04 September 2026 · 10:00 AM – 1:00 PM</option></select></div><div class="field span-2"><label for="correction-person">Participant</label><select id="correction-person"><option>Fatima Eze · KSA-24</option></select></div><div class="field"><label for="current-state">Current state</label><input id="current-state" type="text" value="Absent" readonly /></div><div class="field"><label for="target-state">Correct to</label><select id="target-state"><option>Present</option><option>Absent</option><option>Not applicable</option></select></div><div class="field span-2"><label for="correction-reason">Reason (required)</label><textarea id="correction-reason">Participant was physically present; manual case expired before review.</textarea></div></div><div class="form-actions">${button("Review correction", "", "button-primary", "review-correction")}</div></section><div class="card card-quiet"><p class="eyebrow">Before and after</p><div class="stack"><div><span class="small muted">Current</span><h3>Absent</h3></div><div class="divider"></div><div><span class="small muted">New</span><h3>Present · Manual correction</h3></div></div><p class="small muted">The correction records the Administrator, reason, timestamp and both values.</p></div></div>`;
  }

  function sheetsScreen() {
    return page("Google Sheets health", "Sheets is a reporting projection. Database attendance remains authoritative.") + `<div class="grid grid-3">${stat("Sync status", "Healthy", "Last successful sync 10:32 AM", "✓")}${stat("Pending jobs", "0", "PostgreSQL-backed queue", "↗")}${stat("Failed jobs", "0", "No action needed", "!")}</div><div class="grid grid-2">${card("Projection targets", `<ul class="list"><li class="list-item"><div class="list-main"><strong>Master Register</strong><span>Roster and participant status.</span></div>${status("Synced", "status-success")}</li><li class="list-item"><div class="list-main"><strong>04 September 2026</strong><span>Session tab · cancelled tabs remain marked.</span></div>${status("Synced", "status-success")}</li><li class="list-item"><div class="list-main"><strong>Summary</strong><span>N/A before enrollment is excluded from percentages.</span></div>${status("Synced", "status-success")}</li></ul>`)}${card("Recovery controls", `<p class="small">Retry and reconciliation rebuild reporting from the database. They never overwrite authoritative attendance.</p><div class="form-actions">${button("Retry failed jobs", "", "button-secondary", "retry-jobs")}${button("Reconcile projection", "", "button-primary", "reconcile")}</div>`)}</div>`;
  }

  function rosterScreen() {
    const roster = [
      ["KSA-02", "David Okoro", "Claimed", "01 Sep 2026"],
      ["KSA-07", "Amina Okafor", "Claimed", "01 Sep 2026"],
      ["KSA-12", "Tunde Balogun", "Unclaimed", "01 Sep 2026"],
      ["KSA-24", "Fatima Eze", "Disabled", "03 Sep 2026"]
    ];
    return page("Authorized roster", "Only approved roster entries can be claimed by ordinary registration.", button("Import CSV", "", "button-primary", "import-roster")) + `<div class="card"><div class="notice notice-info"><span class="notice-icon" aria-hidden="true">i</span><div><strong>Whole-file validation</strong><p>Malformed rows are shown before an import is committed. Corrections and disables never erase history.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Serial</th><th>Expected name</th><th>Status</th><th>Enrollment from</th></tr></thead><tbody>${roster.map(([serial, name, rosterStatus, date]) => `<tr><td><strong>${serial}</strong></td><td>${name}</td><td>${status(rosterStatus, rosterStatus === "Claimed" ? "status-success" : rosterStatus === "Disabled" ? "status-danger" : "status-neutral")}</td><td>${date}</td></tr>`).join("")}</tbody></table></div><ul class="list mobile-list">${roster.map(([serial, name, rosterStatus, date]) => `<li class="list-item"><div class="list-main"><strong>${serial} · ${name}</strong><span>Enrollment from ${date}</span></div>${status(rosterStatus, rosterStatus === "Claimed" ? "status-success" : rosterStatus === "Disabled" ? "status-danger" : "status-neutral")}</li>`).join("")}</ul></div>`;
  }

  function photoQueueScreen() {
    const pending = state.photoStatus === "pending";
    return page("Photo replacements", "Identification photos are identity anchors and require Administrator approval.") + `<div class="card"><div class="card-heading"><div><h2>Pending requests</h2><p>Candidate photos remain private and inactive until approved.</p></div>${status(pending ? "1 pending" : "No pending cases", pending ? "status-warning" : "status-success")}</div>${pending ? `<div class="review-detail-grid"><div><div class="photo-review"><div><div class="photo-placeholder">AO</div><p class="photo-caption">Candidate photo placeholder</p></div></div></div><div class="stack"><div>${person({ initials: "AO", name: "Amina Okafor", serial: "KSA-07" })}</div><p class="small muted">Requested today at 10:42 AM. Candidate is processed to a private JPEG before review.</p><div class="field"><label for="photo-reason">Decision reason</label><textarea id="photo-reason">New clear photo reviewed.</textarea></div><div class="form-actions">${button("Approve photo", "", "button-primary", "approve-photo")}${button("Reject", "", "button-danger", "reject-photo")}</div></div></div>` : `<div class="empty-state"><strong>No photo replacements are waiting.</strong><span>Participants may request a replacement from their profile.</span></div>`}</div>`;
  }

  function closedAdminScreen() {
    return page("Closed-session administration", "Only an Administrator can reopen or cancel a closed session.") + `<div class="card"><div class="status-line">${status("Closed", "status-neutral")}<span class="small muted">04 September 2026 · 10:00 AM – 1:00 PM</span></div><h2>04 September attendance</h2><p>The same session ID and uniqueness rules continue if you reopen it. For one missed participant, use an individual historical correction instead.</p><div class="form-grid"><div class="field"><label for="reopen-end">New closing time</label><input id="reopen-end" type="time" value="14:00" /></div><div class="field"><label for="reopen-reason">Reason (required)</label><input id="reopen-reason" type="text" value="Venue issue delayed the final check-in." /></div></div><div class="form-actions">${button("Reopen session", "", "button-primary", "reopen-session")}${button("Cancel closed session", "", "button-danger", "cancel-session")}</div></div>`;
  }

  function systemScreen() {
    return page("System operations", "Sanitized operational health for the API, worker, database and integrations.") + `<div class="grid grid-4">${stat("API", "Healthy", "Render web service", "✓")}${stat("Worker", "Healthy", "Last heartbeat 10:32 AM", "✓")}${stat("Database", "Healthy", "PostgreSQL", "✓")}${stat("Sentry", "Filtering", "Replay disabled", "i")}</div><div class="grid grid-2">${card("Background jobs", `<ul class="list"><li class="list-item"><div class="list-main"><strong>Google Sheets sync</strong><span>0 pending · 0 failed</span></div>${status("Healthy", "status-success")}</li><li class="list-item"><div class="list-main"><strong>Resend email</strong><span>Verification and recovery messages</span></div>${status("Healthy", "status-success")}</li><li class="list-item"><div class="list-main"><strong>Photo retention</strong><span>Next scheduled cleanup: course end + 90 days</span></div>${status("Scheduled", "status-info")}</li></ul>`)}${card("Observability rules", `<p class="small">Sentry and Render receive sanitized errors only. Participant names, serials, emails, phones, photos, coordinates, cookies, request bodies, signed URLs and secrets are filtered.</p>${button("Open audit log", "audit", "button-secondary")}`)}</div>`;
  }

  function navigate(route) {
    route = normalizeRoute(route);
    if (!route) return;
    if (route === "attendance" && !state.auth) {
      state.returnToCheckin = true;
      route = "login";
    }
    state.screen = route;
    state.autoAttemptStarted = false;
    window.location.hash = route;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("main-content").focus({ preventScroll: true });
  }

  function startCheckin() {
    if (state.session !== "open") return navigate("not-open");
    if (state.device !== "registered") return navigate("device");
    if (state.location === "pass") {
      navigate("processing");
      window.setTimeout(() => {
        state.attendance = true;
        navigate("success");
      }, 650);
    } else {
      navigate("location");
    }
  }

  function showToast(title, message = "") {
    const node = document.createElement("div");
    node.className = "toast";
    node.innerHTML = `<strong>${title}</strong>${message ? `<span>${message}</span>` : ""}`;
    toastRegion.appendChild(node);
    window.setTimeout(() => node.remove(), 3800);
  }

  function resetScenario() {
    Object.assign(state, initialState);
    state.screen = "home";
    showToast("Scenario reset", "The participant happy path is ready.");
    render();
  }

  document.addEventListener("click", (event) => {
    const routeTarget = event.target.closest("[data-route]");
    if (routeTarget) {
      event.preventDefault();
      navigate(routeTarget.dataset.route);
      return;
    }

    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;
    if (action === "login") {
      state.auth = true;
      showToast("Logged in", "Your check-in destination was preserved.");
      const destination = state.returnToCheckin ? "attendance" : homeRoute();
      state.returnToCheckin = false;
      navigate(destination);
    } else if (action === "register-account") {
      state.auth = true;
      state.device = "registered";
      state.emailVerified = false;
      showToast("Account created", "A verification email was queued.");
      navigate("registration-success");
    } else if (action === "verify-email") {
      state.emailVerified = true;
      showToast("Email verified", "Password recovery is now available.");
      render();
    } else if (action === "resend-email") {
      showToast("Verification email queued", "It is safe to resend this message.");
    } else if (action === "forgot-password") {
      showToast("Request accepted", "If the email is verified, a recovery link will be sent.");
    } else if (action === "start-checkin") {
      startCheckin();
    } else if (action === "retry-location") {
      state.location = "pass";
      startCheckin();
    } else if (action === "request-manual") {
      state.caseCreated = true;
      state.manual = "pending";
      showToast("Manual review requested", "The case is now visible in the review queue.");
      navigate("location");
    } else if (action === "request-device") {
      state.deviceRequest = "pending";
      showToast("Device request created", "Show the request to the Course Representative.");
      navigate("device-status");
    } else if (action === "approve-device") {
      state.deviceRequest = "approved";
      state.device = "registered";
      showToast("Browser approved", "The previous browser is now revoked.");
      navigate("device-queue");
    } else if (action === "reject-device") {
      state.deviceRequest = "rejected";
      showToast("Device request rejected", "The participant remains on the previous approved browser.");
      navigate("device-queue");
    } else if (action === "approve-case") {
      state.manual = "approved";
      state.attendance = true;
      showToast("Attendance approved", "A manual attendance record was created.");
      navigate("manual-detail");
    } else if (action === "reject-case") {
      state.manual = "rejected";
      showToast("Case rejected", "The participant was not marked present.");
      navigate("manual-detail");
    } else if (action === "extend-session") {
      state.sessionExtended = true;
      showToast("Session extended", "The new end time was recorded in the audit history.");
      navigate("ops-open");
    } else if (action === "close-session") {
      state.session = "closed";
      showToast("Attendance closed", "New automatic check-ins are no longer accepted.");
      navigate("ops-closed");
    } else if (action === "cancel-session") {
      state.session = "cancelled";
      showToast("Session cancelled", "A marked cancelled tab will be kept in Sheets.");
      navigate(state.role === "admin" ? "closed-admin" : "ops-closed");
    } else if (action === "open-session") {
      state.session = "open";
      state.sessionExtended = false;
      showToast("Attendance opened", "Participants can now check in.");
      navigate(isOperator() && state.role === "admin" ? "admin" : "ops-open");
    } else if (action === "schedule-session") {
      state.session = "scheduled";
      showToast("Session scheduled", "It stays inert until the start time.");
      navigate("ops-closed");
    } else if (action === "reopen-session") {
      state.session = "open";
      showToast("Session reopened", "Administrator reason and new closing time were audited.");
      navigate("admin");
    } else if (action === "request-photo") {
      state.photoStatus = "pending";
      showToast("Photo replacement requested", "An Administrator must approve the candidate photo.");
      navigate("profile");
    } else if (action === "approve-photo") {
      state.photoStatus = "approved";
      showToast("Photo replacement approved", "The new private photo is now the identity anchor.");
      navigate("photos");
    } else if (action === "reject-photo") {
      state.photoStatus = "rejected";
      showToast("Photo replacement rejected", "The existing photo remains active.");
      navigate("photos");
    } else if (action === "logout") {
      state.auth = false;
      state.screen = "login";
      render();
    } else if (action === "reset-scenario") {
      resetScenario();
    } else {
      showToast("Prototype action", `${actionTarget.textContent.trim()} is simulated in this mockup.`);
    }
  });

  document.addEventListener("change", (event) => {
    const id = event.target.id;
    if (id === "scenario-role") {
      state.role = event.target.value;
      state.screen = homeRoute();
      render();
    } else if (id === "scenario-session") {
      state.session = event.target.value;
      state.attendance = false;
      state.screen = homeRoute();
      render();
    } else if (id === "scenario-device") {
      state.device = event.target.value;
      state.screen = state.role === "participant" ? "home" : homeRoute();
      render();
    } else if (id === "scenario-location") {
      state.location = event.target.value;
      state.caseCreated = event.target.value === "uncertain";
      if (event.target.value !== "uncertain") state.manual = "none";
      state.screen = "location";
      render();
    } else if (id === "scenario-manual") {
      state.manual = event.target.value;
      state.caseCreated = event.target.value !== "none";
      state.screen = state.role === "participant" ? "location" : "manual-queue";
      render();
    }
  });

  window.addEventListener("hashchange", () => {
    const route = normalizeRoute(window.location.hash.slice(1));
    if (route && screenNames[route]) {
      state.screen = route;
      render();
    }
  });

  const initialRoute = normalizeRoute(window.location.hash.slice(1));
  if (initialRoute && screenNames[initialRoute]) state.screen = initialRoute;
  render();
})();
