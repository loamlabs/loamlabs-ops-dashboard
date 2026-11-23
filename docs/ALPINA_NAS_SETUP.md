# Alpina stock job on the UGREEN NAS: click-by-click steps

What this does: every 3 days at about 5:40 am the job reads Hoss's 8 Alpina spoke pages and turns Alpina spokes Hoss does not have to "sold out". It only changes sold-out / continue-selling on Alpina spoke variants. It never touches a price. Jerry types his own passwords; nobody else sees them.

You need: the NAS (Docker app already installed), your Hoss login, your Shopify app values, your Resend key and your report email. **Type the passwords only on the NAS. Never in a chat, an email, a synced folder or GitHub.**

The menus on the NAS may be named a little differently from what is written here; the words in **bold** are what to look for.

## STATUS (Nov 22, set up on the real NAS by Backend 2)
Already done for you: the folder , the Docker project **alpina-stock** (running, with the 7 values still saying TYPE_HERE), the self-test (27 passed, 0 failed) and the schedule (next check 5:43 am the next morning). What is left for Jerry: type the 7 values (below), then B and C.
- **Reading answers:** the NAS Files app cannot open text files (it only offers Download). The job therefore also prints every answer into the container log: Docker app > **Container** > **alpina-stock** > **Log** tab (it updates live). Read answers there.
- **Typing the 7 values:** Docker app > **Project** > on the **alpina-stock** card click the three dots **...** > **Settings** > the tab **Compose configuration**. The text is one long line. Find each  and type your value in its place, between the quote marks. **If a password contains a double quote or a backslash, put a backslash in front of that character.** Click **Redeploy**; in the box that appears leave "Pull the latest image" unticked and click **Deploy**. Wait 2 minutes, then look at the Log tab: it must show "SELF-TEST RESULT ... fail 0".
- **The first live read is yours** (not Backend 2's), and so is the approval.

## A. One time setup (about 15 minutes)

1. **Merge the pull request on GitHub.** Open https://github.com/loamlabs/loamlabs-ops-dashboard/compare/main...alpina-hoss-stock?expand=1 , click **Create pull request**, then **Merge pull request**, then **Confirm merge**. Then tell Lead the words `DEPLOY ALPINA STOCK`. (The job's code now lives on `main`.)
2. **Make the NAS folder.** On the NAS open **Files**. Open the shared folder **docker**. Click **New folder** and name it `alpina`. Open it and make one more folder inside called `data`. You should now have `docker/alpina/data`. (If your docker folder is on another storage than `volume1`, see "If the folder path is different" below.)
3. **Open the compose file text.** On your PC open https://github.com/loamlabs/loamlabs-ops-dashboard/blob/main/docker/alpina/docker-compose.yml , click the **Raw** button, press Ctrl+A then Ctrl+C to copy everything.
4. **Create the project.** On the NAS open the **Docker** app. Click **Project**, then **Create**. Name: `alpina-stock`. Path: choose the folder `docker/alpina`. For the compose file choose **Create docker-compose.yml** (the text editor) and paste what you copied (Ctrl+V).
5. **Type your values.** In the pasted text find the 7 lines that say `TYPE_HERE`. Replace each `TYPE_HERE` with your value, keeping the quote marks: Hoss user, Hoss password, Shopify shop name (the part before `.myshopify.com`), Shopify client id, Shopify client secret, Resend key, report email. Nothing else needs changing. (Do not worry that the self-test runs before you type them: the job refuses to sign in anywhere while a value still says TYPE_HERE.)
6. Click **Next** / **Deploy** / **OK** (the last button of the wizard). The container `alpina-stock` is created and starts. The first start takes 2 to 3 minutes (it downloads the job code).
7. **Check it works.** In **Files** open `docker/alpina/data`. Open the container **Log** tab (see STATUS above): it shows `SELF-TEST RESULT: # tests 27 # pass 27 # fail 0`. That proves the job runs on your NAS. (It uses no Hoss, no Shopify and no passwords for this test.) If the folder is empty after 5 minutes, see "What the messages mean" below.

## B. The first live read (nothing is changed in your store)

The job is controlled by small files. To give it an order, put an empty text file with the exact name into the folder `docker/alpina/data/commands`. (If the `commands` folder is not there yet, wait one minute after step 6. To make an empty text file: on your PC open Notepad, save an empty file with the name, upload it to the NAS with Files > **Upload**. File names are in small letters, ending in `.txt`.)

8. Put **read-now.txt** into `docker/alpina/data/commands`. Wait about 3 minutes (it signs in and reads 8 pages slowly on purpose).
9. Read the answer in the container **Log** tab (it prints between ----- ANSWER ----- lines). If it says **STOPPED**, read the reason (see the table below). If it says **BASELINE (nothing is written)** it worked:
   - Find the line `variants matched ...; proposed: N close (sold out), M open ...`. **N is the number of Alpina variants it would turn to sold out.** Look at the per-product list below it and the sample of 30 changes. Check they look sensible (a length that Hoss shows as "Out of stock" should be there).
   - If there is a line `NOTHING WILL BE WRITTEN FROM THIS RUN: ... the limit is 446`, that is normal for the first run. It only means the first run needs your approval (next step).
   - You also get an email "Alpina stock baseline ready for review".
10. **Approve it.** If the report looks right: make a text file called **approve.txt** with just the number N inside (digits only, for example `1234`), and put it into the `commands` folder. Wait about 5 minutes. Open `LAST_RESULT.txt`: it must say `DONE: ... changes written and read back`. The job writes an undo file named like `alpina_undo_2026-11-25.json` into `docker/alpina/data/reports`. You get an email "Alpina stock: N sold out".
11. **Look in the store:** open an Alpina spoke product in Shopify admin; the lengths Hoss does not have show as sold out ("continue selling" is off).

From now on the job runs by itself at about 5:40 am, and only does the work when 3 days have passed since its last run. Changes within the limit are written automatically after your first approval. Anything bigger than 5% of the variants, or anything odd, is NOT written and you get an email.

## C. Everything you can ask the job to do (put the file into `docker/alpina/data/commands`)

| File name | What it does | Where the answer is |
|---|---|---|
| `status.txt` | Shows whether it is paused, when the next check is, whether your values are typed, the last reports | `LAST_RESULT.txt` |
| `selftest.txt` | Runs the built-in test again (no Hoss, no Shopify) | `LAST_RESULT.txt` |
| `read-now.txt` | Reads Hoss now and shows what it would change. Changes nothing | `LAST_RESULT.txt` |
| `approve.txt` (a number inside) | Approves the first baseline and writes up to that many changes | `LAST_RESULT.txt` |
| `apply-now.txt` | Reads Hoss now and writes the changes (after the first approval) | `LAST_RESULT.txt` |
| `pause.txt` | Stops the daily checks until you send `resume.txt`. Nothing is undone | `LAST_RESULT.txt` |
| `resume.txt` | Starts the daily checks again | `LAST_RESULT.txt` |
| `undo.txt` (the undo file name inside) | Puts every changed variant back to how it was before that run | `LAST_RESULT.txt` |
Each answer is also kept in `docker/alpina/data/results`. The command file moves to `commands/done` after it has run.

## D. Undo, stop, update
- **Undo a run:** open `docker/alpina/data/reports`, find the `alpina_undo_DATE.json` of that run, make **undo.txt** containing exactly that file name (for example `alpina_undo_2026-11-25.json`), put it into `commands`. The answer lists each product put back.
- **Pause the job:** put `pause.txt` in `commands`. **Stop it completely:** Docker app > **Project** > `alpina-stock` > **Stop**. Start again with **Start**.
- **Get newer code later:** Docker app > Project > `alpina-stock` > **Stop**, then **Start**. It downloads the latest `main` each time it starts (the status page shows which version in `data/code_version.txt`).
- **See the container log:** Docker app > **Container** > `alpina-stock` > look for **Log** (or **Details**). If you cannot find it, open `docker/alpina/data/job.log` in Files: it has the same lines.
- **Confirm the next scheduled run:** put `status.txt` in `commands`; the line "next scheduled check" shows the time (about 5:40 to 5:55 am). The morning after it ran, `job.log` has "scheduled check finished". A skipped day says "skipped: last run ..., interval is 3 days": that is normal.

## E. What the messages mean (they are in LAST_RESULT.txt, the log and the alert email)
| Message | What it means and what to do |
|---|---|
| `NOT RUN. These values are not typed yet ...` | A line in the project still says TYPE_HERE. Docker > Project > Edit, type it, Save, Stop, Start |
| `STOPPED ... login did not succeed` | Hoss refused the user or password, or their login page changed. Check the login by hand in your browser; retype the values if wrong. Nothing was changed |
| `STOPPED ... robots.txt disallows` | Hoss's site now says "no robots" for the pages. The job will not read. Nothing changed; tell Lead |
| `STOPPED ... the site answered 403` or `429` | Hoss blocked or slowed us. Nothing changed. Do not retry for a day or two; tell Lead (Hoss may have noticed) |
| `STOPPED ... challenge / captcha / block page` | Hoss asked "are you human". Nothing changed. Do not retry; tell Lead |
| `STOPPED ... login redirect loop` / `session lost` | The login does not complete. Nothing changed; tell Lead |
| `STOPPED ... data-product_variations ...` or `variants read, ... expected` | Hoss changed the page layout or part of it did not load. Nothing changed; tell Lead (the reader needs an update) |
| `changes proposed, the limit is 446 per run` | More than 5% would change. Nothing written. If the report looks right: `approve.txt` with the number, or ask Lead |
| `HELD: would close the whole product` / `looks like a bad parse` | That product's Hoss page looks wrong, so its closes were held. Nothing closed for that product; tell Lead |
| `READ-BACK MISMATCH` or `write STOPPED` | A change did not stick. The job stopped. Send `undo.txt` for that run's undo file and tell Lead |
| `FAILED: could not download the code from GitHub` | The NAS has no internet or GitHub is down. Wait, then Stop and Start the project |
| `FAILED: the branch main has no Alpina job yet` | Step 1 (merge) was not done. Merge, then Stop and Start. (Or before the merge, change both `main` words in the YAML to `alpina-hoss-stock`.) |
A STOPPED run always sends one email to your report address and never changes any stock.

## If the folder path is different
The compose file has one line `- /volume1/docker/alpina/data:/data`. If your docker shared folder is on another volume (for example `volume2`), change `volume1` to match. In **Files**, right-click the folder `alpina` > **Properties** shows its real path.

## Secrets rule
The real values exist only in the NAS project (and your password manager). Never copy the edited YAML into a chat, GitHub, Google Drive, or the synced `loamlabs llc` folder.
