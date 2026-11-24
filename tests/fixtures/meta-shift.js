/* Test-only meta earthquake: mechanics/legality stay intact; popularity and builds change. */
(data, kind, shifted, fixtures) => {
  if (kind === 'roster') {
    if (shifted) for (const format of ['Singles', 'Doubles']) {
      const maximum = Math.max(...data.pokemon.map(p => p.usage?.[format]?.rank || 0));
      for (const species of data.pokemon) {
        const usage = species.usage?.[format];
        if (!usage) continue;
        usage.rank = maximum + 1 - usage.rank;
        for (const category of ['moves', 'items', 'abilities', 'natures', 'spreads']) {
          const rows = usage[category] || [], percentages = rows.map(row => row.percent).reverse();
          rows.forEach((row, i) => { row.percent = percentages[i]; row.rank = rows.length - i; });
          rows.sort((a, b) => a.rank - b.rank);
        }
        for (const row of usage.spreads || []) {
          const i = row.investment;
          [i.atk, i.spa] = [i.spa, i.atk];
          [i.def, i.spd] = [i.spd, i.def];
        }
      }
    }
    // Named regression scenarios are intentionally independent of the current ladder.
    for (const species of data.pokemon) if (fixtures[species.name]) species.usage = fixtures[species.name];
  } else if (shifted) {
    for (const format of Object.values(data.formats)) {
      const rows = Object.values(format.species), values = rows.map(row => row.percent).reverse();
      rows.forEach((row, i) => { row.percent = values[i]; row.rank = rows.length + 1 - row.rank; });
    }
  }
}
