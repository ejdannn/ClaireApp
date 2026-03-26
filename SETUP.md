# Claire — Step-by-Step Setup Guide

Welcome! This guide will walk you through everything needed to get Claire live on the internet.
**No coding required** — just follow each step in order.

---

## Overview of what you'll set up

| Step | What | Time |
|------|------|------|
| 1 | Create a free Supabase account (your database) | ~5 min |
| 2 | Run the database setup SQL | ~2 min |
| 3 | Create a free Netlify account (your website host) | ~5 min |
| 4 | Upload the files to Netlify | ~3 min |
| 5 | Add your secret keys to Netlify | ~3 min |
| 6 | Update config.js with your keys | ~2 min |
| 7 | (Optional) Set up Google Calendar | ~10 min |

Total time: ~20 minutes without Google, ~30 minutes with Google.

---

## Step 1 — Create a Supabase account

Supabase is your free database. It stores all your groups and availability data.

1. Go to **https://supabase.com** and click **Start your project**
2. Sign up with GitHub or email
3. Click **New project**
4. Fill in:
   - **Organization**: Your name or "Claire"
   - **Name**: `claire-scheduling`
   - **Database Password**: Choose a strong password and **save it somewhere safe**
   - **Region**: Pick the one closest to you
5. Click **Create new project** and wait ~2 minutes for it to set up

---

## Step 2 — Set up your database tables

1. In Supabase, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Copy and paste **all** of the following SQL, then click **Run**:

```sql
-- Create groups table
CREATE TABLE groups (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  slug        TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Create members table
CREATE TABLE members (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id     UUID REFERENCES groups(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  availability JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, email)
);

-- Allow public read/write (the links are only shared with intended people)
ALTER TABLE groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read groups"   ON groups  FOR SELECT USING (true);
CREATE POLICY "Public read members"  ON members FOR SELECT USING (true);
CREATE POLICY "Public write members" ON members FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update members" ON members FOR UPDATE USING (true);
CREATE POLICY "Public delete members" ON members FOR DELETE USING (true);
CREATE POLICY "Service write groups" ON groups  FOR ALL USING (true) WITH CHECK (true);
```

4. You should see **"Success. No rows returned"** — that means it worked!

---

## Step 3 — Get your Supabase keys

1. In Supabase, click **Settings** (gear icon) → **API**
2. You'll see two things you need — **copy them both somewhere**:
   - **Project URL** — looks like `https://abcdefghij.supabase.co`
   - **anon public** key — a long string starting with `eyJ...`
3. Also copy the **service_role** key (scroll down a bit) — this is secret, don't share it!

---

## Step 4 — Create a Netlify account

Netlify hosts your website for free.

1. Go to **https://netlify.com** and click **Sign up**
2. Sign up with GitHub (easiest) or email

---

## Step 5 — Upload your files to Netlify

**Option A: Drag & Drop (easiest)**
1. In Netlify, click **Add new site** → **Deploy manually**
2. Open your **ClaireApp** folder on your computer
3. Drag the entire **ClaireApp** folder onto the Netlify deploy area
4. Wait ~1 minute — your site will get a URL like `random-name.netlify.app`

**Option B: GitHub (recommended for future updates)**
1. Create a free GitHub account at github.com
2. Create a new repository called `claire-scheduling`
3. Upload all your ClaireApp files to it
4. In Netlify: **Add new site** → **Import from Git** → connect GitHub → pick your repo
5. Click **Deploy site**

---

## Step 6 — Add your secret keys to Netlify

This is where you give Netlify your passwords/keys so the app works.

1. In Netlify, go to your site → **Site configuration** → **Environment variables**
2. Click **Add a variable** and add each of these one at a time:

| Key | Value |
|-----|-------|
| `ADMIN_CODE` | `SquareMug` (or whatever secret code you want) |
| `SUPABASE_URL` | Your Project URL from Step 3 |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service_role key from Step 3 |

3. After adding all three, go to **Deploys** → **Trigger deploy** → **Deploy site**
   (This restarts the site so it picks up the new keys)

---

## Step 7 — Update config.js

Now open the file `js/config.js` in your ClaireApp folder with any text editor (Notepad, TextEdit, etc.) and fill in your Supabase values:

```js
window.CLAIRE_CONFIG = {
  supabaseUrl:     'https://YOUR-PROJECT.supabase.co',   // ← paste your URL
  supabaseAnonKey: 'eyJhbGc...',                          // ← paste your anon key
  googleClientId:  '',                                    // ← leave blank for now
};
```

Save the file, then **re-upload your ClaireApp folder to Netlify** (repeat Step 5).

---

## Step 8 — Test it!

1. Go to your Netlify URL (e.g. `https://random-name.netlify.app`)
2. Enter `SquareMug` (or whatever you set as `ADMIN_CODE`)
3. You should be taken to the Admin Panel!
4. Click **+ New Group**, give it a name, and copy the link
5. Open the link in a new tab — that's what your friends will see

🎉 **If that worked, you're live!**

---

## Optional: Step 9 — Set up Google Calendar integration

This lets you create Google Calendar events and send email invites directly from Claire.

### 9a. Create a Google Cloud project

1. Go to **https://console.cloud.google.com**
2. Click the project dropdown at the top → **New Project**
3. Name it `claire-scheduling`, click **Create**
4. Make sure it's selected in the dropdown

### 9b. Enable the APIs

1. Go to **APIs & Services** → **Library**
2. Search for **Google Calendar API** → click it → **Enable**
3. Go back, search for **Google Sheets API** → click it → **Enable**

### 9c. Create OAuth credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Configure Consent Screen**
   - Choose **External** → **Create**
   - App name: `Claire Scheduling`
   - User support email: your email
   - Developer contact: your email
   - Click **Save and Continue** through all steps → **Back to Dashboard**
3. Click **Credentials** → **+ Create Credentials** → **OAuth client ID**
4. Application type: **Web application**
5. Name: `Claire Web`
6. Under **Authorized JavaScript origins**, click **+ Add URI** and add:
   - `https://your-site.netlify.app` (replace with your actual Netlify URL)
   - `http://localhost` (for local testing)
7. Click **Create**
8. Copy the **Client ID** (looks like `123456789-abc.apps.googleusercontent.com`)

### 9d. Add the Client ID to your config

Open `js/config.js` and paste your Client ID:

```js
googleClientId: '123456789-abc.apps.googleusercontent.com',
```

Save and re-upload to Netlify.

### 9e. Add yourself as a test user (while in testing mode)

1. In Google Cloud Console → **APIs & Services** → **OAuth consent screen**
2. Scroll to **Test users** → **+ Add users**
3. Add your Gmail address → **Save**

Now in the Admin Panel, click **Connect** next to the Google Calendar icon to sign in!

---

## Giving your site a better name

In Netlify: **Site configuration** → **Change site name** → type something like `claire-scheduling` → Save.
Your URL becomes `claire-scheduling.netlify.app`.

---

## How to use Claire day-to-day

**Creating a new group:**
1. Log in with `SquareMug`
2. Click **+ New Group**, give it a name (e.g. "Book Club", "Study Group")
3. Copy the link and send it to your friends
4. Wait for them to fill in their availability

**Viewing availability:**
1. Click **View** on any group
2. **Members tab** — see who has responded
3. **Availability Overlay tab** — color heatmap of everyone's free times
4. **Best Times tab** — top 5 recommended meeting slots

**Scheduling a meeting:**
1. Click **Schedule Meeting** on any group
2. Pick one of the recommended times (or choose custom)
3. Add a title, location, notes
4. Check/uncheck who to invite
5. Click **Create & Send Invite** — Google Calendar creates the event and emails everyone!

**Exporting to Google Sheets:**
1. Connect Google Calendar (only needs to be done once)
2. Click **Export to Sheets** on any group — opens a spreadsheet with everyone's availability

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Supabase not configured" | Make sure you updated `js/config.js` and re-uploaded |
| "Invalid code" on login | Check `ADMIN_CODE` in Netlify environment variables |
| Group link shows "Not Found" | Make sure you ran the SQL in Step 2 |
| Google connect doesn't work | Make sure you added your Netlify URL to Authorized Origins in Google Cloud |
| Calendar invite didn't send | Make sure attendees have real email addresses |

---

## Need help?

If something isn't working, double-check:
1. Your `ADMIN_CODE`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are all set in Netlify
2. You re-deployed after adding environment variables
3. Your `js/config.js` has the correct `supabaseUrl` and `supabaseAnonKey`
4. The SQL from Step 2 ran successfully (check Supabase → Table Editor — you should see `groups` and `members` tables)
