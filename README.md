# SkiAnimator

Take your ski and snowboard data from Strava and create a cool animation remembering the fun runs.

## Move this project to your own GitHub

If you want this code fully under your own account, you have two safe options.

### Option A (recommended): fork in GitHub UI
1. Open the repository page in GitHub.
2. Click **Fork** (top-right).
3. Choose your account/org.
4. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-user>/SkiAnimator.git
   cd SkiAnimator
   ```

### Option B: keep local repo and repoint `origin`
Use this if you already have the project locally and created a new empty repo in your GitHub account.

```bash
git remote -v
git remote rename origin upstream
git remote add origin https://github.com/<your-user>/SkiAnimator.git
git push -u origin work
```

After this:
- `origin` = your GitHub repo
- `upstream` = original repo (optional but useful for pulling updates)

---

## Run locally to test

> Current repository snapshot contains documentation only and no runnable app entrypoint yet.

You can still validate your setup now, then run the app once source files are present.

### 1) Verify Git is connected correctly
```bash
git remote -v
git branch --show-current
git status
```

### 2) Add app code if this is an incomplete checkout
If your full app is in another branch or remote, pull it in:
```bash
git fetch --all --prune
git branch -a
```
Then switch to the branch that contains the application code.

### 3) Start the app (once code is present)
Use the stack-specific command for your app:
- Node: `npm install && npm run dev` or `npm start`
- Python: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python app.py`
- Docker: `docker compose up --build`

### 4) Smoke test
After startup, hit the local URL (often `http://localhost:3000` or `http://localhost:8000`) and verify:
- app boots without errors
- map/animation page loads
- Strava auth/data flow works (if configured)

---

## Suggested next step

If you want, I can add a production-grade `CONTRIBUTING.md` + `Makefile` (`setup`, `run`, `test`) so local setup and testing are one-command and repeatable.
