#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  Alpha Quantum ERP v20 — Single-Command Deploy Script                    ║
# ║  Removes old git history → clean push → Vercel deploy                   ║
# ║  Author  : Mohammad Maynul Hasan Shaon (Alpha Ultimate Ltd.)             ║
# ║  ERP URL : https://erp.alpha-01.info                                    ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; C='\033[0;36m'; W='\033[1m'; N='\033[0m'
ok()   { echo -e "${G}  ✅  $*${N}"; }
info() { echo -e "${C}  ℹ   $*${N}"; }
warn() { echo -e "${Y}  ⚠   $*${N}"; }
err()  { echo -e "${R}  ✗   $*${N}"; exit 1; }
hdr()  { echo -e "\n${W}${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"; echo -e "${W}  $*${N}"; echo -e "${W}${C}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}\n"; }
ask()  { printf "${Y}  ▶  %s ${N}" "$*"; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
[ -f package.json ] || err "Run from project root (where package.json is)"

IS_TERMUX=false
[ -d /data/data/com.termux ] && IS_TERMUX=true || true

clear
echo -e "${W}${C}"
cat << 'BANNER'
  ╔════════════════════════════════════════════════════════════════╗
  ║   Alpha Quantum ERP v20 — Clean Git Push + Vercel Deploy      ║
  ║   Alpha Ultimate Ltd. · erp.alpha-01.info                     ║
  ╚════════════════════════════════════════════════════════════════╝
BANNER
echo -e "${N}"

# ──────────────────────────────────────────────────────────────────────────
hdr "Step 1 — Check Tools"
# ──────────────────────────────────────────────────────────────────────────

if [ "$IS_TERMUX" = true ]; then
  pkg update -y 2>/dev/null || true
  for p in nodejs git curl; do
    command -v "$p" &>/dev/null && ok "$p" || { info "Installing $p..."; pkg install -y "$p" 2>/dev/null; }
  done
else
  for cmd in node npm git curl; do command -v "$cmd" &>/dev/null || err "$cmd not found. Install Node.js 18+ and git."; done
fi

NODE_VER=$(node --version 2>/dev/null | tr -d 'v' | cut -d. -f1 || echo 0)
[ "$NODE_VER" -ge 18 ] || err "Node.js 18+ required. Got: $(node --version 2>/dev/null || echo none)"
ok "Node.js $(node --version)"
ok "Git $(git --version | awk '{print $3}')"

VCLI="vercel"
command -v vercel &>/dev/null || { info "Installing Vercel CLI..."; npm install -g vercel 2>/dev/null && VCLI="vercel" || VCLI="npx vercel"; }
ok "Vercel CLI: $VCLI"

# ──────────────────────────────────────────────────────────────────────────
hdr "Step 2 — Credentials"
# ──────────────────────────────────────────────────────────────────────────

echo "  Required before continuing:"
echo "  ① GitHub PAT → https://github.com/settings/tokens/new"
echo "     Scopes: repo + delete_repo  |  Expiry: 90d"
echo "  ② NeonDB URL → https://console.neon.tech"
echo ""

ask "GitHub username:"; read -r GH_USER;  [ -z "$GH_USER" ] && err "Required"
ask "GitHub repo name (default: alpha-quantum-erp):"; read -r GH_REPO; GH_REPO="${GH_REPO:-alpha-quantum-erp}"
ask "GitHub PAT (hidden):"; read -rsp "" GH_PAT; echo ""; [ -z "$GH_PAT" ] && err "Required"

echo ""
while true; do
  ask "NeonDB DATABASE_URL (postgresql://...):"; read -r DB_URL
  [[ "$DB_URL" == postgresql://* ]] || [[ "$DB_URL" == postgres://* ]] && break
  warn "Must start with postgresql://"
done

JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))" 2>/dev/null \
      || openssl rand -hex 48 2>/dev/null \
      || echo "aqe-v20-$(date +%s)-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo rand)")
ok "JWT_SECRET auto-generated (${#JWT} chars)"

echo ""
echo "  Creator (master admin) account:"
ask "Username (default: maynulshaon):";                         read -r C_USER;  C_USER="${C_USER:-maynulshaon}"
ask "Password (default: Creator@2025!):";                       read -rsp "" C_PASS; echo ""; C_PASS="${C_PASS:-Creator@2025!}"
ask "Email (default: erp@alpha-01.info):";                      read -r C_EMAIL; C_EMAIL="${C_EMAIL:-erp@alpha-01.info}"
ask "Full name (default: Mohammad Maynul Hasan Shaon):";        read -r C_NAME;  C_NAME="${C_NAME:-Mohammad Maynul Hasan Shaon}"

echo ""
ask "IONOS SMTP password for erp@alpha-01.info (ENTER to skip):"; read -rsp "" SMTP_PASS; echo ""

echo ""
ask "Cloudflare Account ID (ENTER to skip R2):"; read -r CF_ACCT
CF_KEY=""; CF_SEC=""; CF_BUCKET="alpha-erp-uploads"; CF_PUB=""
if [ -n "$CF_ACCT" ]; then
  ask "CF Access Key ID:";               read -r CF_KEY
  ask "CF Secret Access Key (hidden):";  read -rsp "" CF_SEC; echo ""
  ask "R2 Bucket (default: alpha-erp-uploads):"; read -r t; CF_BUCKET="${t:-alpha-erp-uploads}"
  ask "R2 Public URL (ENTER to skip):";  read -r CF_PUB
fi

echo ""
ask "ImgBB API key (imgbb.com, ENTER to skip):"; read -r IMGBB
ask "Vercel project name (default: alpha-quantum-erp):"; read -r V_PROJ; V_PROJ="${V_PROJ:-alpha-quantum-erp}"

# Write .env
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
ok ".env saved"

# ──────────────────────────────────────────────────────────────────────────
hdr "Step 3 — Clean Git Push (removes old history)"
# ──────────────────────────────────────────────────────────────────────────

AUTH="Authorization: token $GH_PAT"
API="https://api.github.com"

info "Checking existing repo..."
SC=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/repos/$GH_USER/$GH_REPO")
if [ "$SC" = "200" ]; then
  warn "Deleting old repo $GH_USER/$GH_REPO (this removes ALL history)..."
  DS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "$AUTH" "$API/repos/$GH_USER/$GH_REPO")
  if [ "$DS" = "204" ]; then
    ok "Old repo deleted"
  else
    warn "Delete returned HTTP $DS — ensure PAT has 'delete_repo' scope"
    warn "Continuing with force-push instead..."
  fi
  sleep 4
fi

info "Creating fresh repo $GH_USER/$GH_REPO..."
CS=$(curl -s -w "\n%{http_code}" -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "$API/user/repos" \
  -d "{\"name\":\"$GH_REPO\",\"private\":false,\"auto_init\":false,\"description\":\"Alpha Quantum ERP v20 — erp.alpha-01.info\"}" | tail -1)
[ "$CS" = "201" ] && ok "Repo created" || warn "HTTP $CS (may already exist, continuing...)"

# Write .gitignore
cat > "$DIR/.gitignore" << 'GIEOF'
node_modules/
dist/
.env
*.log
.DS_Store
.vercel/
GIEOF

# Remove old git and init fresh
cd "$DIR"
[ -d .git ] && { info "Removing old .git..."; rm -rf .git; }

git init -b main 2>/dev/null || { git init && git checkout -b main 2>/dev/null; }
git config user.name  "$C_NAME"
git config user.email "$C_EMAIL"
git remote add origin "https://$GH_USER:$GH_PAT@github.com/$GH_USER/$GH_REPO.git"

git add -A
git commit -m "feat: Alpha Quantum ERP v20 — clean deploy $(date '+%Y-%m-%d %H:%M')"

info "Pushing to GitHub..."
git push -u origin main 2>/dev/null || \
  git push --force -u origin main 2>/dev/null || \
  err "Push failed. Verify PAT has 'repo' scope and try again."

ok "Pushed → https://github.com/$GH_USER/$GH_REPO"

# Store credentials for future pushes
printf 'https://%s:%s@github.com\n' "$GH_USER" "$GH_PAT" > ~/.git-credentials 2>/dev/null && \
  chmod 600 ~/.git-credentials 2>/dev/null || true

# ──────────────────────────────────────────────────────────────────────────
hdr "Step 4 — Vercel Deploy + Environment Variables"
# ──────────────────────────────────────────────────────────────────────────

info "Logging into Vercel..."
$VCLI login 2>/dev/null || warn "Login may require browser — run: vercel login"

info "Deploying to Vercel (project: $V_PROJ)..."
$VCLI --prod --yes --name "$V_PROJ" 2>/dev/null || \
  $VCLI --prod --name "$V_PROJ" 2>/dev/null || \
  warn "Deploy had issues — check Vercel dashboard"

# Push all env vars
info "Setting Vercel environment variables..."
senv() {
  local K="$1" V="${2:-}"
  [ -z "$V" ] && { echo "  SKIP $K (empty)"; return; }
  printf '%s' "$V" | $VCLI env add "$K" production --yes 2>/dev/null && echo "  ✅ $K" || \
    printf '%s' "$V" | $VCLI env add "$K" production 2>/dev/null && echo "  ✅ $K" || \
    echo "  ⚠  $K — set manually in dashboard"
}

senv DATABASE_URL          "$DB_URL"
senv JWT_SECRET            "$JWT"
senv VITE_CREATOR_USERNAME "$C_USER"
senv CREATOR_PASSWORD      "$C_PASS"
senv CREATOR_EMAIL         "$C_EMAIL"
senv CREATOR_FULL_NAME     "$C_NAME"
[ -n "${SMTP_PASS:-}"  ] && senv SMTP_PASS            "$SMTP_PASS"
[ -n "${CF_ACCT:-}"   ] && senv CF_ACCOUNT_ID        "$CF_ACCT"
[ -n "${CF_KEY:-}"    ] && senv CF_ACCESS_KEY_ID     "$CF_KEY"
[ -n "${CF_SEC:-}"    ] && senv CF_SECRET_ACCESS_KEY "$CF_SEC"
[ -n "${CF_BUCKET:-}" ] && senv CF_R2_BUCKET         "$CF_BUCKET"
[ -n "${CF_PUB:-}"    ] && senv CF_R2_PUBLIC_URL     "$CF_PUB"
[ -n "${IMGBB:-}"     ] && senv IMGBB_API_KEY        "$IMGBB"

info "Final redeploy to activate env vars..."
$VCLI --prod --yes 2>/dev/null || warn "Redeploy manually from Vercel dashboard"
ok "Vercel deploy complete"

# ──────────────────────────────────────────────────────────────────────────
hdr "Step 5 — DNS Setup Guide (IONOS)"
# ──────────────────────────────────────────────────────────────────────────

echo "  1. Add both domains in Vercel:"
echo "     https://vercel.com/dashboard → $V_PROJ → Settings → Domains"
echo "     → erp.alpha-01.info   (ERP system)"
echo "     → alpha-01.info       (Landing page)"
echo ""
echo "  2. Set DNS records in IONOS (my.ionos.com → Domains → DNS):"
echo ""
echo "  ┌──────────────────────────────────────────────────────────────┐"
echo "  │  Type   Host   Points to                        TTL         │"
echo "  │  CNAME  erp    cname.vercel-dns.com             300         │"
echo "  │  A      @      76.76.21.21                      300         │"
echo "  │  CNAME  www    cname.vercel-dns.com             300         │"
echo "  └──────────────────────────────────────────────────────────────┘"
echo ""
echo "  DNS propagates in 5–30 minutes."

# ──────────────────────────────────────────────────────────────────────────
hdr "Step 6 — Helper Scripts"
# ──────────────────────────────────────────────────────────────────────────

cat > "$DIR/push.sh" << 'PUSHEOF'
#!/usr/bin/env bash
# Quick push to GitHub — Vercel auto-deploys from git
set -euo pipefail
cd "$(dirname "$0")"
git add -A
MSG="${1:-update: $(date '+%Y-%m-%d %H:%M')}"
git diff --cached --quiet && echo "Nothing to commit" && exit 0
git commit -m "$MSG"
git push origin main
echo "✅ Pushed — Vercel deploy starting (~30s)"
PUSHEOF
chmod +x "$DIR/push.sh"
ok "push.sh created"

cat > "$DIR/check.sh" << 'CHECKEOF'
#!/usr/bin/env bash
BASE="${1:-https://erp.alpha-01.info}"
echo "=== Health ==="
curl -sf "$BASE/api?r=health" | python3 -m json.tool 2>/dev/null || curl -s "$BASE/api?r=health"
echo ""
echo "=== Login Test ==="
read -rp "Username: " U
read -rsp "Password: " P; echo ""
curl -sf -X POST "$BASE/api?r=auth%2Flogin" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$U\",\"password\":\"$P\"}" | python3 -m json.tool 2>/dev/null || echo "No response"
CHECKEOF
chmod +x "$DIR/check.sh"
ok "check.sh created"

# ──────────────────────────────────────────────────────────────────────────
hdr "🎉 All Done!"
# ──────────────────────────────────────────────────────────────────────────

echo -e "  ${W}Deployed URLs:${N}"
echo -e "  ERP     : ${C}https://erp.alpha-01.info${N}  (after DNS)"
echo -e "  Landing : ${C}https://alpha-01.info${N}       (after DNS)"
echo -e "  GitHub  : ${C}https://github.com/$GH_USER/$GH_REPO${N}"
echo ""
echo -e "  ${W}Login:${N}  ${C}$C_USER${N} / ${C}$C_PASS${N}  ${Y}← Change after first login!${N}"
echo ""
echo -e "  ${W}Next steps:${N}"
echo -e "  Verify health  : ${C}bash check.sh${N}"
echo -e "  Push updates   : ${C}bash push.sh 'commit message'${N}"
echo ""
echo -e "${W}${G}  Alpha Quantum ERP v20 ⚛  Ready! 🚀${N}"
echo ""
