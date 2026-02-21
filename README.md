# SkiAnimator

Take your ski and snowboard data from Strava and create a cool animation remembering the fun runs.

This repository now includes a runnable starter app so you can clone it, open it in VS Code, and test immediately.

## What is included

- A minimal Node.js web server (`src/server.js`)
- A deterministic fixture API (`src/data/runs.fixture.json`)
- A small front-end animation demo (`public/*`)
- A deterministic test (`test/server.test.js`)

---

## 1) Put this project in your GitHub account

### Option A (recommended): Fork on GitHub
1. Open the source repository page on GitHub.
2. Click **Fork**.
3. Select your account.
4. In your terminal:
   ```bash
   git clone https://github.com/<your-user>/SkiAnimator.git
   cd SkiAnimator
   ```

### Option B: Push your local copy to a new empty repo you created
```bash
git remote -v
git remote rename origin upstream
git remote add origin https://github.com/<your-user>/SkiAnimator.git
git push -u origin work
```

---

## 2) Open it in VS Code

1. Start VS Code.
2. Click **File → Open Folder...**.
3. Choose the local `SkiAnimator` folder.
4. Open the integrated terminal in VS Code (**Terminal → New Terminal**).
5. Confirm you are in the repo root:
   ```bash
   pwd
   ```

---

## 3) Install prerequisites

- Node.js 20+
- Git

Check versions:
```bash
node -v
git --version
```

---

## 4) Install and run locally in VS Code

From the VS Code terminal:

```bash
npm install
npm run dev
```

Then open:

- `http://localhost:3000`

You should see the SkiAnimator demo page with a canvas route visualization and run list.

---

## 5) Run tests (deterministic fixture-based)

```bash
npm test
```

This validates the fixed fixture content so test results are consistent across machines.

---

## 6) Daily workflow in VS Code

```bash
git pull
npm run dev
npm test
```

When ready to save work:

```bash
git add .
git commit -m "feat: your change"
git push
```

---

## Project structure

```text
SkiAnimator/
  public/
    app.js
    index.html
    styles.css
  src/
    data/
      runs.fixture.json
    server.js
  test/
    server.test.js
  package.json
  README.md
```

---

## Troubleshooting

- **Port already in use**:
  ```bash
  PORT=3001 npm run dev
  ```
- **Command not found: npm/node**: install Node.js 20+ and restart VS Code.
- **Blank page**: check terminal logs and browser devtools console.

---

## Next production step (optional)

Once you confirm local flow works, the next upgrade is adding real Strava OAuth + ingestion pipeline while keeping the fixture route for deterministic CI tests.
