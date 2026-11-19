# Calendar and session recaps

**Settings → Meetings** — optional Google Calendar integration, meeting reminders, foreground detection, and saved Listen session summaries.

## Google Calendar

Connect to see **upcoming accepted meetings** (the same events you accepted in Google Calendar).

### Connect

1. Open **Settings → Meetings**.
2. If not using bundled OAuth, enter your **Google Cloud desktop app** Client ID and Client Secret, then Save.
3. Click **Connect Google Calendar** and complete the browser OAuth flow.
4. Connected email appears in the panel.

### Disconnect and refresh

- **Refresh** — reload upcoming events.
- **Disconnect** — remove calendar access.

Calendar integration is **optional**. Session recaps work without it.

## Reminders

| Setting | Description |
|---------|-------------|
| **Start-time reminders** | Windows notification before or at meeting start |
| **Reminder minutes** | How many minutes before start to notify |

Requires calendar connected and reminders enabled.

## Meeting app detection (Windows)

**Meeting foreground detection** — polls the foreground window and shows a toast when Zoom, Microsoft Teams, Google Meet, or Webex is detected. Helps you remember to start Listen before a call.

## Session recaps

Every time you **Stop Listen**, VeilAssist may save a recap:

| Field | Content |
|-------|---------|
| Title / mode | Active profile mode name |
| Timestamps | Start time, duration |
| Summary bullets | LLM-generated or text fallback |
| Metadata | Transcript excerpts, ask count |

### View and manage recaps

**Settings → Meetings → Session recaps:**

- Browse by date
- Expand entries for preview
- **View details** — full modal with metadata
- **Export Markdown** — save recap to a file
- Delete individual recaps

### Follow-up drafts

When **Intelligence → Smart follow-up drafts** is enabled, **View details** on a recap can generate a copy-ready follow-up message from decisions and action items.

## Launcher recent sessions

The **Launcher** window (tray → Launcher) shows the three most recent recaps with time and duration for quick reference.

## Privacy

Recaps are stored **only on your device** under app userData. They are not uploaded to VeilAssist servers (there are none — BYOK goes direct to your LLM vendor).

Disable saving with **Settings → General → Do not save meetings**.
