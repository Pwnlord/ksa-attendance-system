# Google Sheets Integration Verification

## Current status

The application code supports both a memory Sheets provider and the real Google Sheets provider. Local automated checks verified the memory provider, the database-backed job flow, and the Sheets administration endpoints. They did **not** verify the real Kora workbook because the production Google service-account credentials and workbook were not available in the workspace.

The real staging integration is verified only after the steps below succeed and the expected tabs visibly contain data.

## One-time staging setup

1. Create or choose the Google Sheet that should receive the attendance projection.
2. Share that Sheet with the configured Google service-account email as **Editor**. The service account does not need to own the Sheet.
3. In the Render API service, set:
   - `GOOGLE_SHEETS_DRIVER=google`
   - `GOOGLE_SHEETS_SPREADSHEET_ID` to the ID between `/d/` and `/edit` in the Sheet URL
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` to the service-account email
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` to the private key; keep escaped `\n` line breaks if Render stores it on one line
4. Redeploy the API service so it loads the configuration.

## Verification procedure

1. Sign in as an Administrator in the staging frontend.
2. Open **Sheets** under Administration.
3. Confirm the Provider value says `Google`, not `Memory`.
4. Use **Queue reconciliation**, choose **Full rebuild**, and provide a reason.
5. Use **Run due background jobs**. The zero-cost deployment processes the queued job through the endpoint runner.
6. Refresh the page and confirm the health status is healthy, the failed count is zero, and a successful sync time is shown.
7. Open the Google Sheet and confirm the expected tabs and rows were written. The database remains authoritative; the Sheet is a reporting projection.

Under `OPEN_REGISTRATION`, registered Participant accounts are included even when the roster is empty. Their registration date is used as the enrollment-effective date, and their row is marked `OPEN_REGISTRATION` in the roster-status column. The expected data tabs are `Master Register`, `Summary`, and one dated tab for each attendance session. The default `Sheet1` tab is not used by the application.

If the provider is Google but the job fails, check the service-account share permission, spreadsheet ID, private-key formatting, and Google Sheets API access. The health screen shows a sanitized last error.

## Changing the target Sheet

The target Sheet is changeable without a code change or database migration:

1. Create or select the new Sheet.
2. Share it with the same service-account email as Editor.
3. Replace only `GOOGLE_SHEETS_SPREADSHEET_ID` in the Render API service.
4. Redeploy the API.
5. Run a full reconciliation from the Administrator Sheets screen and verify the new Sheet.

The old Sheet is not deleted automatically. The service creates any required tabs in the new Sheet and rewrites the projection there. Attendance records remain in Supabase/PostgreSQL and are not moved by changing the Sheet ID.

If the organization later uses a different Google account or service account, update the email and private-key variables together, share the Sheet with the new account, redeploy, and run the same full reconciliation. Do not put these credentials in the repository or frontend variables.
