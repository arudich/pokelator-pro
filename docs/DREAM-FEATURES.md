# Dream Features

This document tracks features that are intentionally beyond the MVP horizon but worth preserving as product direction and future inspiration.

## Open source evolutionary deployment model
The website can be live-updated by pushing to a version control system. A public or semi-public repository drives the app's live deployment, and anyone can branch off main.

### Detailed idea
- Every branch is selectable from the website in a subtle, out-of-the-way area.
- Users can launch a version of the site from any branch to test or play that build.
- Branches can be merged into main or used to overwrite main if maintainers decide that version should be the default for everyone.
- This creates a lightweight open-source model where experimentation is encouraged but the live site remains controlled by maintainers.

### Benefits
- Fast iteration without a separate deployment pipeline for every experiment
- Transparent, branch-based iteration history
- Easy testing of large changes before they become the default experience
- Community contribution without exposing the shipping branch to accidental instability

### Risks to manage
- Branch selection UI should not clutter the main battle experience.
- Default app branch should remain obvious to regular users.
- Version switching should be clear and low-risk for anyone using the site in a standard session.

## Notes
These are not immediate MVP tasks. The goal is to preserve the direction so the system can evolve without losing the original project philosophy.
