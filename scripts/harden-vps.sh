#!/bin/bash
# ============================================================================
# harden-vps.sh - Durcissement Ubuntu pour le VPS GifStudio-X
#
# A executer EN ROOT (sudo) sur le VPS, une seule fois.
# ============================================================================

set -e

# Verifier qu'on est root
if [ "$EUID" -ne 0 ]; then
    echo "Lance avec sudo : sudo bash harden-vps.sh"
    exit 1
fi

cyan='\033[0;36m'
green='\033[0;32m'
yellow='\033[0;33m'
nc='\033[0m'

step() { echo -e "\n${cyan}==> $1${nc}"; }
ok()   { echo -e "  ${green}[OK]${nc} $1"; }
warn() { echo -e "  ${yellow}[!]${nc} $1"; }

step "1. Mise a jour des paquets"
apt-get update
apt-get upgrade -y
ok "Paquets a jour"

step "2. UFW (firewall)"
apt-get install -y ufw

# Reset au cas ou
ufw --force reset

# Politique par defaut
ufw default deny incoming
ufw default allow outgoing

# Ouvertures necessaires
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (Let-s Encrypt + redirect)'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 25/tcp comment 'SMTP (mailou)'

# Activer
echo "y" | ufw enable
ufw status verbose
ok "UFW active"

step "3. fail2ban (anti brute-force)"
apt-get install -y fail2ban

# Config minimale pour SSH
cat > /etc/fail2ban/jail.d/ssh.conf <<'EOF'
[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
maxretry = 3
findtime = 600
bantime = 3600
EOF

# Pour Nginx Basic Auth (gifstudio-x)
cat > /etc/fail2ban/jail.d/nginx-auth.conf <<'EOF'
[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 5
findtime = 600
bantime = 1800
EOF

systemctl enable fail2ban
systemctl restart fail2ban
fail2ban-client status
ok "fail2ban configure"

step "4. SSH hardening (key-only, pas de root)"

# Backup config existante
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup-$(date +%Y%m%d-%H%M%S)

# Modifications
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#*ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*UsePAM.*/UsePAM yes/' /etc/ssh/sshd_config

# Test config avant reload
sshd -t
if [ $? -eq 0 ]; then
    systemctl reload sshd
    ok "SSH durci (password auth desactivee, root login interdit)"
else
    warn "Config SSH invalide -> rollback"
    cp /etc/ssh/sshd_config.backup-* /etc/ssh/sshd_config
fi

step "5. unattended-upgrades (MAJ securite auto)"
apt-get install -y unattended-upgrades apt-listchanges

# Active les MAJ securite auto
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

# Config : seulement les MAJ securite (pas les autres)
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
EOF

systemctl enable unattended-upgrades
systemctl restart unattended-upgrades
ok "MAJ auto activees (securite uniquement)"

step "6. ClamAV (antivirus a la demande)"
apt-get install -y clamav clamav-daemon

# Mise a jour de la base de signatures
systemctl stop clamav-freshclam
freshclam || warn "freshclam echoue (peut-etre temporairement, relance plus tard)"
systemctl start clamav-freshclam
systemctl enable clamav-freshclam
ok "ClamAV installe"
warn "Pour scanner le storage : sudo clamscan -r /var/www/gifstudio-x/storage"

step "7. Audit rapide (rkhunter)"
apt-get install -y rkhunter
rkhunter --update || true
ok "rkhunter installe (lance manuellement : sudo rkhunter --check --skip-keypress)"

step "8. Resume"
echo ""
echo "Hardening termine."
echo ""
echo "Verifs :"
echo "  ufw status               # firewall"
echo "  fail2ban-client status   # services proteges"
echo "  systemctl status sshd    # SSH"
echo ""
echo "Tests recommandes :"
echo "  - Reconnecte-toi en SSH (depuis une AUTRE session) pour confirmer que ca marche"
echo "  - sudo clamscan --version"
echo ""
warn "ATTENTION : si tu te reconnectes par SSH et ca echoue, ne ferme PAS la session actuelle."
warn "Tu auras besoin d'elle pour reverter sshd_config."
