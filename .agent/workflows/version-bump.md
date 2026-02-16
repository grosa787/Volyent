---
description: Bump app version by 0.0.1 after every code change to the desktop app
---

# Version Bump Rule

After **every code edit** to the desktop application (`apps/desktop/`), increment the version by `0.0.1` in:

1. `/Users/arseniirostovcev/Desktop/Volyent/apps/desktop/package.json` — update the `"version"` field

// turbo
Run: `cd /Users/arseniirostovcev/Desktop/Volyent/apps/desktop && node -e "const p=require('./package.json');const v=p.version.split('.');v[2]=parseInt(v[2])+1;p.version=v.join('.');require('fs').writeFileSync('./package.json',JSON.stringify(p,null,2)+'\n');console.log('Version bumped to '+p.version)"`
