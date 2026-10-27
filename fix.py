import re
f = open('src/lib/workera/sync.ts')
c = f.read()
c = c.replace('shift: rec.shift or empty,', 'shift: rec.shift or "",')
f = open('src/lib/workera/sync.ts', 'w')
f.write(c)
f.close()
