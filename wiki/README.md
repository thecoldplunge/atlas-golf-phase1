# Wiki source mirror

This folder mirrors the content of the [GitHub wiki](https://github.com/thecoldplunge/atlas-golf-phase1/wiki). Pages here are the canonical source — push changes here first, then sync to the wiki.

## Pages

- `Home.md` → wiki landing page
- `Current-State.md` → what's actually in the build right now (kept honest)
- `Grand-Vision.md` → the full game design
- `Backstory.md` → the World Bible / lore
- `Roadmap.md` → phased path from Current State → Grand Vision
- `Glossary.md` → terms reference

## Syncing to the GitHub wiki

```bash
git clone https://github.com/thecoldplunge/atlas-golf-phase1.wiki.git /tmp/atlas-golf-phase1.wiki
cp wiki/*.md /tmp/atlas-golf-phase1.wiki/
cd /tmp/atlas-golf-phase1.wiki
git add -A && git commit -m "Sync wiki from repo" && git push
```

> GitHub wikis require the first page to be created via the web UI before the `.wiki.git` remote is available. Once initialized, the sync command above works.
