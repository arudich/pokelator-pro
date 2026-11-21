"""Package only public runtime assets: python3 scripts/build_site.py [OUTPUT]."""
import hashlib
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build(output=None, root=ROOT):
    root=Path(root).resolve();output=Path(output or root/'dist').resolve()
    if output==root or output in root.parents or output.is_symlink():
        raise ValueError('Output must be a separate build directory')
    sources=[root/'index.html',root/'styles.css',*sorted(root.glob('*.js'))]
    for folder in ['components','data','vendor']:
        sources.extend(p for p in sorted((root/folder).rglob('*')) if p.is_file() and (p.suffix in ['.js','.json','.txt'] or p.parent==root/'vendor' and p.name in ['SHA256SUMS','SMOGON-LICENSE','SHOWDOWN-LICENSE']))
    for folder in ['tutorial','branding']:
        sources.extend(p for p in sorted((root/'assets'/folder).glob('*.png')) if p.is_file())
    digest=hashlib.sha256()
    for path in sources:
        digest.update(str(path.relative_to(root)).encode());digest.update(path.read_bytes())
    version=digest.hexdigest()[:16]
    if output.exists():
        if any(output.iterdir()) and not (output/'.pokelator-build').exists():raise ValueError('Refusing to replace a directory not created by this builder')
        shutil.rmtree(output)
    output.mkdir(parents=True)
    (output/'.pokelator-build').write_text('Generated static assets\n')
    for path in sources:
        relative=path.relative_to(root);target=output/relative;target.parent.mkdir(parents=True,exist_ok=True)
        if path.suffix in ['.html','.js','.css'] and relative.parts[0]!='vendor':
            target.write_text(re.sub(r'([\w./-]+\.(?:js|css))\?v=[\w-]+',rf'\g<1>?v={version}',path.read_text()))
        else:shutil.copy2(path,target)
    for path in (root/'public').glob('*'):
        if path.is_file():shutil.copy2(path,output/path.name)
    print(f'Built {len(sources)} runtime assets in {output}; release {version}')
    return output


if __name__=='__main__':build(sys.argv[1] if len(sys.argv)>1 else None)
