"""Push a verified data-only commit with a main-environment-scoped deploy key."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import urllib.request


def verify_paths(paths):
    if not paths or any(not path.startswith(('data/','vendor/')) or '..' in Path(path).parts for path in paths):
        raise ValueError('Nightly publisher may change only data/ and vendor/')


def main():
    if os.environ.get('GITHUB_REF')!='refs/heads/main':raise ValueError('Publishing is restricted to main')
    base=os.environ['EXPECTED_BASE']
    parent=subprocess.check_output(['git','rev-parse','HEAD^'],text=True).strip()
    if parent!=base:raise ValueError('Verified snapshot base changed')
    paths=subprocess.check_output(['git','diff','--name-only',base,'HEAD'],text=True).splitlines()
    verify_paths(paths)
    private=os.environ.pop('NIGHTLY_DEPLOY_KEY')
    with tempfile.TemporaryDirectory(prefix='verified-nightly-') as directory:
        key=Path(directory)/'key';key.write_text(private+'\n');key.chmod(0o600)
        # Fetch published SSH host keys over HTTPS, rather than trusting ssh-keyscan.
        headers={'User-Agent':'Pokelator verified publisher'}
        if os.environ.get('GITHUB_TOKEN'):headers['Authorization']='Bearer '+os.environ['GITHUB_TOKEN']
        request=urllib.request.Request('https://api.github.com/meta',headers=headers)
        with urllib.request.urlopen(request,timeout=30) as response:keys=json.load(response)['ssh_keys']
        if not keys:raise ValueError('GitHub SSH host keys unavailable')
        known=Path(directory)/'known_hosts';known.write_text(''.join('github.com '+host+'\n' for host in keys))
        env={**os.environ,'GIT_SSH_COMMAND':shlex.join(['ssh','-i',str(key),'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=20','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(known)])}
        subprocess.run(['git','push','git@github.com:arudich/pokelator-pro.git','HEAD:main'],env=env,check=True,timeout=90)


if __name__=='__main__':main()
