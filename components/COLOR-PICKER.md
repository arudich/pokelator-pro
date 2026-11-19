# Detailed color picker

Standalone Web Component in `color-picker.js`. Keep this component after removing the temporary app editor.

Load the script, then use `<detailed-color-picker></detailed-color-picker>`.

- Set `.value` to `#RRGGBB` or `#RRGGBBAA`; setting it does not fire an event.
- Read `.value` for the current normalized hex color.
- Listen for `color-change`; `event.detail.value` contains the new color. The event bubbles across the shadow boundary.
- Includes native swatch selection, editable hex/RGB, HSL and opacity sliders, alpha preview and presets.
- Uses isolated shadow styles and no external dependencies, storage or application state.

The current compact accordion dialog in `index.html` is temporary. Its application wiring is `setupItemHighlightEditor()` in `app.js`; only one picker expands at once, the header supports pointer dragging, and saved item/app colors live in UI settings, independent of battle/team state. Removing that dialog and wiring does not require deleting this component.

The app host also implements a Pick element mode in `setupItemHighlightEditor()`. It maps UI surfaces/controls to theme tokens, previews the target, consumes selection clicks and expands the matching row. This mapping belongs to the host app, not the standalone picker.

Color changes are live previews in the host. Lock In commits the palette to localStorage; Reset Colors restores that committed user palette. The component itself remains storage-free.
