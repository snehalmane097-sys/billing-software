# Windows continuation - 4 November 2026

The existing Windows project has the invoice management redesign. Remaining all-page summary scope text and 25-invoice payment guard have been applied. Tests now cover database reopen and encrypted restoration of cancellation/archive state. Build passes (37 modules). Final Windows verification: all 32 automated tests passed, zero failures, including actual encrypted restoration of cancellation/archive records.

http://localhost:3001 returns HTTP 200. The served HTML, JavaScript and CSS were SHA-256 compared with dist and all match the current build. Backend restart attempted but failed with EADDRINUSE. Windows denies TCP owner/process lookup (CIM unavailable; TCP owner API returns access denied), so the existing process cannot be safely identified or stopped here. Do not kill arbitrary Node processes or run a second production instance. In the known billing terminal: Ctrl+C, then npm start from C:\billingsoftware. Refresh /#invoices afterwards. The UI detects an older backend missing filtered summary data and asks for restart instead of crashing or fabricating totals.

Native browser helper cannot start: failed to launch codex app-server: program not found. Desktop/mobile visual acceptance remains pending. No real customers/invoices/payments were created or altered. Additive tables are preserved. No public deploy or source push.

