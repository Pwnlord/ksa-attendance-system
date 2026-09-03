# KSA Attendance Mockup

This directory is for product-flow validation before the production frontend is built.

The mockup has two stages:

1. [Text-first screen specification](screens.md): content, actions, states, transitions, responsive behavior, and copy.
2. [Clickable low-fidelity prototype](index.html): plain HTML, CSS, and vanilla JavaScript using static fictional fixtures and simulated actions.

## Running the prototype

Open `index.html` in a browser, or serve this directory with any simple local static server. No package installation, backend, database, credentials, camera, location, or network connection is required.

Use the reviewer controls at the top of the page to change role, session, browser/device, location result, and manual-case status. Then use the screen actions to walk through the simulated flows.

Use `Open QR check-in route` to simulate scanning the permanent venue QR. In the prototype, both `#check-in` and `#attendance` resolve to the same attendance destination.

The prototype intentionally does not make real API calls or claim that simulated GPS, device, authentication, attendance, photo, or role decisions are authoritative.

The mockup is not a production client. It must not contain real authentication, participant data, secrets, Google credentials, real identification photos, durable attendance logic, or claims that simulated GPS/device checks are authoritative.

When a clickable prototype is added, its state controls should make every important PRD outcome easy to review: session open/closed, registered/unrecognized device, location pass/uncertain/remote, duplicate attendance, manual approval, and synchronization warning.
