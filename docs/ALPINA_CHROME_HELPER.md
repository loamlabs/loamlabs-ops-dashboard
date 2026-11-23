# Alpina Chrome helper: the 8 Hoss pages arrive by themselves (no saving by hand)

## What it is, in five lines
1. A small Chrome extension that you load into **your own Chrome**, the one where **you** are signed in to hasgllc.com. It never logs in for you.
2. Every 6 hours it checks whether 3 days (or 2, your choice) have passed since its last run. If so it opens the 8 Alpina product pages one at a time in background tabs (5 to 10 seconds apart), reads only the stock numbers (every price is removed), and closes each tab.
3. It sends the 8 results in one go to a tiny receiver inside the NAS job (NAS port 18765, needs a long random token, home network only). The receiver writes the same 8 page files you used to save by hand, dated now, so the job's rules (4-day age limit, baseline, 5% limit, undo) are unchanged.
4. **If anything is wrong** (signed out, a login page, a "just a moment" check, a 403, a 429, a page without stock data) it stops at once, retries nothing, sends nothing but a stop notice, and you get **one email**: "Hoss pages need you: log in to hasgllc.com in Chrome". It stays stopped until you log in yourself and click **Resume**.
5. The NAS **Log** tab and `status.txt` show when the last delivery arrived and how many pages, or "HELPER STOPPED (logged-out): ...".

It does not touch passwords or cookies, does not use a different browser, does not fake anything, and opens only the 8 product addresses. Chrome has to be open for it to run (if the PC was off, it runs the next time Chrome starts).

## One time setup

### On the NAS (after the pull request is merged)
1. **Open the helper port.** Docker app > **Project** > on the **alpina-stock** card click **...** > **Settings** > tab **Compose configuration** (one long line, your values are in it: do this yourself). Find `"volumes":["/volume1/docker/alpina/data:/data"]` and put this text right **before** it, then click **Redeploy** (leave "Pull the latest image" unticked, **Deploy**):
   `"ports":["18765:8765"],`
   (The container listens on 8765 inside; the NAS publishes it as **18765** because 8765 was already used by another container. If 18765 is also taken, pick another free number on the left and use it in the address too.)
2. Wait about 2 minutes. In **Docker > Container > alpina-stock > Log** find the line **HELPER TOKEN (copy it into the Chrome helper options ...): <48 letters and numbers>** and copy the token. (If it has scrolled away, put an empty file named `show-token.txt` into `docker/alpina/data/commands` and read the answer in the Log tab.) Keep the token private.

### On your PC (the Chrome profile that is signed in to Hoss)
3. Copy the folder `tools\alpina-chrome-helper` (from the dashboard folder after `git pull`) to a folder **outside** the synced folders, for example `C:\AlpinaHelper`.
4. In Chrome open `chrome://extensions`, switch **Developer mode** on (top right), click **Load unpacked**, choose `C:\AlpinaHelper`.
5. Click the puzzle-piece icon in Chrome, find **Alpina Hoss pages helper**, open its **Options** (the three dots next to it > Options). Type the NAS address `http://192.168.10.20:18765` (use `http://192.168.20.20:18765` if that is the one your PC can reach), paste the token, choose **3 days**, click **Save**, then **Test connection**. It must say "Connected to the NAS job". If it says it cannot reach the NAS: check the address, that step 1 was done, and that the NAS firewall/VLAN allows your PC to reach port 8765 (it already reaches port 9999 of the same NAS).
6. In the same Chrome profile: **log in to hasgllc.com yourself** (keep "remember me" on) and open one Alpina product page to see that it loads normally.
7. In the helper Options click **Run now (first run)**. About 2 minutes: eight background tabs open and close. The result line must say "8 pages sent to the NAS". On the NAS Log tab you will see "helper delivery accepted: 8 pages". Put `status.txt` in `commands`: all 8 pages must say **new**. Then `read-now.txt` as usual.

### Check it is running / turn it off
- **Running:** Options shows "Status: running", the last run and its result; the extension icon shows OK after a good run, STOP after a stop.
- **Turn it off:** `chrome://extensions`, switch the helper off (or **Remove**). To stop the NAS side too: `pause.txt`. Nothing else changes; the job then refuses pages older than 4 days and emails you.
- **After a stop:** log in to hasgllc.com yourself, then Options > **Resume**. The next run comes at the next check.

## Facts
- The helper never runs more often than every 3 days (2 if you choose 2); "Run now" is refused if a run happened less than 12 hours ago.
- It only asks for the 8 addresses in its list (the same as the NAS job). It does not read Hoss's robots.txt itself; the product pages are public product pages that your own signed-in Chrome opens, one request each.
- The receiver needs the token for every request, accepts only the 8 Hoss addresses, only 8 pages together (all checked before anything is written), at most 3 MB, and removes any price field it might still receive.
- Files: `tools/alpina-chrome-helper/` (the extension: `manifest.json`, `background.js`, `core.js`, `options.html`, `options.js`), `lib/alpina-hoss-receiver.js` (the NAS side), `docker/alpina/entrypoint.sh` (starts and watches the receiver).
