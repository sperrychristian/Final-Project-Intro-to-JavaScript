// ============================================================================
// RECIPE PANTRY APP
// ============================================================================
// A single-page app (SPA) for tracking a pantry of ingredients and recipes
// that use them. When the user "cooks" a recipe, the pantry is automatically
// decremented by the right amount, with unit conversion and optional scaling.
//
// The whole app lives in three files: index.html (structure), style.css
// (styling), and this file (all behavior and dynamic rendering).
// ============================================================================

// ----------------------------------------------------------------------------
// UNIT CONVERSION TABLES
// ----------------------------------------------------------------------------
// These two objects are the backbone of the unit conversion system. Each
// one represents a "family" of units that can be converted to each other.
// Inside each family I picked one unit as the BASE, and every other unit
// is stored as a multiplier of that base.
//
// Volume base = teaspoon, so 1 cup is 48 tsp, 1 tbsp is 3 tsp, etc.
// Weight base = gram, so 1 oz is about 28.35 g.
//
// Units from different families (e.g. cup and gram) cannot be converted
// because that would require knowing the density of the ingredient.

// Volume units, each expressed as how many teaspoons they equal.
const volume = { tsp: 1, tbsp: 3, cup: 48, ml: 0.202884 };

// Weight units, each expressed as how many grams they equal.
const weight = { g: 1, oz: 28.3495 };

// ----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// ----------------------------------------------------------------------------

// convert()
// Takes a quantity and two unit names. Returns the quantity expressed in
// the target unit, or null if the two units can't be converted.
function convert(quantity, from_unit, to_unit) {
  // If the caller asked to convert a unit to itself, nothing to do.
  // Just hand the number back unchanged.
  if (from_unit === to_unit) {
    return quantity;
  }

  // "unit" is the special placeholder used for discrete items like eggs.
  // It can only pair with itself (handled above). If either side is "unit"
  // and they weren't equal, the conversion is impossible.
  if (from_unit === "unit" || to_unit === "unit") {
    return null;
  }

  // Check if both units belong to the volume family.
  // `in` asks "does this key exist on the volume object?"
  if (from_unit in volume && to_unit in volume) {
    // Multiply by the from-unit's tsp value to turn the quantity into tsp.
    // Brackets (not dots) because from_unit is a variable holding the key name.
    let in_tsp = quantity * volume[from_unit];
    // Divide by the target unit's tsp value to turn tsp into the target unit.
    // This is the "multiply in, divide out" pattern used for every family.
    return in_tsp / volume[to_unit];
  }

  // Same pattern for weight — base unit is grams instead of tsp.
  if (from_unit in weight && to_unit in weight) {
    // Multiply into grams.
    let in_gram = quantity * weight[from_unit];
    // Divide out to the target unit.
    return in_gram / weight[to_unit];
  }

  // If we got here the units belong to different families (e.g. cup vs g).
  // Those aren't convertible, so return null. The caller decides what to do.
  return null;
}

// formatQty()
// Turns a number into a nice display string. Prefers recipe-style fractions
// like "1/2" or "2 3/4" when the decimal part is close enough to a known
// fraction. Falls back to a plain decimal if nothing matches.
function formatQty(quantity) {
  // Guard against bad inputs so the app never crashes on display.
  // Returning a string here matches everywhere else this function can return.
  if (quantity == null || isNaN(quantity)) {
    return "0";
  }

  // Negative quantities shouldn't exist in a pantry — floor them to zero.
  if (quantity < 0) {
    quantity = 0;
  }

  // Math.floor gives us the whole-number portion (e.g. 1.5 → 1).
  let whole_quantity = Math.floor(quantity);

  // Subtract the whole part to get just the decimal portion (1.5 → 0.5).
  let decimal = quantity - whole_quantity;

  // Known fractions I'm willing to display, stored as [value, label] pairs
  // so the loop can compare values and return labels in one pass.
  let fractions = [
    [0.125, "1/8"],
    [0.25, "1/4"],
    [1 / 3, "1/3"],
    [0.5, "1/2"],
    [2 / 3, "2/3"],
    [0.75, "3/4"],
  ];

  // How close a decimal has to be to a known fraction to count as a match.
  // I can't use === with floats because 1/3 is actually 0.3333333333333333,
  // not exactly one-third. Instead I check whether the gap is small enough.
  let tolerance = 0.02;

  // If the decimal part is basically zero, it's a clean whole number.
  // Return just the whole number as a string so the return type stays consistent.
  if (decimal < tolerance) {
    return String(whole_quantity);
  }

  // If the decimal part is basically 1 (e.g. 1.999 from a float quirk),
  // round up to the next whole number.
  if (decimal > 1 - tolerance) {
    return String(whole_quantity + 1);
  }

  // Walk through the known fractions looking for a match.
  for (let i = 0; i < fractions.length; i++) {
    // Pull the numeric value and the display label out of the pair.
    let value = fractions[i][0];
    let label = fractions[i][1];

    // Math.abs strips the sign so we measure the size of the gap regardless
    // of direction. If the gap is smaller than tolerance, call it a match.
    if (Math.abs(decimal - value) < tolerance) {
      // If there's a whole part, build a mixed number like "1 1/2".
      if (whole_quantity > 0) {
        return whole_quantity + " " + label;
      }
      // No whole part — just return the fraction like "1/2".
      return label;
    }
    // No match on this fraction. DO NOT put an else here; we want the
    // loop to keep checking the next fraction, not return the wrong label.
  }

  // If nothing matched, fall back to a two-decimal-place number.
  // Multiply by 100, round, divide by 100 — the classic "round to 2 places" trick.
  return (Math.round(quantity * 100) / 100).toString();
}

// replacing characters with html meaning with their entity equivilents to prevent XSS attacks
// escapeHtml()
// Takes a user-supplied string and replaces the five HTML-special characters
// with their entity equivalents so the string can safely be embedded in an
// HTML template literal. Only used in the few spots where I still build
// HTML strings that contain user data — everywhere else I use DOM methods
// with .textContent, which is structurally safe.
function escapeHtml(str) {
  // Nothing to escape if the input is null or undefined.
  if (str == null) return "";

  // Force into a string in case a number sneaks in, then run five replacements.
  return (
    String(str)
      // `&` MUST come first — if I replaced `<` first, the resulting `&lt;`
      // would get double-escaped into `&amp;lt;` when the `&` pass ran.
      .replace(/&/g, "&amp;")
      // Less-than and greater-than close off tag boundaries, so escape both.
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Quotes are dangerous inside HTML attributes (`alt="..."`) because
      // they could close the attribute and inject new ones.
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  );
}

// flash()
// Shows a small temporary notification in the top-right corner of the page.
// Used instead of alert() for all user feedback so it doesn't block the page.
function flash(message, type = "success") {
  // Grab the flash container from the HTML. It's a fixed element at the top
  // right that exists outside the #app SPA container, so it persists across renders.
  const container = document.getElementById("flash-container");

  // Build a new div for this specific flash message.
  const el = document.createElement("div");
  // Set the class based on success/error so CSS picks the right color.
  el.className = `flash flash-${type}`;
  // textContent (not innerHTML) because the message might contain user data
  // like an ingredient name — this keeps us safe from XSS.
  el.textContent = message;
  // Inline the transition so the fade animation works with the opacity change below.
  el.style.transition = "opacity 0.4s ease";

  // Drop the new flash into the container so it appears on screen.
  container.appendChild(el);

  // After 3.6 seconds, start the fade by setting opacity to 0. The CSS
  // transition above handles the actual animation over 400ms.
  setTimeout(() => {
    el.style.opacity = "0";
  }, 3600);

  // After 4 seconds total, remove the element from the DOM entirely.
  // The 400ms gap between the two timers matches the transition duration.
  setTimeout(() => {
    el.remove();
  }, 4000);
}

// ============================================================================
// APPLICATION STATE
// ============================================================================

// The single source of truth for the whole app. Every view reads from here,
// every action writes here and then (if needed) to localStorage, and after
// any change we call render() to redraw the current view.
let state = {
  // Persisted arrays — these get saved to localStorage so they survive page reloads.
  ingredients: [],
  recipes: [],

  // Which view is currently shown. Changed by nav buttons and by view-switch actions.
  current_view: "home",

  // Which recipe detail is open (used when current_view is "recipe_detail").
  current_recipe_id: null,

  // Which ingredient is being topped up (null = add mode, any id = top-up mode).
  editing_id: null,

  // Current text in the pantry search box. Resets on page reload.
  ingredient_filter: "",

  // Which recipe is being edited (null = create mode, any id = edit mode).
  editing_recipe_id: null,

  // In-progress list of ingredient rows while the recipe form is open.
  // Populated by initRecipeForm and mutated by the row event handlers.
  recipe_form_items: [],

  // Current scale multiplier for the recipe detail view: 0.5, 1, or 2.
  recipe_scale: 1,
};

// loadState()
// Called once at page load. Pulls the persisted arrays out of localStorage
// and puts them into state. If nothing is saved (first visit), leaves the
// empty arrays from the state declaration alone.
function loadState() {
  // localStorage only stores strings. These come back as JSON strings, or
  // null if the key doesn't exist yet.
  const saved_ingredients = localStorage.getItem("ingredients");
  const saved_recipes = localStorage.getItem("recipes");

  // Only replace the default empty array if we actually got data back.
  // Otherwise state.ingredients would become null and later .filter() calls
  // would crash.
  if (saved_ingredients) {
    // JSON.parse turns the string back into a real JavaScript array.
    state.ingredients = JSON.parse(saved_ingredients);
  }

  // Same for recipes.
  if (saved_recipes) {
    state.recipes = JSON.parse(saved_recipes);
  }
}

// saveState()
// Writes the current ingredients and recipes arrays to localStorage.
// Called after every data-changing action.
function saveState() {
  // JSON.stringify turns the array into a string so localStorage can store it.
  localStorage.setItem("ingredients", JSON.stringify(state.ingredients));
  localStorage.setItem("recipes", JSON.stringify(state.recipes));
}

// ============================================================================
// RENDERING
// ============================================================================

// render()
// The heart of the SPA. Looks at state.current_view and draws the right view
// into the #app container. Called any time the view or underlying data changes.
function render() {
  // Grab the SPA container. The nav, header, and flash container sit outside
  // of #app so they stay mounted across renders.
  const app = document.getElementById("app");

  // Home view — simple static HTML, no dynamic content.
  if (state.current_view === "home") {
    app.innerHTML = renderHome();
  }

  // Ingredients view — static form shell, then append the DOM-built list.
  else if (state.current_view === "ingredients") {
    // Step 1: put the shell HTML into #app.
    app.innerHTML = renderIngredients();
    // Step 2: build the pantry list as DOM nodes (XSS-safe) and append it
    // into the empty #ingredient-list div that the shell created.
    document
      .getElementById("ingredient-list")
      .appendChild(renderIngredientList());
    // Step 3: wire up the form submit, filter input, and dropdowns.
    attachIngredientListeners();
  }

  // Recipes list view — same 3-step pattern.
  else if (state.current_view === "recipes") {
    app.innerHTML = renderRecipes();
    document.getElementById("recipe-list").appendChild(renderRecipeList());
    attachRecipeListeners();
  }

  // Recipe form (create or edit) — same 3-step pattern.
  else if (state.current_view === "recipe_form") {
    app.innerHTML = renderRecipeForm();
    // The dynamic ingredient rows get built separately so they can be
    // re-rendered without touching the rest of the form.
    document
      .getElementById("recipe-items-container")
      .appendChild(renderRecipeItems());
    attachRecipeFormListeners();
  }

  // Recipe detail view — most complex branch because it has the scale
  // buttons and cook button plus the dynamic ingredient list.
  else if (state.current_view === "recipe_detail") {
    // Static shell first.
    app.innerHTML = renderRecipeDetail(state.current_recipe_id);

    // Look up the recipe. Might be missing if it was deleted.
    // find searches through the array and returns the first item where the
    // recipe id matches rather than using a for loop with an early return statement.
    const recipe = state.recipes.find((r) => r.id === state.current_recipe_id);

    // Only populate the dynamic pieces if the recipe actually exists.
    // If not, the shell already shows a "Recipe not found" message.
    if (recipe) {
      // Append the ingredient list (with sufficiency highlighting) into its slot.
      document
        .getElementById("recipe-detail-items")
        .appendChild(renderRecipeDetailItems(recipe));

      // Instructions go in via textContent (XSS-safe) and pre-wrap preserves
      // the user's line breaks when displayed.
      const inst_el = document.getElementById("recipe-detail-instructions");
      inst_el.textContent = recipe.instructions;
      inst_el.style.whiteSpace = "pre-wrap";

      // Walk every scale button and wire up its click handler.
      // data-scale attributes tell us which scale each button represents.
      document.querySelectorAll("[data-scale]").forEach((btn) => {
        // parseFloat because data attributes always come back as strings.
        const scale = parseFloat(btn.getAttribute("data-scale"));
        // If this button matches the current scale, highlight it.
        if (scale === state.recipe_scale) {
          btn.classList.add("active-scale");
        }
        // On click, update state and re-render so highlighting and
        // ingredient quantities refresh.
        btn.addEventListener("click", () => {
          state.recipe_scale = scale;
          render();
        });
      });

      // Cook button handler. The closure captures `recipe` so the handler
      // always knows which recipe to cook without re-looking it up.
      document
        .getElementById("cook-recipe-btn")
        .addEventListener("click", () => {
          handleCookRecipe(recipe);
        });
    }

    // Back button exists in both the normal and "not found" paths, so wire
    // it up unconditionally.
    document
      .getElementById("back-to-recipes-btn")
      .addEventListener("click", () => {
        state.current_view = "recipes";
        state.current_recipe_id = null;
        render();
      });
  }
}

// ----------------------------------------------------------------------------
// HOME VIEW
// ----------------------------------------------------------------------------

// renderHome()
// Returns the static welcome card. No user data, no escaping, no logic.
function renderHome() {
  return `
    <section class="card">
      <h2>Welcome</h2>
      <p>Manage your pantry and recipes. Cook a recipe to automatically subtract ingredients.</p>
    </section>
  `;
}

// ----------------------------------------------------------------------------
// INGREDIENTS VIEW
// ----------------------------------------------------------------------------

// renderIngredientList()
// Builds the pantry list as DOM nodes using createElement + textContent.
// This is the XSS-safe approach — user-supplied names never touch innerHTML.
// Filters by the search box, sorts by quantity ascending, highlights low stock.
function renderIngredientList() {
  // The outer container we'll return. Everything gets appended into this.
  const container = document.createElement("div");

  // Normalize the filter text once at the top so we don't do it inside the loop.
  // .trim() removes stray whitespace, .toLowerCase() makes matching case-insensitive.
  const filter_text = state.ingredient_filter.trim().toLowerCase();

  // Keep only ingredients whose lowercase name contains the filter text.
  // .includes() returns true for any substring match.
  const filtered = state.ingredients.filter((ing) =>
    ing.name.toLowerCase().includes(filter_text),
  );

  // .slice() with no args makes a shallow copy — this prevents .sort() from
  // mutating the underlying state array, which would permanently reorder it.
  // Then .sort() with a compare function sorts numerically, lowest first.
  const sorted = filtered
    .slice()
    .sort((a, b) => a.canonical_qty - b.canonical_qty);

  // Empty state: two possible messages.
  // If the pantry has zero items, show the "add one" prompt.
  // If the pantry has items but nothing matches the search, show that instead.
  if (sorted.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      state.ingredients.length === 0
        ? "No ingredients yet. Add one above to get started."
        : "No ingredients match your search.";
    container.appendChild(empty);
    return container;
  }

  // Walk each ingredient and build its row.
  sorted.forEach((ing) => {
    // The outer card wrapper for this ingredient.
    const item = document.createElement("div");
    item.className = "list-item";

    // Flex row so content is on the left, actions on the right.
    const row = document.createElement("div");
    row.className = "list-row";

    // Left side of the row — holds the name and meta line.
    const info = document.createElement("div");

    // Low-stock rule from the spec: <3 for discrete items, <1 canonical unit
    // for measured items. Ternary captures it in one line.
    const is_low_stock =
      ing.type === "discrete" ? ing.canonical_qty < 3 : ing.canonical_qty < 1;

    // Name goes in a <strong> for visual weight.
    const name = document.createElement("strong");
    // textContent (not innerHTML) — the whole point is to never parse user data as HTML.
    name.textContent = ing.name;
    // If the ingredient is low, add the .low-stock class so CSS turns it red.
    if (is_low_stock) name.classList.add("low-stock");

    // Format the quantity nicely (e.g. "1 1/2" instead of "1.5").
    const qty_display = formatQty(ing.canonical_qty);

    // Pick the right unit label: discrete gets "unit" or "units" (pluralized),
    // measured gets whatever canonical unit was stored.
    const unit_display =
      ing.type === "discrete"
        ? ing.canonical_qty === 1
          ? "unit"
          : "units"
        : ing.canonical_unit;

    // The meta line under the name showing qty + unit.
    const meta = document.createElement("div");
    meta.className = "muted";
    // Template literal to combine qty and unit into one string.
    meta.textContent = `${qty_display} ${unit_display}`;
    // For low stock, override the muted gray with bold.
    if (is_low_stock) {
      meta.style.fontWeight = "bold";
      meta.classList.remove("muted");
    }

    // Stack the name and meta into the info column.
    info.appendChild(name);
    info.appendChild(meta);

    // Right side of the row — Top Up and Delete buttons.
    const actions = document.createElement("div");
    actions.className = "actions";

    // Top Up button triggers the form's top-up mode for this ingredient.
    const topup_btn = document.createElement("button");
    topup_btn.className = "btn btn-small";
    topup_btn.textContent = "Top Up";
    // Closure over `ing` — we don't need a data-id attribute because the
    // handler has direct access to the ingredient object.
    topup_btn.addEventListener("click", () => {
      state.editing_id = ing.id;
      render();
    });

    // Delete button removes this ingredient from the pantry.
    const delete_btn = document.createElement("button");
    delete_btn.className = "btn btn-danger btn-small";
    delete_btn.textContent = "Delete";
    delete_btn.addEventListener("click", () => {
      handleDeleteIngredient(ing.id);
    });

    // Assemble the row: buttons into actions, info + actions into row, row into item.
    actions.appendChild(topup_btn);
    actions.appendChild(delete_btn);
    row.appendChild(info);
    row.appendChild(actions);
    item.appendChild(row);
    container.appendChild(item);
  });

  // Return the fully-built DOM tree. Caller appends it into #ingredient-list.
  return container;
}

// renderIngredients()
// Builds the static shell of the ingredients view: the form on top, the pantry
// card below. Returns an HTML string. The dynamic list gets added separately.
// The same form does double duty for "add" and "top up" modes.
function renderIngredients() {
  // Look up the ingredient being edited, if any. Null means we're in add mode.
  const editing = state.editing_id
    ? state.ingredients.find((ing) => ing.id === state.editing_id)
    : null;

  // Form title changes based on mode. escapeHtml on the name because it's
  // user data flowing into a template literal.
  const form_title = editing
    ? `Top Up: ${escapeHtml(editing.name)}`
    : "Add Ingredient";
  // Submit button label changes too.
  const submit_text = editing ? "Add to Pantry" : "Add Ingredient";

  // In add mode we show name and type fields. In top-up mode we OMIT them
  // entirely (not just hide with CSS) because hidden inputs with `required`
  // cause the browser's validator to complain about a non-focusable element.
  const name_and_type_html = editing
    ? ""
    : `
      <div>
        <label for="ing-name">Name</label>
        <input type="text" id="ing-name" required />
      </div>

      <div>
        <label for="ing-type">Type</label>
        <select id="ing-type">
          <option value="measured" selected>Measured (e.g., flour)</option>
          <option value="discrete">Discrete (e.g., eggs)</option>
        </select>
        <p class="tip">Measured ingredients use units like cups or grams. Discrete ingredients are counted as whole items.</p>
      </div>
    `;

  // Cancel button only exists in top-up mode so the user can back out.
  const cancel_button_html = editing
    ? `<button type="button" class="btn btn-secondary" id="cancel-edit-btn">Cancel</button>`
    : "";

  // Build and return the full HTML string. Fields are interpolated with ${}.
  return `
    <section class="card">
      <h2>${form_title}</h2>
      <form id="add-ingredient-form">
        ${name_and_type_html}

        <div>
          <label for="ing-qty">Quantity</label>
          <input type="number" id="ing-qty" step="0.01" min="0" value="1" required />
          ${editing ? `<p class="tip">This amount will be added to your existing ${escapeHtml(editing.name)}.</p>` : ""}
        </div>

        <div>
          <label for="ing-unit">Unit</label>
          <select id="ing-unit">
            <option value="tsp">tsp</option>
            <option value="tbsp">tbsp</option>
            <option value="cup">cup</option>
            <option value="ml">ml</option>
            <option value="g">g</option>
            <option value="oz">oz</option>
          </select>
        </div>

        <div class="actions">
          <button type="submit" class="btn btn-success">${submit_text}</button>
          ${cancel_button_html}
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Pantry</h2>
      <div>
        <label for="ingredient-filter">Search</label>
        <input type="text" id="ingredient-filter" placeholder="Filter by name..." value="${escapeHtml(state.ingredient_filter)}" />
      </div>
      <div id="ingredient-list"></div>
    </section>
  `;
}

// attachIngredientListeners()
// Called after renderIngredients() writes fresh HTML into #app. Wires up
// all the event listeners on the newly-created form elements.
function attachIngredientListeners() {
  // Grab the form and wire up its submit handler.
  const form = document.getElementById("add-ingredient-form");
  form.addEventListener("submit", handleAddIngredient);

  // The type dropdown only exists in add mode, so guard before touching it.
  const type_select = document.getElementById("ing-type");
  if (type_select) {
    // When type changes, show or hide the unit field.
    type_select.addEventListener("change", handleTypeChange);
    // Also run once on render so the unit field starts in the right state.
    handleTypeChange();
  }

  // Cancel button only exists in top-up mode.
  const cancel_btn = document.getElementById("cancel-edit-btn");
  if (cancel_btn) {
    cancel_btn.addEventListener("click", () => {
      // Clear editing_id to drop back to add mode and re-render.
      state.editing_id = null;
      render();
    });
  }

  // Filter input wires up a real-time search that rebuilds only the list.
  const filter_input = document.getElementById("ingredient-filter");
  if (filter_input) {
    filter_input.addEventListener("input", (event) => {
      // Save the new filter text into state.
      state.ingredient_filter = event.target.value;
      // Instead of calling render() (which would destroy the input and lose
      // the cursor), rebuild only the list container. The input stays alive
      // and the user keeps typing smoothly.
      const list_container = document.getElementById("ingredient-list");
      list_container.innerHTML = "";
      list_container.appendChild(renderIngredientList());
    });
  }
}

// handleDeleteIngredient()
// Removes an ingredient from the pantry, saves, flashes, and re-renders.
function handleDeleteIngredient(id) {
  // Look up the ingredient FIRST so we can use its name in the flash later.
  const ing = state.ingredients.find((i) => i.id === id);
  // filter() builds a new array containing every ingredient that isn't the target.
  state.ingredients = state.ingredients.filter((i) => i.id !== id);
  // Persist the new (shorter) array to localStorage.
  saveState();
  // Show a confirmation, but only if we found the ingredient (defensive).
  if (ing) flash(`Removed ${ing.name}.`);
  // Redraw the view with the updated pantry.
  render();
}

// handleTypeChange()
// Show or hide the unit dropdown based on whether the ingredient is
// measured or discrete. Discrete items like eggs don't need a unit.
function handleTypeChange() {
  // The type dropdown doesn't exist in top-up mode, so bail if missing.
  const type_el = document.getElementById("ing-type");
  if (!type_el) return;

  // Read the current type value.
  const type = type_el.value;
  // Walk up to the <div> that wraps the unit dropdown AND its label,
  // so hiding hides both together.
  const unitField = document.getElementById("ing-unit").parentElement;

  // Hide for discrete, show for measured. Empty string restores the default display.
  if (type === "discrete") {
    unitField.style.display = "none";
  } else {
    unitField.style.display = "";
  }
}

// handleAddIngredient()
// The form submit handler for BOTH adding new ingredients and topping up
// existing ones. The mode depends on state.editing_id.
function handleAddIngredient(event) {
  // Prevent the browser's default form submit behavior (which would reload
  // the page and wipe our SPA state).
  event.preventDefault();

  // Read the always-present fields. parseFloat turns the string from the
  // input into an actual number (returns NaN if the input was invalid).
  const qty = parseFloat(document.getElementById("ing-qty").value);
  const unit = document.getElementById("ing-unit").value;

  // Guard: qty must be a real, non-negative number.
  if (isNaN(qty) || qty < 0) {
    flash("Please enter a valid quantity.", "error");
    return;
  }

  // --------------- TOP UP MODE ---------------
  if (state.editing_id) {
    // Look up the ingredient by id.
    const ing = state.ingredients.find((i) => i.id === state.editing_id);
    // Defensive: if it was deleted in another tab, bail out cleanly.
    if (!ing) {
      state.editing_id = null;
      render();
      return;
    }

    // Figure out how much to add, in the ingredient's canonical unit.
    let amount_to_add;
    if (ing.type === "discrete") {
      // Discrete: just a whole-number count, no conversion needed.
      amount_to_add = Math.round(qty);
    } else {
      // Measured: convert the user's input unit to the ingredient's canonical unit.
      const converted = convert(qty, unit, ing.canonical_unit);
      // Null means the units were incompatible (e.g. g → cup).
      if (converted === null) {
        flash(
          `Can't convert ${unit} to ${ing.canonical_unit}. Incompatible units.`,
          "error",
        );
        return;
      }
      amount_to_add = converted;
    }

    // Add to the pantry.
    ing.canonical_qty += amount_to_add;
    // Exit top-up mode so the form goes back to add mode.
    state.editing_id = null;
    // Persist and notify.
    saveState();
    flash(`Topped up ${ing.name}.`);
    render();
    return;
  }

  // --------------- ADD MODE ---------------
  // Read the fields that only exist in add mode.
  const name = document.getElementById("ing-name").value.trim();
  const type = document.getElementById("ing-type").value;

  // Name is required.
  if (!name) {
    flash("Please enter a name.", "error");
    return;
  }

  // Build the new ingredient object.
  const new_ingredient = {
    // Browser-native UUID generator. No collisions ever.
    id: crypto.randomUUID(),
    name: name,
    type: type,
    // Discrete gets an integer count, measured keeps its decimal qty.
    canonical_qty: type === "discrete" ? Math.round(qty) : qty,
    // Discrete always stores unit "unit" (ignoring whatever the dropdown said).
    canonical_unit: type === "discrete" ? "unit" : unit,
  };

  // Append to the pantry, save, notify, re-render.
  state.ingredients.push(new_ingredient);
  saveState();
  flash(`Added ${new_ingredient.name} to your pantry.`);
  render();
}

// ----------------------------------------------------------------------------
// RECIPES LIST VIEW
// ----------------------------------------------------------------------------

// renderRecipes()
// Static shell of the recipes view. Empty #recipe-list gets filled by
// renderRecipeList in a separate step.
function renderRecipes() {
  return `
    <section class="card">
      <h2>Recipes</h2>
      <button id="new-recipe-btn" class="btn btn-success">+ New Recipe</button>
    </section>

    <section class="card">
      <h2>Saved Recipes</h2>
      <div id="recipe-list"></div>
    </section>
  `;
}

// renderRecipeList()
// Builds the recipes list as DOM nodes. Same XSS-safe pattern as renderIngredientList.
function renderRecipeList() {
  const container = document.createElement("div");

  // Empty state if no recipes yet.
  if (state.recipes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No recipes yet. Click '+ New Recipe' to create one.";
    container.appendChild(empty);
    return container;
  }

  // Walk each recipe and build its list item.
  state.recipes.forEach((recipe) => {
    const item = document.createElement("div");
    item.className = "list-item";

    const row = document.createElement("div");
    row.className = "list-row";

    // Left side: name + ingredient count.
    const info = document.createElement("div");

    const name = document.createElement("strong");
    // textContent for XSS safety.
    name.textContent = recipe.name;

    // Short meta line showing how many ingredients this recipe uses.
    const meta = document.createElement("div");
    meta.className = "muted";
    // Defensive: recipe.items might be undefined on old data.
    const count = recipe.items ? recipe.items.length : 0;
    // Pluralize "ingredient" vs "ingredients" based on count.
    meta.textContent = `${count} ${count === 1 ? "ingredient" : "ingredients"}`;

    info.appendChild(name);
    info.appendChild(meta);

    // Right side: View / Edit / Delete buttons.
    const actions = document.createElement("div");
    actions.className = "actions";

    // View button switches to the detail view.
    const view_btn = document.createElement("button");
    view_btn.className = "btn btn-small";
    view_btn.textContent = "View";
    view_btn.addEventListener("click", () => {
      state.current_view = "recipe_detail";
      state.current_recipe_id = recipe.id;
      // Always reset scale to 1x when opening a recipe.
      state.recipe_scale = 1;
      render();
    });

    // Edit button opens the recipe form pre-filled with this recipe's data.
    const edit_btn = document.createElement("button");
    edit_btn.className = "btn btn-small btn-secondary";
    edit_btn.textContent = "Edit";
    edit_btn.addEventListener("click", () => {
      state.current_view = "recipe_form";
      state.editing_recipe_id = recipe.id;
      // initRecipeForm populates recipe_form_items with a copy of the recipe's items.
      initRecipeForm();
      render();
    });

    // Delete button.
    const delete_btn = document.createElement("button");
    delete_btn.className = "btn btn-danger btn-small";
    delete_btn.textContent = "Delete";
    delete_btn.addEventListener("click", () => {
      handleDeleteRecipe(recipe.id);
    });

    // Assemble.
    actions.appendChild(view_btn);
    actions.appendChild(edit_btn);
    actions.appendChild(delete_btn);
    row.appendChild(info);
    row.appendChild(actions);
    item.appendChild(row);
    container.appendChild(item);
  });

  return container;
}

// attachRecipeListeners()
// Wires up the "+ New Recipe" button on the recipes list view.
function attachRecipeListeners() {
  const new_btn = document.getElementById("new-recipe-btn");
  new_btn.addEventListener("click", () => {
    // Guard: can't build a recipe if there are no ingredients to reference.
    if (state.ingredients.length === 0) {
      flash("Add some ingredients to your pantry first.", "error");
      return;
    }
    // Switch to recipe form in create mode.
    state.current_view = "recipe_form";
    state.editing_recipe_id = null;
    initRecipeForm();
    render();
  });
}

// handleDeleteRecipe()
// Same pattern as handleDeleteIngredient: look up, filter out, save, flash, render.
function handleDeleteRecipe(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  state.recipes = state.recipes.filter((r) => r.id !== id);
  saveState();
  if (recipe) flash(`Deleted ${recipe.name}.`);
  render();
}

// ----------------------------------------------------------------------------
// RECIPE FORM (CREATE / EDIT)
// ----------------------------------------------------------------------------

// initRecipeForm()
// Called when the user opens the recipe form. Sets up recipe_form_items —
// the in-progress list of ingredient rows — based on whether we're editing
// an existing recipe or creating a new one.
function initRecipeForm() {
  if (state.editing_recipe_id) {
    // Edit mode: find the existing recipe.
    const recipe = state.recipes.find((r) => r.id === state.editing_recipe_id);
    // Make a COPY of each item using spread syntax ({ ...it }). This way,
    // edits in the form don't mutate the saved recipe until the user clicks Save.
    state.recipe_form_items = recipe
      ? recipe.items.map((it) => ({ ...it }))
      : [];
  } else {
    // Create mode: start with one default row so the user sees the structure.
    state.recipe_form_items = [
      { ingredient_id: state.ingredients[0].id, quantity: 1, unit: "unit" },
    ];
  }
}

// renderRecipeForm()
// Static shell of the recipe form. Dynamic ingredient rows are built
// separately by renderRecipeItems.
function renderRecipeForm() {
  // Look up the recipe being edited, if any.
  const editing = state.editing_recipe_id
    ? state.recipes.find((r) => r.id === state.editing_recipe_id)
    : null;

  // Title changes based on mode. escapeHtml because user data in template literal.
  const title = editing
    ? `Edit Recipe: ${escapeHtml(editing.name)}`
    : "New Recipe";

  // Pre-fill form values if editing. All go through escapeHtml because they're
  // user data landing in a template literal.
  const name_value = editing ? escapeHtml(editing.name) : "";
  const instructions_value = editing ? escapeHtml(editing.instructions) : "";
  const image_value =
    editing && editing.image_url ? escapeHtml(editing.image_url) : "";

  // Build the full HTML.
  return `
    <section class="card">
      <h2>${title}</h2>
      <form id="recipe-form">
        <div>
          <label for="recipe-name">Name</label>
          <input type="text" id="recipe-name" value="${name_value}" required />
        </div>

        <div>
          <label for="recipe-instructions">Instructions</label>
          <textarea id="recipe-instructions" required>${instructions_value}</textarea>
        </div>

        <div>
          <label for="recipe-image">Image URL (optional)</label>
          <input type="text" id="recipe-image" value="${image_value}" placeholder="https://..." />
          <p class="tip">Leave blank for no image.</p>
        </div>

        <div>
          <label>Ingredients</label>
          <div id="recipe-items-container"></div>
          <button type="button" id="add-recipe-item-btn" class="btn btn-secondary btn-small">+ Add Ingredient</button>
        </div>

        <div class="actions">
          <button type="submit" class="btn btn-success">Save Recipe</button>
          <button type="button" id="cancel-recipe-btn" class="btn btn-secondary">Cancel</button>
        </div>
      </form>
    </section>
  `;
}

// renderRecipeItems()
// Builds the dynamic ingredient rows inside the recipe form. Each row has
// an ingredient dropdown, a quantity input, a unit dropdown, and a remove button.
function renderRecipeItems() {
  const container = document.createElement("div");

  // Empty state — shouldn't normally happen because initRecipeForm starts
  // with one default row, but guard anyway.
  if (state.recipe_form_items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      "No ingredients added yet. Click '+ Add Ingredient' below.";
    container.appendChild(empty);
    return container;
  }

  // Walk each in-progress row. The `index` is needed so handlers know which
  // array slot to mutate when the user types or clicks.
  state.recipe_form_items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "ingredient-row";

    // ---------- Ingredient dropdown ----------
    const ing_select = document.createElement("select");
    // Fill the dropdown with every pantry ingredient.
    state.ingredients.forEach((ing) => {
      const opt = document.createElement("option");
      // value = id so we can identify which one was picked.
      opt.value = ing.id;
      // textContent = name (XSS-safe).
      opt.textContent = ing.name;
      // Pre-select the currently-chosen ingredient.
      if (ing.id === item.ingredient_id) opt.selected = true;
      ing_select.appendChild(opt);
    });
    // When the user picks a different ingredient:
    ing_select.addEventListener("change", () => {
      // Update this row's ingredient id in state.
      state.recipe_form_items[index].ingredient_id = ing_select.value;
      // If the new ingredient is discrete, force the unit to "unit".
      const picked = state.ingredients.find((i) => i.id === ing_select.value);
      if (picked && picked.type === "discrete") {
        state.recipe_form_items[index].unit = "unit";
      }
      // Re-render the rows so the unit dropdown reflects the new lock state.
      rerenderRecipeItems();
    });

    // ---------- Quantity input ----------
    const qty_input = document.createElement("input");
    qty_input.type = "number";
    qty_input.step = "0.01";
    qty_input.min = "0";
    qty_input.value = item.quantity;
    // Every keystroke updates state — that way if the user adds/removes rows,
    // their typed values survive the re-render.
    qty_input.addEventListener("input", () => {
      // `|| 0` handles an empty input (parseFloat returns NaN, which is falsy).
      state.recipe_form_items[index].quantity =
        parseFloat(qty_input.value) || 0;
    });

    // ---------- Unit dropdown ----------
    // Check whether the currently-picked ingredient is discrete.
    const picked_ing = state.ingredients.find(
      (i) => i.id === item.ingredient_id,
    );
    const is_discrete = picked_ing && picked_ing.type === "discrete";

    const unit_select = document.createElement("select");
    // Discrete ingredients only offer "unit". Measured get the full list.
    const unit_options = is_discrete
      ? ["unit"]
      : ["unit", "tsp", "tbsp", "cup", "ml", "g", "oz"];
    unit_options.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      // Pre-select whichever unit is currently saved on this row.
      if (u === item.unit) opt.selected = true;
      unit_select.appendChild(opt);
    });
    // Lock the dropdown (grayed out) for discrete ingredients.
    if (is_discrete) unit_select.disabled = true;
    unit_select.addEventListener("change", () => {
      state.recipe_form_items[index].unit = unit_select.value;
    });

    // ---------- Remove button ----------
    const remove_btn = document.createElement("button");
    // type="button" stops it from accidentally submitting the form.
    remove_btn.type = "button";
    remove_btn.className = "btn btn-danger btn-small";
    remove_btn.textContent = "✕";
    remove_btn.addEventListener("click", () => {
      // splice(index, 1) removes this row from the state array in place.
      state.recipe_form_items.splice(index, 1);
      rerenderRecipeItems();
    });

    // Assemble the row.
    row.appendChild(ing_select);
    row.appendChild(qty_input);
    row.appendChild(unit_select);
    row.appendChild(remove_btn);
    container.appendChild(row);
  });

  return container;
}

// rerenderRecipeItems()
// Re-render just the ingredient rows without touching the rest of the form.
// This preserves whatever the user has typed in the name/instructions/image
// fields (those values live in the DOM, not in state, so a full render()
// would wipe them).
function rerenderRecipeItems() {
  const container = document.getElementById("recipe-items-container");
  // Clear the old rows.
  container.innerHTML = "";
  // Append freshly-built ones.
  container.appendChild(renderRecipeItems());
}

// attachRecipeFormListeners()
// Wires up the recipe form's submit, + Add Ingredient, and Cancel buttons.
function attachRecipeFormListeners() {
  const form = document.getElementById("recipe-form");
  form.addEventListener("submit", handleSaveRecipe);

  // + Add Ingredient button appends a new default row to state.
  const add_item_btn = document.getElementById("add-recipe-item-btn");
  add_item_btn.addEventListener("click", () => {
    // Default the new row based on the first pantry ingredient's type.
    const first = state.ingredients[0];
    state.recipe_form_items.push({
      ingredient_id: first.id,
      quantity: 1,
      unit: first.type === "discrete" ? "unit" : "cup",
    });
    // Re-render rows only so name/instructions stay.
    rerenderRecipeItems();
  });

  // Cancel drops all in-progress work and returns to the recipes list.
  const cancel_btn = document.getElementById("cancel-recipe-btn");
  cancel_btn.addEventListener("click", () => {
    state.current_view = "recipes";
    state.editing_recipe_id = null;
    state.recipe_form_items = [];
    render();
  });
}

// handleSaveRecipe()
// Form submit handler. Validates the form, then creates a new recipe or
// updates an existing one depending on state.editing_recipe_id.
function handleSaveRecipe(event) {
  // Stop the browser's default form submit (page reload).
  event.preventDefault();

  // Read the always-present fields and trim whitespace.
  const name = document.getElementById("recipe-name").value.trim();
  const instructions = document
    .getElementById("recipe-instructions")
    .value.trim();
  const image_url = document.getElementById("recipe-image").value.trim();

  // Both name and instructions are required.
  if (!name || !instructions) {
    flash("Please fill in the name and instructions.", "error");
    return;
  }

  // If an image URL was provided, enforce http/https scheme. This blocks
  // dangerous schemes like javascript: that could inject code via <img>.
  if (
    image_url &&
    !image_url.startsWith("http://") &&
    !image_url.startsWith("https://")
  ) {
    flash("Image URL must start with http:// or https://", "error");
    return;
  }

  // Shallow-copy every item so the saved recipe doesn't share references
  // with state.recipe_form_items. Otherwise reopening the form would
  // silently mutate the saved recipe.
  const items = state.recipe_form_items.map((it) => ({ ...it }));

  // Remember whether this is an edit BEFORE we reset editing_recipe_id,
  // so we can show the right flash message later.
  const was_editing = !!state.editing_recipe_id;

  if (state.editing_recipe_id) {
    // EDIT MODE: find the existing recipe and overwrite its fields in place.
    const recipe = state.recipes.find((r) => r.id === state.editing_recipe_id);
    recipe.name = name;
    recipe.instructions = instructions;
    recipe.image_url = image_url;
    recipe.items = items;
  } else {
    // CREATE MODE: push a brand new recipe with a fresh UUID.
    state.recipes.push({
      id: crypto.randomUUID(),
      name: name,
      instructions: instructions,
      image_url: image_url,
      items: items,
    });
  }

  // Clean up form state and return to the recipes list.
  state.current_view = "recipes";
  state.editing_recipe_id = null;
  state.recipe_form_items = [];
  saveState();
  flash(was_editing ? "Recipe updated." : "Recipe saved.");
  render();
}

// ----------------------------------------------------------------------------
// RECIPE DETAIL VIEW
// ----------------------------------------------------------------------------

// renderRecipeDetail()
// Builds the static shell of the recipe detail view: header, image, scale
// buttons, empty containers for ingredients and instructions, and the cook button.
function renderRecipeDetail(id) {
  const recipe = state.recipes.find((r) => r.id === id);

  // Graceful fallback if the recipe was deleted between clicking View and rendering.
  if (!recipe) {
    return `
      <section class="card">
        <h2>Recipe not found</h2>
        <p class="muted">This recipe may have been deleted.</p>
        <button class="btn" id="back-to-recipes-btn">Back to Recipes</button>
      </section>
    `;
  }

  // Optional image. onerror hides the <img> if the URL is broken, so the
  // layout doesn't get a broken-image icon. escapeHtml guards against
  // attribute breakouts even though we already validated the URL at save time.
  const image_html = recipe.image_url
    ? `<img src="${escapeHtml(recipe.image_url)}" alt="${escapeHtml(recipe.name)}" class="recipe-image" onerror="this.style.display='none'" />`
    : "";

  return `
    <section class="card">
      <button class="btn btn-secondary btn-small" id="back-to-recipes-btn">← Back</button>
      <h2>${escapeHtml(recipe.name)}</h2>
      ${image_html}

      <div class="scale-buttons">
        <button class="btn btn-small" data-scale="0.5">½×</button>
        <button class="btn btn-small" data-scale="1">1×</button>
        <button class="btn btn-small" data-scale="2">2×</button>
      </div>

      <h3>Ingredients</h3>
      <div id="recipe-detail-items"></div>

      <h3>Instructions</h3>
      <div id="recipe-detail-instructions"></div>

      <button id="cook-recipe-btn" class="btn btn-success">Cook Recipe</button>
    </section>
  `;
}

// checkItemAvailability()
// Given a single recipe item and a scale, determines whether the pantry
// has enough. Returns a structured object so the caller can display a
// specific message or do a specific action. Used by both the detail view
// (for highlighting) and the cook handler (for validation).
function checkItemAvailability(item, scale) {
  // Look up the pantry ingredient this recipe item refers to.
  const pantry_ing = state.ingredients.find((i) => i.id === item.ingredient_id);

  // Failure 1: the ingredient is no longer in the pantry (probably deleted).
  if (!pantry_ing) {
    return {
      ok: false,
      reason: "missing",
      needed_in_canonical: 0,
      pantry_ing: null,
    };
  }

  // Scale the recipe's quantity by the chosen scale (0.5, 1, or 2).
  const scaled_qty = item.quantity * scale;

  // Convert the needed amount into the pantry's canonical unit so we can
  // compare apples to apples. Null means the units are incompatible.
  const needed = convert(scaled_qty, item.unit, pantry_ing.canonical_unit);

  // Failure 2: units are in different families (e.g. recipe asks for 100g
  // but flour is stored in cups).
  if (needed === null) {
    return {
      ok: false,
      reason: "incompatible_unit",
      needed_in_canonical: 0,
      pantry_ing,
    };
  }

  // Failure 3: units work fine, but we don't have enough.
  if (pantry_ing.canonical_qty < needed) {
    return {
      ok: false,
      reason: "insufficient",
      needed_in_canonical: needed,
      pantry_ing,
    };
  }

  // Success: have enough. Return the needed amount too so callers don't
  // have to recompute the conversion.
  return { ok: true, reason: null, needed_in_canonical: needed, pantry_ing };
}

// handleCookRecipe()
// Attempts to cook a recipe at the current scale. Uses a two-phase pattern:
// validate everything first, then deduct only if everything passed. This
// avoids the "half-cooked meal" bug where a failure partway through would
// leave the pantry in a weird half-deducted state.
function handleCookRecipe(recipe) {
  // Phase 1: walk every item and collect problems into an array.
  // Don't mutate anything yet.
  const problems = [];
  recipe.items.forEach((item) => {
    const status = checkItemAvailability(item, state.recipe_scale);
    if (!status.ok) {
      // Pick a human-readable name, falling back if the pantry ingredient was deleted.
      const name = status.pantry_ing
        ? status.pantry_ing.name
        : "(deleted ingredient)";

      // Three different failure reasons get three different messages.
      if (status.reason === "missing") {
        problems.push(`${name} is no longer in your pantry.`);
      } else if (status.reason === "incompatible_unit") {
        problems.push(
          `${name}: can't convert ${item.unit} to ${status.pantry_ing.canonical_unit}.`,
        );
      } else if (status.reason === "insufficient") {
        problems.push(`Not enough ${name}.`);
      }
    }
  });

  // If any problem was found, bail out completely. Nothing gets deducted.
  if (problems.length > 0) {
    flash("Can't cook: " + problems.join(" "), "error");
    return;
  }

  // Phase 2: deduct. We know every item is satisfiable because phase 1 passed.
  recipe.items.forEach((item) => {
    const status = checkItemAvailability(item, state.recipe_scale);
    // Subtract the converted needed amount from the pantry.
    status.pantry_ing.canonical_qty -= status.needed_in_canonical;
    // Floating-point safety: if subtraction slipped slightly negative,
    // clamp to 0 per the spec's "stay >= 0" rule.
    if (status.pantry_ing.canonical_qty < 0) {
      status.pantry_ing.canonical_qty = 0;
    }
  });

  // Save, notify, re-render.
  saveState();
  flash("Meal cooked — pantry updated!");
  render();
}

// renderRecipeDetailItems()
// Builds the ingredient list inside the recipe detail view. Shows each
// ingredient with its scaled needed amount and the current pantry status.
// Insufficient items get red + bold highlighting via the .insufficient class.
function renderRecipeDetailItems(recipe) {
  const container = document.createElement("div");

  // Guard: empty recipe (shouldn't normally happen, but defensive).
  if (!recipe.items || recipe.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "This recipe has no ingredients.";
    container.appendChild(empty);
    return container;
  }

  // Walk every item in the recipe.
  recipe.items.forEach((item) => {
    // Check availability at the current scale.
    const status = checkItemAvailability(item, state.recipe_scale);
    // Compute the scaled qty for display.
    const scaled_qty = item.quantity * state.recipe_scale;

    const row = document.createElement("div");
    row.className = "list-item";

    // ---------- Line 1: ingredient name + needed qty/unit ----------
    const main_line = document.createElement("div");

    const name_el = document.createElement("strong");
    // Use the pantry ingredient's name, or a fallback if it was deleted.
    name_el.textContent = status.pantry_ing
      ? status.pantry_ing.name
      : "(deleted ingredient)";

    // The " — 2 cup" part of the line.
    const needed_el = document.createElement("span");
    needed_el.textContent = ` — ${formatQty(scaled_qty)} ${item.unit}`;

    // If the item isn't satisfied, paint name and qty red with the CSS class.
    if (!status.ok) {
      name_el.classList.add("insufficient");
      needed_el.classList.add("insufficient");
    }

    main_line.appendChild(name_el);
    main_line.appendChild(needed_el);

    // ---------- Line 2: pantry status ----------
    const status_line = document.createElement("div");
    status_line.className = "muted";

    // Three different status messages depending on the failure reason.
    if (status.reason === "missing") {
      status_line.textContent = "This ingredient is no longer in your pantry.";
    } else if (status.reason === "incompatible_unit") {
      status_line.textContent = `Unit mismatch: recipe uses ${item.unit} but pantry stores ${status.pantry_ing.canonical_unit}.`;
    } else {
      // Either ok or insufficient — either way, show "Have X" so the user
      // can see how much is in the pantry vs. how much is needed.
      const have_qty = formatQty(status.pantry_ing.canonical_qty);
      // Pluralize unit for discrete items.
      const have_unit =
        status.pantry_ing.type === "discrete"
          ? status.pantry_ing.canonical_qty === 1
            ? "unit"
            : "units"
          : status.pantry_ing.canonical_unit;
      status_line.textContent = `Have ${have_qty} ${have_unit} in pantry`;
    }

    row.appendChild(main_line);
    row.appendChild(status_line);
    container.appendChild(row);
  });

  return container;
}

// ============================================================================
// INITIALIZATION
// ============================================================================
// Runs once on page load. Wires up the nav buttons (which live outside #app
// so they survive re-renders), loads saved data, and draws the initial view.
// ============================================================================

// Home nav button.
document.getElementById("nav-home").addEventListener("click", () => {
  state.current_view = "home";
  render();
});

// Ingredients nav button.
document.getElementById("nav-ingredients").addEventListener("click", () => {
  state.current_view = "ingredients";
  render();
});

// Recipes nav button.
document.getElementById("nav-recipes").addEventListener("click", () => {
  state.current_view = "recipes";
  render();
});

// Boot sequence: pull saved data in, then draw whatever state.current_view
// is set to (starts as "home").
loadState();
render();
