#!/usr/bin/env bash
# §8.2 acceptance suite for dsh-plugin-vision.
# Covers the static and channel-level items; the two items that require the
# live model tool (tool-list visibility, in-session concurrent see calls) are
# recorded by the executing agent in ACCEPTANCE.md from real tool calls.
set -u
cd "$(dirname "$0")/.."
LOG="test/acceptance.log"
: > "$LOG"
note() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

note "== build =="
npm run build >>"$LOG" 2>&1 && note "build: PASS" || { note "build: FAIL"; exit 1; }

note "== test images =="
python3 test/gen_test_images.py >>"$LOG" 2>&1
python3 - <<'PY' >>"$LOG" 2>&1
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (720, 240), 'white')
d = ImageDraw.Draw(img)
font = None
for p in ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial.ttf']:
    try:
        font = ImageFont.truetype(p, 40); break
    except Exception:
        continue
if font is None:
    font = ImageFont.load_default()
d.text((40, 40), 'Hello Vision Test', font=font, fill='black')
d.text((40, 110), 'Order ID: 12345', font=font, fill='black')
d.text((40, 180), 'Total: $99.50', font=font, fill='black')
img.save('/tmp/vision_test.png')
print('EN_OK')
PY
printf 'this is not an image, just plain text bytes pretending' > /tmp/not-an-image.png
test -f /tmp/ui_cn.png && test -f /tmp/chart.png && test -f /tmp/vision_test.png && note "test images: PASS" || note "test images: FAIL"

note "== channel + tool unit tests (items 1,2,3,5,7,8) =="
if node test/unit.mjs > test/unit.log 2>&1; then note "unit.mjs: PASS"; else note "unit.mjs: FAIL"; fi
tail -1 test/unit.log | tee -a "$LOG"
cat test/unit.log >> "$LOG"

note "== item 8: key-material scan =="
# The key NAME may only appear at legitimate sites: the credential-read code
# (credentials.ts/vlm.mjs), the config defaults (index.ts), the README config
# table, and the test harness/scanner itself. Anywhere else = leak.
ALLOWED_NAME='src/credentials\.(ts|js)|src/index\.ts|lib/index\.js|dyn/vlm\.mjs|README\.md|test/(unit\.mjs|verify\.sh|acceptance\.log)'
HITS=$(grep -rn "OPENCODE_GO_API_KEY" src lib test scripts dyn README.md package.json 2>/dev/null)
BAD=$(printf '%s\n' "$HITS" | grep -v -E "$ALLOWED_NAME" | wc -l | tr -d ' ')
if [ "$BAD" = "0" ]; then note "key NAME outside allowed sites: 0 hits (PASS)"; else note "key NAME outside allowed sites: FAIL"; printf '%s\n' "$HITS" | grep -v -E "$ALLOWED_NAME"; fi
KEY=$(python3 -c "import yaml; print(yaml.safe_load(open('$HOME/.dsh/.credentials.yaml'))['OPENCODE_GO_API_KEY'])" 2>/dev/null)
if [ -n "$KEY" ]; then
  VALUE_HITS=$(grep -rl -- "$KEY" src lib test scripts dyn README.md package.json 2>/dev/null | wc -l | tr -d ' ')
  if [ "$VALUE_HITS" = "0" ]; then note "key VALUE in the tree: 0 files (PASS)"; else note "key VALUE in the tree: FAIL — $(grep -rl -- "$KEY" src lib test scripts dyn README.md package.json | tr '\n' ' ')"; fi
  LOG_HITS=$(grep -rl -- "$KEY" test/acceptance.log test/unit.log 2>/dev/null | wc -l | tr -d ' ')
  if [ "$LOG_HITS" = "0" ]; then note "key VALUE in run logs: 0 files (PASS)"; else note "key VALUE in run logs: FAIL — $LOG_HITS"; fi
else
  note "key VALUE scan: SKIPPED (no credential value resolvable)"
fi

note "== item 7: orphan subprocess scan =="
sleep 1
ORPHANS=$(pgrep -f "ocr\.swift|ascii\.py|prep\.py|dims\.py" | wc -l | tr -d ' ')
if [ "$ORPHANS" = "0" ]; then note "orphan swift/python3 processes: 0 (PASS)"; else note "orphan swift/python3 processes: FAIL ($ORPHANS)"; pgrep -fl "ocr\.swift|ascii\.py|prep\.py|dims\.py"; fi

note "== summary =="
FAILS=$(grep -c "FAIL" "$LOG")
note "acceptance.log written ($FAILS FAIL lines); live-tool items 4/6 recorded in ACCEPTANCE.md"
