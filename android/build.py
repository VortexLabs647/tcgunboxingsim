from pathlib import Path
import os,subprocess,secrets,json,zipfile,hashlib
root=Path(__file__).resolve().parent;sdk=Path(os.environ.get('TCG_ANDROID_TOOLS',str(root.parent/'android-tools')));tools=sdk/'android-15';platform=sdk/'android-35-ext15/android.jar';build=root/'build';build.mkdir(exist_ok=True)
for name in ['aapt','aapt2','zipalign','apksigner','d8']:(tools/name).chmod(0o755)
env=os.environ.copy();env['LD_LIBRARY_PATH']=str(tools/'lib64')
key=Path(os.environ['TCG_SIGNING_KEYSTORE'])
if not key.is_file() or not env.get('TCG_SIGNING_PASSWORD'):raise SystemExit('Provide the existing release keystore and signing password via environment variables.')
def run(args):subprocess.run([str(x) for x in args],check=True,env=env,cwd=root)
import shutil
website=root.parent;assets=root/'assets/game';assets.mkdir(parents=True,exist_ok=True)
for p in website.iterdir():
 if p.suffix in {'.js','.json','.html','.css','.webmanifest','.webp','.png','.svg','.ttf','.woff2'} and p.name!='sw.js':shutil.copy2(p,assets/p.name)
p=assets/'index.html';p.write_text(p.read_text().replace('<head>','<head><script>window.TCGAndroid={openExternal:function(url){location.href=url;}};</script>',1))
run([tools/'aapt','package','-f','-M',root/'AndroidManifest.xml','-S',root/'res','-A',root/'assets','-I',platform,'-F',build/'resources.apk'])
run(['java','-jar',sdk/'ecj.jar','-1.8','-proc:none','-classpath',platform,'-d',build/'classes',root/'src/com/vortalyx/tcgunboxingsim/MainActivity.java'])
(build/'dex').mkdir(exist_ok=True)
run(['java','-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--min-api','26','--lib',platform,'--output',build/'dex',*sorted((build/'classes').rglob('*.class'))])
with zipfile.ZipFile(build/'resources.apk','a') as z:z.write(build/'dex/classes.dex','classes.dex')
run([tools/'zipalign','-f','4',build/'resources.apk',build/'aligned.apk'])
out=root/'TCG_Unboxing_Sim.apk'
run([tools/'apksigner','sign','--ks',key,'--ks-key-alias','tcg-release','--ks-pass','env:TCG_SIGNING_PASSWORD','--key-pass','env:TCG_SIGNING_PASSWORD','--out',out,build/'aligned.apk'])
run([tools/'apksigner','verify','--verbose',out]);run([tools/'aapt','dump','badging',out]);print('APK SHA256',hashlib.sha256(out.read_bytes()).hexdigest())
