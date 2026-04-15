# Recipe Pantry App

A single-page web app for tracking pantry ingredients and the recipes that use them. Cook a recipe and the app automatically subtracts the right amount from your pantry — with unit conversion and scaling.

Built as the final project for JavaScript for Web Development, Spring 2026.

## Live Demo

[View the live app](INSERT_YOUR_GITHUB_PAGES_URL_HERE)

## Features

**Pantry management**

- Add, top up, and delete ingredients
- Two ingredient types: _measured_ (flour, sugar — stored in cooking units) and _discrete_ (eggs, apples — counted as whole items)
- Top-up flow accepts a package quantity in any compatible unit and converts it to the ingredient's canonical unit before adding
- Real-time search filter
- Sorted by quantity ascending so low-stock items rise to the top
- Low-stock warning highlights names in red and bolds the quantity (under 3 for discrete, under 1 canonical unit for measured)

**Recipes**

- Full create / read / update / delete on recipes
- Each recipe has a name, instructions, optional image URL, and any number of ingredient rows
- Ingredient rows reference pantry ingredients by ID (so renaming an ingredient updates every recipe that uses it)
- Discrete ingredients automatically lock the unit dropdown to "unit" — you can't accidentally ask for 1 tsp of egg

**Recipe detail view**

- Side-by-side comparison of needed quantity vs. pantry quantity
- Insufficient ingredients are highlighted in red and bold
- Scale buttons (½×, 1×, 2×) re-render the ingredient list at the chosen scale and re-check sufficiency
- Cook button validates everything first, then deducts from the pantry — never leaves the pantry in a half-cooked state

**Other**

- All data persists across page reloads via `localStorage`
- Single-page app — no full page reloads, navigation is handled by JavaScript view-swapping
- Flash notifications in the top-right corner for all user feedback (no jarring `alert()` popups)
- XSS-safe: user-supplied text is rendered with `createElement` + `textContent` rather than `innerHTML` wherever possible

## Architecture Notes

The whole app revolves around a single `state` object that holds the ingredients array, recipes array, and various UI flags (current view, what's being edited, etc.). Every action follows the same pattern: update state → save to localStorage → call `render()` to redraw the current view.

`render()` looks at `state.current_view` and picks the appropriate view function. Each view returns either an HTML string (for static structural shells with no user data) or a DOM tree built with `createElement` (for everything that includes user-supplied text). This hybrid approach keeps the structural HTML readable while making user data structurally safe against XSS attacks.

Two utility functions do most of the heavy lifting:

- `convert(quantity, fromUnit, toUnit)` handles all unit conversions, returning `null` for incompatible families (e.g. cups → grams).
- `formatQty(number)` turns numbers into recipe-friendly strings like `"1 1/2"` or `"2 3/4"`, with float tolerance so `0.333` displays as `1/3`.

The cook handler uses a two-phase pattern: first walk every ingredient and validate, collecting any problems into a list. Only if the list is empty does it actually deduct from the pantry. This means a partially-satisfiable recipe never leaves the pantry in a weird half-deducted state.
