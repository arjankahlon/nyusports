# Master sheet: setup

A Google Sheet with one row per study, kept in step with the Friday research meeting deck by `Code.gs` (Google Apps Script). It reads the slides with the same rules as the website, so its rows match what the site shows, and it has columns for the team's own entries (procedures, injuries, overrides, criteria) that the sync never touches.

Takes about 15 minutes, once.

## Before you start

- Use a **shared or lab Google account** if you have one. The sync runs as whoever owns the sheet, so it keeps working if someone leaves.
- That account needs at least **view access to the deck**.

## 1. Make the sheet

1. Go to [sheets.new](https://sheets.new) while signed in as that account.
2. Name it, e.g. **Prospective Studies (Sports) - Master**.

## 2. Add the script

1. In the sheet: **Extensions > Apps Script**. A code editor opens in a new tab.
2. Name the project at the top left, e.g. **Studies sync**.
3. Delete everything in `Code.gs`, paste in the whole of `sheet/Code.gs` from this repo, and click **Save** (the disk icon).
4. Click **Project Settings** (the gear on the left) and tick **Show "appsscript.json" manifest file in editor**.
5. Back in the **Editor** (the `< >` icon), open `appsscript.json`, replace everything in it with `sheet/appsscript.json` from this repo, and **Save**. This limits what the script is allowed to do (see below).

## 3. Run the setup

1. In the toolbar's function dropdown, pick **setUpSheet**, then click **Run**.
2. Google asks for permission the first time:
   - **Review permissions**, choose the account.
   - "Google hasn't verified this app" is expected for a script you wrote yourself: click **Advanced > Go to Studies sync (unsafe) > Allow**.
   - It should ask for exactly four things: **see and edit this spreadsheet** (only the one it's attached to), **see your Google Slides presentations** (view only), **run when you're not present** (the hourly sync), and **display content inside Google apps** (the Studies menu). Nothing about Drive, Gmail or editing slides. If you see more than that, the manifest from step 2 didn't save: cancel and redo it.
3. Wait for "Execution completed" (under a minute), then go back to the sheet tab and **reload** it.

You should now have:
- a **Studies** tab with a row for each study, and a **Studies** menu in the menu bar
- a **Lists** tab holding the dropdown choices

## 4. Allow several choices per cell

Google only lets you turn this on by hand. For each of **Procedures**, **Injuries / Diagnoses** and **Setting (OR / Office)**:

1. Click the column letter to select the column.
2. **Data > Data validation**. The panel on the right should show one rule for the column; click it. (Don't click **Add rule**, which stacks a second rule on top.)
3. Under **Advanced options**, set **If the data is invalid** to **Reject the input** and **Display style** to **Chip** (multiple selections stays greyed out until both are set), then tick **Allow multiple selections**. **Done**.

If the panel shows more than one rule for the column, start that column over: click **Remove all** at the bottom of the panel, then **Add rule** with:
- **Apply to range**: the column from row 2 down, e.g. `G2:G1000`
- **Criteria**: **Dropdown (from a range)**, pointing at the matching column of the Lists tab from row 2 down: `Lists!A2:A` for Procedures, `Lists!B2:B` for Injuries / Diagnoses, `Lists!C2:C` for Setting
- **Advanced options**: set **If the data is invalid** to **Reject the input** and **Display style** to **Chip**, then tick **Allow multiple selections**

## 5. Turn on the hourly sync

**Studies > Turn on hourly sync**. You can always sync right away with **Studies > Sync with slides now**.

## 6. Share it

- **Share > General access > Anyone with the link: Viewer**. The website will read the sheet this way, like it reads the deck now.
- Add the team as **Editors**.

## 7. Check it

The sheet should match the site:
- The rows without **Hide from site** ticked are the studies on the site (28 as of Oct 23, 2026), with the same Status, Area, PI and Enrolled / Target.
- MISHA RCT and "AI Responses to PRP..." are ticked **Hide from site**, as the site leaves them off.

If something differs, note which study and column and send it over.

## Using the sheet

- **Purple headers are the team's.** Edit freely; the sync never changes them.
- **Grey headers come from the slides.** They're rewritten every sync; Google warns before you edit one. To change one, change the slide (or use the override columns).
- **New study slides** get a new row at the bottom on the next sync. **Studies > Sort by slide order** tidies them.
- **Retitled or moved slides** keep their row and entries (rows are matched on the **Slide ID** column, so don't edit it).
- **Studies removed from the deck** keep their row, marked **Not in deck**. Delete the row once you're sure it's gone for good.
- **Adding a dropdown choice**: add it to its column on the **Lists** tab.
- **Adding your own column**: add a header anywhere. The sync leaves it alone.

## Changing the script

`sheet/Code.gs` in this repo is the master copy. After changing it, paste it into the Apps Script editor again and save. The slide-reading rules are ported from `public/index.html`; a change to how the site reads a slide belongs in both.
