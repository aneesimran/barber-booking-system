# 🛡️ Backup & Disaster Recovery Guide

> Complete playbook for the **Anees Hairdressers Barber Booking System**.
> This system provides **automated, multi-layer protection** for both your **codebase** and your **live Cloud Firestore database**, ensuring you can experiment, build new features, and recover from any accidental deletion or breakage in seconds.

---

## ⚡ Quick Command Cheat Sheet

| Command | What it does | When to use |
| :--- | :--- | :--- |
| `npm run dev` | **Auto-checkpoints code**, then launches dev server | Standard development |
| `npm run checkpoint "label"` | Creates an instant named safety snapshot of your code | Before making risky code modifications |
| `npm run rollback` | Restores your codebase to a previous checkpoint | If a feature breaks or files are deleted |
| `npm run feature:start <name>` | Auto-snapshots code & creates isolated `feature/<name>` branch | Starting any new feature |
| `npm run backup` | Exports all live Firestore collections to timestamped JSON | Before migrations or testing database changes |
| `npm run restore:firestore` | Restores collections from backup JSON with batch writes | Recovering deleted/corrupted database records |
| `npm run restore:firestore -- --dry-run` | Previews what will be restored without writing | Verifying backup before restoring |

---

## 1. 🧑‍💻 Codebase & Feature Development Safety

When building new features, modifying existing routes, or refactoring components, code can break or files can accidentally be deleted. Your codebase has 3 automated safety nets:

### A. Automatic Pre-Dev Checkpoint (`npm run dev`)
Every time you run `npm run dev`, `scripts/auto-checkpoint.mjs` automatically inspects your repository. If changes have occurred, it automatically:
1. Creates an archival diff patch inside `backups/code/patch-auto-YYYY-MM-DD_HH-mm-ss.patch`.
2. Creates an annotated Git safety tag: `checkpoint/auto-YYYY-MM-DD_HH-mm-ss`.
3. Records the entry in `backups/code/manifest.json`.

You don't have to remember to do anything—your starting state is saved every time you work.

### B. Instant One-Command Rollback (`npm run rollback`)
If you add a feature or delete a file and need to return to a clean, working state:
```bash
# View list of available checkpoints and pick one interactively
npm run rollback

# Or rollback directly to the most recent checkpoint
npm run rollback latest

# Or view all recent checkpoints
npm run rollback --list
```
**Safety Guarantee**: Before rolling back, the rollback engine automatically shelves any current uncommitted files into a safety stash (`safety-stash-before-rollback`), ensuring you never destroy work by mistake.

### C. Safe Feature Branch Isolation (`npm run feature:start`)
Instead of developing directly on `main`, run:
```bash
npm run feature:start loyalty-points
```
This automatically:
1. Takes a safety checkpoint of your current code.
2. Creates and checks out `feature/loyalty-points`.
3. Keeps your `main` branch 100% clean, deployable, and protected from broken changes.

---

## 2. 🔥 Firebase Data Backup & Disaster Recovery

Your database contains 5 core collections:
* `appointments`
* `customers`
* `barberSchedules`
* `blockedSlots`
* `dateSchedules`

To protect this data against accidental deletions or bad migrations, three independent backup mechanisms are active:

### A. Google Cloud Continuous Point-in-Time Recovery (PITR)
Google Cloud provides real-time transaction logging for Cloud Firestore. When enabled, **every single create, update, and delete is recorded automatically 24/7**. You can restore your database to **any exact second in the past 7 days**.

#### Enable PITR (one-time setup via Google Cloud CLI):
```bash
gcloud firestore databases update --enable-pitr
```

#### Point-in-Time Recovery Command:
If data is accidentally deleted at 14:32:15 on Oct 19, 2026, restore to 14:30:00:
```bash
gcloud firestore databases restore \
  --source-database='(default)' \
  --destination-database='recovery-db' \
  --recovery-time='2026-10-19T14:30:00Z'
```

---

### B. Automated Daily Cloud Snapshots (`/api/cron/backup-database`)
An automated API endpoint is pre-configured for nightly backups:
* **Route**: `GET /api/cron/backup-database?secret=YOUR_CRON_SECRET`
* **Trigger**: Scheduled automatically by App Hosting / Google Cloud Scheduler nightly at 02:00 AM.
* **Storage**: Snapshots are saved to the secure `_system_backups` Firestore collection.
* **Retention**: Snapshots older than 30 days are pruned automatically.
* **Admin Portal Visibility**: You can log into `/admin/backups` from any device to see the list of all daily snapshots and click **"Download JSON"** or **"Restore"**.

---

### C. Admin Portal Backup & Recovery Center (`/admin/backups`)
Barbers and shop administrators can manage backups without using the terminal:
1. Go to **Admin Portal** -> Click **Backups & Recovery** in the sidebar.
2. **Export Live Database**: Click **"Export Live Database"** to download an instant `.json` file (`barber-booking-backup-YYYY-MM-DD.json`) to your computer.
3. **Save Cloud Snapshot**: Click **"Save Cloud Snapshot"** to take an instant cloud backup anytime.
4. **Restore Backup File**:
   - Click **"Restore Backup File"** and choose any `.json` backup file.
   - A modal previews the records to be restored (appointments, customers, etc.).
   - Type **RESTORE** to confirm.
   - The system restores documents with live progress bar and logs.

---

### D. Terminal & CLI Backup Commands
For developers working locally:
```bash
# Export all Firestore collections to local timestamped directory
npm run backup:firestore

# Output is saved to:
# backups/firestore/backup-YYYY-MM-DD_HH-mm-ss/
# backups/firestore/latest/full-backup.json

# Preview a restore (DRY RUN - no data modified):
npm run restore:firestore -- --dry-run

# Execute restore from the latest backup:
npm run restore:firestore

# Execute restore from a specific file:
npm run restore:firestore backups/firestore/backup-2026-10-19_20-45-00/full-backup.json
```

---

## 3. 🚨 Disaster Scenarios & Recovery Procedures

### Scenario 1: "I added a feature, but the app is broken / tests fail / files are missing"
1. Check the list of recent checkpoints:
   ```bash
   npm run rollback --list
   ```
2. Restore to the last known good state:
   ```bash
   npm run rollback latest
   ```
3. Run tests to confirm the codebase is green:
   ```bash
   npm test
   ```

### Scenario 2: "An accidental deletion removed appointments or customer records"
1. **Option A (Admin Portal)**:
   - Open `/admin/backups` in your browser.
   - Find yesterday's snapshot under **Automated Cloud Snapshots**.
   - Click **Restore** -> Type `RESTORE` -> Confirm.
2. **Option B (Terminal)**:
   - Run:
     ```bash
     npm run restore:firestore backups/firestore/latest/full-backup.json
     ```
3. **Option C (Point-in-Time Recovery)**:
   - Restore to any exact second before the deletion occurred using Google Cloud Console or `gcloud firestore databases restore`.

---

## 4. 🔒 Security & Data Privacy Note
* All local backup directories (`/backups/`) and patch archives (`*.patch`) are strictly ignored in `.gitignore`.
* **Never commit JSON backups containing customer phone numbers or emails to public git repositories.**
