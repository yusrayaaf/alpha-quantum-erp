#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║   Alpha Quantum ERP v20 — Master Run Script                                ║
# ║   Author  : Mohammad Maynul Hasan Shaon (Alpha Ultimate Ltd.)              ║
# ║   Domain  : erp.alpha-01.info                                              ║
# ║                                                                            ║
# ║   MODES:                                                                   ║
# ║     bash run.sh deploy   → Full first-time setup + deploy to Vercel        ║
# ║     bash run.sh push     → Push latest code changes to GitHub/Vercel       ║
# ║     bash run.sh dev      → Run locally in Termux / Linux                   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'
C='\033[0;36m'; W='\033[1m';    N='\033[0m'

ok()   { echo -e "${G}  ✅  $*${N}"; }
info() { echo -e "${C}  ℹ   $*${N}"; }
warn() { echo -e "${Y}  ⚠   $*${N}"; }
err()  { echo -e "${R}  ✗   $*${N}"; exit 1; }
hdr()  { echo -e "\n${W}${C}══════════════════════════════════════════════════${N}";
         echo -e "${W}  $*${N}";
         echo -e "${W}${C}══════════════════════════════════════════════════${N}\n"; }
ask()  { printf "${Y}  ▶  %s: ${N}" "$*"; }
confirm() {
  printf "${Y}  ▶  %s [y/N]: ${N}" "$*"
  read -r _ans
  [[ "$_ans" =~ ^[Yy]$ ]]
}

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
[ -f package.json ] || err "Run this script from inside the project folder"

IS_TERMUX=false
[ -d /data/data/com.termux ] && IS_TERMUX=true || true

# ─────────────────────────────────────────────────────────────────────────────
# SHARED: Install tools
# ─────────────────────────────────────────────────────────────────────────────
install_tools() {
  hdr "Checking Tools"

  if [ "$IS_TERMUX" = true ]; then
    info "Termux detected — updating packages..."
    pkg update -y 2>/dev/null || true
    for p in nodejs git curl; do
      command -v "$p" &>/dev/null \
        && ok "$p already installed" \
        || { info "Installing $p..."; pkg install -y "$p" 2>/dev/null; }
    done
  else
    for cmd in node npm git curl; do
      command -v "$cmd" &>/dev/null || err "$cmd not found. Install Node.js 18+ and git first."
    done
  fi

  NODE_VER=$(node --version 2>/dev/null | tr -d 'v' | cut -d. -f1 || echo 0)
  [ "$NODE_VER" -ge 18 ] || err "Node.js 18+ required. Current: $(node --version 2>/dev/null)"
  ok "Node.js $(node --version)"
  ok "git $(git --version | awk '{print $3}')"

  # Vercel CLI
  VCLI="vercel"
  if ! command -v vercel &>/dev/null; then
    info "Installing Vercel CLI globally..."
    npm install -g vercel 2>/dev/null && VCLI="vercel" || VCLI="npx vercel"
  fi
  ok "Vercel CLI → $VCLI"
  export VCLI
}

# ─────────────────────────────────────────────────────────────────────────────
# SHARED: Install npm dependencies
# ─────────────────────────────────────────────────────────────────────────────
install_deps() {
  if [ ! -d node_modules ]; then
    info "Installing npm dependencies..."
    npm install 2>/dev/null || npm install --legacy-peer-deps
    ok "Dependencies installed"
  else
    ok "node_modules already present"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# SHARED: Collect GitHub credentials
# ─────────────────────────────────────────────────────────────────────────────
collect_github() {
  echo ""
  echo -e "  ${W}GitHub Setup${N}"
  echo "  Get a PAT at: https://github.com/settings/tokens/new"
  echo "  Note: 'aqe-v20' | Expiry: 90 days | Scopes: ✅ repo  ✅ delete_repo"
  echo ""
  ask "GitHub username";                   read -r GH_USER;  [ -z "$GH_USER" ]  && err "Username required"
  ask "Repo name (default: alpha-quantum-erp)"; read -r GH_REPO; GH_REPO="${GH_REPO:-alpha-quantum-erp}"
  ask "Personal Access Token (hidden)";    read -rsp "" GH_PAT; echo ""; [ -z "$GH_PAT" ] && err "PAT required"
  export GH_USER GH_REPO GH_PAT
}

# ─────────────────────────────────────────────────────────────────────────────
# SHARED: Write .gitignore
# ─────────────────────────────────────────────────────────────────────────────
write_gitignore() {
  cat > "$DIR/.gitignore" << 'GIEOF'
node_modules/
dist/
.env
*.log
.DS_Store
.vercel/
GIEOF
}

# ─────────────────────────────────────────────────────────────────────────────
# MODE 1: DEPLOY — full first-time setup
# ─────────────────────────────────────────────────────────────────────────────
mode_deploy() {
  clear
  echo -e "${W}${C}"
  cat << 'BANNER'
  ╔═══════════════════════════════════════════════════════════════╗
  ║   Alpha Quantum ERP v20 — FULL DEPLOY                        ║
  ║   Steps: Tools → Credentials → GitHub → Vercel → DNS guide  ║
  ╚═══════════════════════════════════════════════════════════════╝
BANNER
  echo -e "${N}"

  install_tools

  # ── Collect all credentials ──────────────────────────────────────────────
  hdr "Collect Credentials"

  collect_github

  echo ""
  echo -e "  ${W}NeonDB (PostgreSQL)${N}"
  echo "  Get URL at: https://console.neon.tech → New Project → Connection String"
  echo "  Format: postgresql://user:pass@host/db?sslmode=require"
  echo ""
  while true; do
    ask "DATABASE_URL (postgresql://...)"; read -r DB_URL
    [[ "$DB_URL" == postgresql://* ]] || [[ "$DB_URL" == postgres://* ]] && break
    warn "Must start with postgresql:// — try again"
  done

  # Auto-generate JWT secret
  JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" 2>/dev/null \
        || openssl rand -hex 48 2>/dev/null \
        || echo "aqe-v20-$(date +%s)-secret")
  ok "JWT_SECRET auto-generated (${#JWT} chars)"

  echo ""
  echo -e "  ${W}Creator (master admin) account${N}"
  ask "Username (default: maynulshaon)";                   read -r C_USER;  C_USER="${C_USER:-maynulshaon}"
  ask "Password (default: Creator@2025!)";                 read -rsp "" C_PASS; echo ""; C_PASS="${C_PASS:-Creator@2025!}"
  ask "Email (default: erp@alpha-01.info)";                read -r C_EMAIL; C_EMAIL="${C_EMAIL:-erp@alpha-01.info}"
  ask "Full name (default: Mohammad Maynul Hasan Shaon)";  read -r C_NAME;  C_NAME="${C_NAME:-Mohammad Maynul Hasan Shaon}"

  echo ""
  echo -e "  ${W}IONOS Email (optional)${N}"
  ask "SMTP password for erp@alpha-01.info (ENTER to skip)"; read -rsp "" SMTP_PASS; echo ""

  echo ""
  echo -e "  ${W}Cloudflare R2 Storage (optional)${N}"
  ask "Cloudflare Account ID (ENTER to skip)"; read -r CF_ACCT
  CF_KEY=""; CF_SEC=""; CF_BUCKET="alpha-erp-uploads"; CF_PUB=""
  if [ -n "$CF_ACCT" ]; then
    ask "CF Access Key ID";                  read -r CF_KEY
    ask "CF Secret Access Key (hidden)";     read -rsp "" CF_SEC; echo ""
    ask "R2 Bucket name (default: alpha-erp-uploads)"; read -r _t; CF_BUCKET="${_t:-alpha-erp-uploads}"
    ask "R2 Public URL (ENTER to skip)";     read -r CF_PUB
  fi

  echo ""
  ask "ImgBB API key (imgbb.com, ENTER to skip)"; read -r IMGBB
  ask "Vercel project name (default: alpha-quantum-erp)"; read -r V_PROJ; V_PROJ="${V_PROJ:-alpha-quantum-erp}"

  # ── Write .env ────────────────────────────────────────────────────────────
  cat > "$DIR/.env" << ENVEOF
# Alpha Quantum ERP v20 — generated $(date)
DATABASE_URL=$DB_URL
JWT_SECRET=$JWT
VITE_CREATOR_USERNAME=$C_USER
CREATOR_PASSWORD=$C_PASS
CREATOR_EMAIL=$C_EMAIL
CREATOR_FULL_NAME=$C_NAME
SMTP_HOST=smtp.ionos.com
SMTP_PORT=587
SMTP_USER=erp@alpha-01.info
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=Alpha Quantum ERP <erp@alpha-01.info>
SMTP_REPLY_TO=reply@alpha-01.info
CF_ACCOUNT_ID=${CF_ACCT:-}
CF_ACCESS_KEY_ID=${CF_KEY:-}
CF_SECRET_ACCESS_KEY=${CF_SEC:-}
CF_R2_BUCKET=${CF_BUCKET}
CF_R2_PUBLIC_URL=${CF_PUB:-}
IMGBB_API_KEY=${IMGBB:-}
NODE_ENV=production
ENVEOF
  chmod 600 "$DIR/.env"
  ok ".env written and secured (chmod 600)"

  # ── Delete old repo + push fresh ─────────────────────────────────────────
  hdr "Clean GitHub Push (removes all old history)"

  GH_API="https://api.github.com"
  GH_AUTH="Authorization: token $GH_PAT"

  info "Checking for existing repo..."
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -H "$GH_AUTH" "$GH_API/repos/$GH_USER/$GH_REPO")
  if [ "$HTTP" = "200" ]; then
    warn "Repo $GH_USER/$GH_REPO exists — deleting to start clean..."
    DEL=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "$GH_AUTH" "$GH_API/repos/$GH_USER/$GH_REPO")
    [ "$DEL" = "204" ] && ok "Old repo deleted" || warn "Delete returned HTTP $DEL (ensure delete_repo scope on PAT)"
    sleep 4
  fi

  info "Creating fresh repo..."
  CRE=$(curl -s -w "\n%{http_code}" \
    -X POST -H "$GH_AUTH" -H "Content-Type: application/json" \
    "$GH_API/user/repos" \
    -d "{\"name\":\"$GH_REPO\",\"private\":false,\"auto_init\":false,\"description\":\"Alpha Quantum ERP v20 — erp.alpha-01.info\"}" \
    | tail -1)
  [ "$CRE" = "201" ] && ok "Repo created: github.com/$GH_USER/$GH_REPO" \
                      || warn "Create returned HTTP $CRE — may already exist, continuing..."

  write_gitignore

  [ -d .git ] && { info "Removing old .git folder..."; rm -rf .git; }
  git init -b main 2>/dev/null || { git init && git checkout -b main 2>/dev/null; }
  git config user.name  "$C_NAME"
  git config user.email "$C_EMAIL"
  git remote add origin "https://$GH_USER:$GH_PAT@github.com/$GH_USER/$GH_REPO.git"
  git add -A
  git commit -m "feat: Alpha Quantum ERP v20 — clean deploy $(date '+%Y-%m-%d %H:%M')"

  info "Pushing to GitHub..."
  git push -u origin main 2>/dev/null \
    || git push --force -u origin main 2>/dev/null \
    || err "Push failed — check PAT has 'repo' scope"
  ok "Code pushed → https://github.com/$GH_USER/$GH_REPO"

  # Save credentials for future pushes
  printf 'https://%s:%s@github.com\n' "$GH_USER" "$GH_PAT" > ~/.git-credentials 2>/dev/null \
    && chmod 600 ~/.git-credentials 2>/dev/null || true

  # ── Vercel deploy ─────────────────────────────────────────────────────────
  hdr "Vercel Deploy + Environment Variables"

  info "Logging into Vercel (may open browser)..."
  $VCLI login 2>/dev/null || warn "Run 'vercel login' manually if this failed"

  info "Deploying project: $V_PROJ ..."
  $VCLI --prod --yes --name "$V_PROJ" 2>/dev/null \
    || $VCLI --prod --name "$V_PROJ" 2>/dev/null \
    || warn "Deploy had issues — check https://vercel.com/dashboard"

  info "Pushing environment variables to Vercel..."
  _senv() {
    local K="$1" V="${2:-}"
    [ -z "$V" ] && { echo "  ⏭  $K (skipped — empty)"; return; }
    printf '%s' "$V" | $VCLI env add "$K" production --yes 2>/dev/null \
      && echo "  ✅ $K set" \
      || echo "  ⚠  $K — set manually at vercel.com/dashboard"
  }
  _senv DATABASE_URL          "$DB_URL"
  _senv JWT_SECRET            "$JWT"
  _senv VITE_CREATOR_USERNAME "$C_USER"
  _senv CREATOR_PASSWORD      "$C_PASS"
  _senv CREATOR_EMAIL         "$C_EMAIL"
  _senv CREATOR_FULL_NAME     "$C_NAME"
  [ -n "${SMTP_PASS:-}"  ] && _senv SMTP_PASS            "$SMTP_PASS"
  [ -n "${CF_ACCT:-}"   ] && _senv CF_ACCOUNT_ID        "$CF_ACCT"
  [ -n "${CF_KEY:-}"    ] && _senv CF_ACCESS_KEY_ID     "$CF_KEY"
  [ -n "${CF_SEC:-}"    ] && _senv CF_SECRET_ACCESS_KEY "$CF_SEC"
  [ -n "${CF_BUCKET:-}" ] && _senv CF_R2_BUCKET         "$CF_BUCKET"
  [ -n "${CF_PUB:-}"    ] && _senv CF_R2_PUBLIC_URL     "$CF_PUB"
  [ -n "${IMGBB:-}"     ] && _senv IMGBB_API_KEY        "$IMGBB"

  info "Redeploying to activate all env vars..."
  $VCLI --prod --yes 2>/dev/null || warn "Re-deploy manually from Vercel dashboard"
  ok "Vercel deploy complete!"

  # ── DNS Guide ─────────────────────────────────────────────────────────────
  hdr "DNS Setup (IONOS)"
  echo "  1. Add domains in Vercel dashboard:"
  echo "     https://vercel.com/dashboard → $V_PROJ → Settings → Domains"
  echo "     ➕ erp.alpha-01.info    ← ERP system"
  echo "     ➕ alpha-01.info        ← Landing page"
  echo ""
  echo "  2. Add DNS records in IONOS (my.ionos.com → Domains → alpha-01.info → DNS):"
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────────────┐"
  echo "  │  Type    Host   Points to                            TTL        │"
  echo "  ├─────────────────────────────────────────────────────────────────┤"
  echo "  │  CNAME   erp    cname.vercel-dns.com                 300        │"
  echo "  │  A       @      76.76.21.21                          300        │"
  echo "  │  CNAME   www    cname.vercel-dns.com                 300        │"
  echo "  └─────────────────────────────────────────────────────────────────┘"
  echo ""
  echo "  DNS propagates in 5–30 minutes."

  # ── Summary ───────────────────────────────────────────────────────────────
  hdr "🎉 Deploy Complete!"
  echo -e "  ${W}ERP URL  :${N}  ${C}https://erp.alpha-01.info${N}  (after DNS)"
  echo -e "  ${W}Landing  :${N}  ${C}https://alpha-01.info${N}       (after DNS)"
  echo -e "  ${W}GitHub   :${N}  ${C}https://github.com/$GH_USER/$GH_REPO${N}"
  echo ""
  echo -e "  ${W}Login    :${N}  ${C}$C_USER${N}  /  ${C}$C_PASS${N}  ${Y}← Change after first login!${N}"
  echo ""
  echo -e "  ${W}Next time you update code:${N}"
  echo -e "  ${C}bash run.sh push${N}"
  echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# MODE 2: PUSH — commit + push latest changes (Vercel auto-deploys)
# ─────────────────────────────────────────────────────────────────────────────
mode_push() {
  clear
  echo -e "${W}${C}"
  cat << 'BANNER'
  ╔═══════════════════════════════════════════════════════════════╗
  ║   Alpha Quantum ERP v20 — PUSH UPDATE                        ║
  ║   Commits changes → pushes to GitHub → Vercel auto-deploys  ║
  ╚═══════════════════════════════════════════════════════════════╝
BANNER
  echo -e "${N}"

  # Make sure we're in a git repo
  if [ ! -d .git ]; then
    warn "No .git found. Need GitHub credentials to initialize."
    collect_github
    write_gitignore
    git init -b main 2>/dev/null || { git init && git checkout -b main 2>/dev/null; }
    git config user.name  "Alpha Quantum ERP"
    git config user.email "erp@alpha-01.info"
    [ -f ~/.git-credentials ] && git config credential.helper store || \
      git remote add origin "https://$GH_USER:$GH_PAT@github.com/$GH_USER/$GH_REPO.git" 2>/dev/null || true
    git remote add origin "https://$GH_USER:$GH_PAT@github.com/$GH_USER/$GH_REPO.git" 2>/dev/null || \
      git remote set-url origin "https://$GH_USER:$GH_PAT@github.com/$GH_USER/$GH_REPO.git"
  fi

  # Get the current remote
  REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
  if [ -z "$REMOTE" ]; then
    warn "No remote set. Enter your GitHub details."
    collect_github
    git remote add origin "https://$GH_USER:$GH_PAT@github.com/$GH_USER/$GH_REPO.git"
  fi

  # Show what will change
  hdr "Changes to Push"
  git status --short 2>/dev/null || true
  echo ""

  CHANGED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  if [ "$CHANGED" = "0" ]; then
    ok "Nothing changed — working tree is clean."
    echo ""
    echo -e "  ${W}Latest commit:${N}"
    git log --oneline -3 2>/dev/null || true
    echo ""
    if confirm "Force re-deploy to Vercel anyway?"; then
      VCLI="vercel"; command -v vercel &>/dev/null || VCLI="npx vercel"
      $VCLI --prod --yes 2>/dev/null && ok "Redeployed" || warn "Deploy failed — check vercel.com/dashboard"
    fi
    exit 0
  fi

  # Commit message
  echo ""
  ask "Commit message (ENTER for auto)"; read -r MSG
  MSG="${MSG:-update: $(date '+%Y-%m-%d %H:%M')}"

  git add -A
  git diff --cached --quiet && { ok "Nothing staged to commit"; exit 0; }
  git commit -m "$MSG"

  info "Pushing to GitHub..."
  git push origin main 2>/dev/null \
    || git push --force-with-lease origin main 2>/dev/null \
    || {
         warn "Push failed — may need to re-authenticate"
         collect_github
         git remote set-url origin "https://$GH_USER:$GH_PAT@github.com/$GH_USER/$GH_REPO.git"
         git push -u origin main || err "Push still failed — check PAT and repo name"
       }

  ok "Pushed → $(git remote get-url origin 2>/dev/null | sed 's|https://[^@]*@||')"
  echo ""
  echo -e "  ${C}ℹ  Vercel will auto-deploy in ~30–60 seconds.${N}"
  echo -e "  ${C}ℹ  Watch: https://vercel.com/dashboard${N}"
  echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# MODE 3: DEV — run locally
# ─────────────────────────────────────────────────────────────────────────────
mode_dev() {
  clear
  echo -e "${W}${C}"
  cat << 'BANNER'
  ╔═══════════════════════════════════════════════════════════════╗
  ║   Alpha Quantum ERP v20 — LOCAL DEV SERVER                   ║
  ║   Runs on http://localhost:5173                              ║
  ╚═══════════════════════════════════════════════════════════════╝
BANNER
  echo -e "${N}"

  install_tools
  install_deps

  [ -f .env ] || {
    warn ".env not found. Creating a minimal .env for local dev..."
    cat > .env << 'DEVENV'
# Local dev — fill in your NeonDB URL
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
JWT_SECRET=local-dev-secret-change-for-production
VITE_CREATOR_USERNAME=maynulshaon
CREATOR_PASSWORD=Creator@2025!
CREATOR_EMAIL=erp@alpha-01.info
CREATOR_FULL_NAME=Mohammad Maynul Hasan Shaon
NODE_ENV=development
DEVENV
    warn "Edit .env and add your DATABASE_URL before using the API"
  }

  hdr "Starting Dev Server"
  echo -e "  ${C}Frontend : http://localhost:5173${N}"
  echo -e "  ${C}API      : http://localhost:3001/api${N}  (if running api/server.js separately)"
  echo ""
  echo -e "  Press ${W}Ctrl+C${N} to stop"
  echo ""
  npm run dev
}

# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT — parse mode argument
# ─────────────────────────────────────────────────────────────────────────────
MODE="${1:-}"

case "$MODE" in
  deploy)
    mode_deploy
    ;;
  push)
    mode_push
    ;;
  dev)
    mode_dev
    ;;
  *)
    clear
    echo -e "${W}${C}"
    cat << 'BANNER'
  ╔═══════════════════════════════════════════════════════════════════╗
  ║   Alpha Quantum ERP v20 — Master Run Script                      ║
  ║   By: Mohammad Maynul Hasan Shaon · Alpha Ultimate Ltd.          ║
  ╚═══════════════════════════════════════════════════════════════════╝
BANNER
    echo -e "${N}"
    echo -e "  ${W}Usage:${N}"
    echo ""
    echo -e "  ${C}bash run.sh deploy${N}"
    echo -e "    Full first-time setup:"
    echo -e "    Installs tools → collects credentials → deletes old GitHub repo"
    echo -e "    → pushes clean code → deploys to Vercel → sets all env vars"
    echo ""
    echo -e "  ${C}bash run.sh push${N}"
    echo -e "    Push your latest code changes to GitHub."
    echo -e "    Vercel automatically redeploys from git (~30s)."
    echo ""
    echo -e "  ${C}bash run.sh dev${N}"
    echo -e "    Run the project locally at http://localhost:5173"
    echo -e "    (good for testing changes before pushing)"
    echo ""
    echo -e "  ${Y}Tip:${N} Run ${C}deploy${N} once, then use ${C}push${N} for every update."
    echo ""
    ;;
esac
