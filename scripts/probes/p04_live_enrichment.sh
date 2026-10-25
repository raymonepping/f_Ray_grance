#!/usr/bin/env bash
# Phase 04 live exit gate: resolve + enrich through the real gateway and the real Scento
# API, as a synthetic owner (removed afterwards). Catalogue data (Phantom in Red) is kept.
set -uo pipefail
GW=http://localhost:8470
CFG="${FRAY_CONFIG_DIR:-$HOME/.config/f-ray-grance}"
here="$(cd "$(dirname "$0")" && pwd)"
J() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }
u="probe-$(openssl rand -hex 3)"
pw="$(openssl rand -base64 24)"
printf '%s\n' "$pw" | FRAY_OWNER_PASSWORD_STDIN=1 bash "$here/../owner.sh" create "$u" "Probe" >/dev/null
jar="$(mktemp)"
printf '{"username":"%s","password":"%s"}' "$u" "$pw" | curl -s -c "$jar" -o /dev/null -H 'Content-Type: application/json' -H "Origin: $GW" -d @- $GW/api/v1/auth/login
unset pw
csrf="$(awk '$6=="__Host-fray_csrf"{print $7}' "$jar")"
P() { curl -s -b "$jar" -H 'Content-Type: application/json' -H "Origin: $GW" -H "x-csrf-token: $csrf" -d "$2" "$GW$1"; }
echo '== resolve Rabanne Phantom In Red (live Scento)'
P /api/v1/fragrances/resolve '{"brand":"Rabanne","name":"Phantom In Red"}' | J '"state="+d["state"]+" provider="+str((d.get("profile") or {}).get("providerId"))+" concentration="+str((d.get("profile") or {}).get("concentration"))+" top="+str((d.get("profile") or {}).get("pyramid",{}).get("top"))'
echo '== resolve Rabanne Invictus Elixir (must NOT become Victory Elixir)'
P /api/v1/fragrances/resolve '{"brand":"Rabanne","name":"Invictus Elixir"}' | J '"state="+d["state"]+" code="+str(d.get("errorCode"))+" near="+str([(c["name"],c["match"]) for c in d["candidates"]][:3])'
echo '== resolve Rabanne 1 Million Black'
P /api/v1/fragrances/resolve '{"brand":"Rabanne","name":"1 Million Black"}' | J '"state="+d["state"]+" code="+str(d.get("errorCode"))'
echo '== enrich Phantom in Red'
out="$(P /api/v1/fragrances/enrich '{"providerId":"phantom-in-red-rabanne","brand":"Rabanne","name":"Phantom In Red"}')"
echo "$out" | J '"fragranceId="+d["fragranceId"]+" created="+str(d["created"])+" partial="+str(d["partial"])+" source="+d["sourceUrl"]'
id="$(echo "$out" | J 'd["fragranceId"]')"
echo '== effective profile'
curl -s -b "$jar" "$GW/api/v1/fragrances/$id/profile" | J '"status="+d["fragrance"]["identity_status"]+" | "+", ".join(k+":"+v["origin"] for k,v in sorted(d["fields"].items()))+" | checked="+d["fields"]["pyramid"]["source"]["checkedAt"]'
echo '== enrich wrong identity (Victory record as Invictus Elixir) must be refused'
P /api/v1/fragrances/enrich '{"providerId":"invictus-victory-elixir-rabanne","brand":"Rabanne","name":"Invictus Elixir"}' | J '"code="+d["error"]["code"]+" scento="+str(d["error"]["details"]["scento"])'
rm -f "$jar"
podman exec -i fray-api node apps/api/dist/cli/owner.js delete-synthetic "$u" >/dev/null && echo "synthetic owner $u removed"
podman exec fray-postgres psql -X -At -U postgres -d fray -c "SELECT 'db: fragrances='||count(*) FILTER (WHERE identity_status='verified')||' verified, notes='||(SELECT count(*) FROM app.fragrance_notes)||', source_records='||(SELECT count(*) FROM app.source_records) FROM app.fragrances"
