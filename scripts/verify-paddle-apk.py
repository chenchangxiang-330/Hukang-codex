#!/usr/bin/env python3
"""Verify actual APK contents, not just Gradle intentions. No device inference here."""
import hashlib
import json
import re
import struct
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
package = re.search(r"package: name='([^']+)'", badging).group(1)
expected_package = 'com.hukang.local.clouddebug.p' + sys.argv[3][:10] if len(sys.argv) > 3 else 'com.hukang.local.clouddebug'
if package != expected_package:
    raise ValueError('Not the isolated test package')
assets = {}
licenses = {}
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
    for filename in ['PaddleOCR-APACHE-2.0.txt', 'ONNXRuntime-MIT.txt', 'OpenCV-APACHE-2.0.txt', 'QuickBird-BSD-3-Clause.txt', 'PADDLE_THIRD_PARTY_NOTICES.md']:
        source = root / 'android/app' / (filename if filename.endswith('.md') else 'licenses/' + filename)
        data = z.read('assets/licenses/paddleocr/' + filename)
        if not data or data != source.read_bytes():
            raise ValueError('Bundled license differs from source: ' + filename)
        licenses[filename] = hashlib.sha256(data).hexdigest()
    native = {}
    for abi in ['arm64-v8a', 'x86_64']:
        native[abi] = {}
        for name in ['libonnxruntime.so', 'libonnxruntime4j_jni.so', 'libopencv_java4.so']:
            path = 'lib/' + abi + '/' + name
            data = z.read(path)
            if data[:6] != b'\x7fELF\x02\x01':
                raise ValueError('Expected little-endian 64-bit ELF: ' + path)
            phoff = struct.unpack_from('<Q', data, 32)[0]
            phentsize, phnum = struct.unpack_from('<HH', data, 54)
            alignments = [struct.unpack_from('<IIQQQQQQ', data, phoff + i * phentsize)[7]
                          for i in range(phnum) if struct.unpack_from('<I', data, phoff + i * phentsize)[0] == 1]
            native[abi][name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                                'elfLoadAlignments': alignments, 'elfLoad16kAligned': bool(alignments) and min(alignments) >= 16384}
    abis = sorted({p.split('/')[1] for p in names if p.startswith('lib/') and p.endswith('.so')})
    if abis != ['arm64-v8a', 'x86_64']:
        raise ValueError('Unexpected ABI set: ' + repr(abis))
    bundle = z.read('assets/index.android.bundle')
    if len(sys.argv) > 3 and sys.argv[3].encode() not in bundle:
        raise ValueError('Exact source SHA not found in bundled diagnostics')
print(json.dumps({'status': 'verified_actual_apk', 'apkBytes': apk.stat().st_size,
    'apkSha256': hashlib.sha256(apk.read_bytes()).hexdigest(), 'package': package, 'minSdk': 24, 'abis': abis,
    'assets': assets, 'licenses': licenses, 'nativeLibraries': native, 'bundledSourceCommit': sys.argv[3] if len(sys.argv)>3 else None,
    'page16kCompatibility': 'NOT_VERIFIED; OpenCV 4.5.3.0 prebuilt ELF currently has 4KiB LOAD alignment',
    'deviceInference': 'NOT_RUN_BY_THIS_STATIC_CHECK'}, indent=2))
