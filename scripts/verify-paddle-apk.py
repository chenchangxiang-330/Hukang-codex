#!/usr/bin/env python3
"""Verify actual APK contents, not just Gradle intentions. No device inference here."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
apk = Path(sys.argv[1])
aapt = sys.argv[2]
manifest = json.loads((root / 'models/paddleocr/v5-mobile/manifest.json').read_text())
lock = json.loads((root / 'models/paddleocr/v5-mobile/source-lock.json').read_text())
badging = subprocess.check_output([aapt, 'dump', 'badging', str(apk)], text=True)
if "sdkVersion:'24'" not in badging:
    raise ValueError('APK minimum API differs from 24')
if 'com.hukang.local.clouddebug' not in badging:
    raise ValueError('Not the isolated test package')
assets = {}
with zipfile.ZipFile(apk) as z:
    names = set(z.namelist())
    for key, item in manifest['models'].items():
        for path, sha in [(item['bundledPath'], item['sha256']), (item['configPath'], lock['models'][key]['configSha256'])]:
            data = z.read('assets/' + path)
            measured = hashlib.sha256(data).hexdigest()
            if measured != sha:
                raise ValueError('APK asset digest mismatch: ' + path)
            assets[path] = {'bytes': len(data), 'sha256': measured}
    for path in ['LICENSE-PaddleOCR.txt', 'NOTICE.md', 'manifest.json', 'source-lock.json']:
        if not z.read('assets/models/paddleocr/v5-mobile/' + path):
            raise ValueError('Missing model notice: ' + path)
    native = {}
    for abi in ['arm64-v8a', 'x86_64']:
        native[abi] = {}
        for name in ['libonnxruntime.so', 'libonnxruntime4j_jni.so', 'libopencv_java4.so']:
            path = 'lib/' + abi + '/' + name
            data = z.read(path)
            native[abi][name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    abis = sorted({p.split('/')[1] for p in names if p.startswith('lib/') and p.endswith('.so')})
    if abis != ['arm64-v8a', 'x86_64']:
        raise ValueError('Unexpected ABI set: ' + repr(abis))
    bundle = z.read('assets/index.android.bundle')
    if len(sys.argv) > 3 and sys.argv[3].encode() not in bundle:
        raise ValueError('Exact source SHA not found in bundled diagnostics')
print(json.dumps({'status': 'verified_actual_apk', 'apkBytes': apk.stat().st_size,
    'apkSha256': hashlib.sha256(apk.read_bytes()).hexdigest(), 'minSdk': 24, 'abis': abis,
    'assets': assets, 'nativeLibraries': native, 'bundledSourceCommit': sys.argv[3] if len(sys.argv)>3 else None,
    'deviceInference': 'NOT_RUN_BY_THIS_STATIC_CHECK'}, indent=2))
