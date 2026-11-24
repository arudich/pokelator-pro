# Publishing UI changes

- Resolve UI changes locally first. Do not push/deploy local UI work without the owner's approval.
- Before **any live push that includes UI changes**, review every picture in the first-visit tutorial (`assets/tutorial/`). Refresh every picture containing any changed UI element, even when that tutorial screen explains an unrelated feature. Review captions and accessibility text against current behavior too.
- Do **not** continually refresh tutorial pictures during local batches of UI work; refresh them at the final pre-publish review. The initial tutorial implementation is an exception because it needs its first pictures.
- Use `scripts/capture_tutorial.py` to reproduce the pictures, then visually inspect all five. See `docs/TUTORIAL.md` for coverage and capture details.
- Never modify `docs/Nitpicks.md` as part of implementation; it contains the owner's working notes.

# Changing meta data

- Do not make live-data tests assume fixed popularity ranks, common moves/items/abilities, nature frequencies, stat spreads, or favorable matchup outcomes. Derive expectations from the current snapshot or use explicit regression fixtures. See `tests/META-TESTING.md`.
- Preserve fresh-data integration and integrity checks. Large legitimate meta changes belong in the health report for review; they are not automatically collection failures.
