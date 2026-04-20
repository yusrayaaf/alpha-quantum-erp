# Alpha Quantum ERP v20

**Live:** https://erp.alpha-01.info  
**Landing:** https://alpha-01.info  
**By:** Mohammad Maynul Hasan Shaon — Alpha Ultimate Ltd.

---

## One Script For Everything

```bash
bash run.sh deploy   # First-time: setup + GitHub push + Vercel deploy
bash run.sh push     # Every update: commit + push (Vercel auto-deploys)
bash run.sh dev      # Run locally at localhost:5173
```

### `deploy` — first time only
1. Installs Node.js, git, Vercel CLI (auto on Termux)
2. Collects: GitHub PAT, NeonDB URL, creator credentials, optional SMTP/R2/ImgBB
3. Deletes old GitHub repo → creates fresh one → pushes clean code
4. Deploys to Vercel + sets all environment variables
5. Shows DNS records to add in IONOS

### `push` — every time you make changes
```bash
bash run.sh push
# Enter commit message (or press ENTER for auto timestamp)
# Done — Vercel redeploys in ~30 seconds
```

### `dev` — local testing
```bash
bash run.sh dev
# Runs at http://localhost:5173
```

---

## Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js Vercel Serverless Functions  
- **Database:** NeonDB (PostgreSQL serverless)
- **Storage:** Cloudflare R2 (optional)
- **Email:** IONOS SMTP via Nodemailer
- **Auth:** JWT

## Requirements

- Node.js 18+ and git installed
- GitHub account + Personal Access Token (scopes: `repo` + `delete_repo`)
- NeonDB project URL
- Vercel account (free)
